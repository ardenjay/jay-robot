## Context

Folder 進料邏輯已完整存在於 `ingestFolder`(src/services/ingestion.js):PDF 驗證、多 md 切塊、wiki-link 圖解析、整夾持久化到 `public/documents/<proj>/<docId>/`、重灌整夾替換。缺的只是「把使用者電腦上的資料夾送到 server」這段運輸;CLI 用 `incoming/` 資料夾當運輸,本 change 用 HTTP multipart 當運輸。單檔上傳已有 multer 基礎與 mojibake 修復(`fixLatin1Mojibake`)。

## Goals / Non-Goals

**Goals:**
- 瀏覽器選資料夾 → 一鍵進料,規則與 CLI 完全一致(同一個 `ingestFolder`)。
- 子資料夾(Obsidian 附件夾)結構原樣保留。
- 中文資料夾/檔名正確;路徑穿越擋掉。

**Non-Goals:**
- 不做 zip 上傳(使用者還得先壓縮,沒有比較省事;且多一個解壓依賴)。
- 不做拖曳資料夾(webkitGetAsEntry 遞迴讀取複雜度高;先用原生資料夾選取,夠用)。
- 不移除 CLI(批次進料、自動化仍走它)。
- 不做上傳進度條(folder 進料無 MinerU,本地 embedding 快;先簡單 JSON 回應)。

## Decisions

1. **前端用 `<input type="file" webkitdirectory>`**:Chrome/Edge/Safari 皆支援,選資料夾後 `file.webkitRelativePath` 帶完整相對路徑(`資料夾名/子夾/圖.jpg`)。FormData 以 `files` 多檔附上,**相對路徑另以同序的 `paths` 欄位傳**(multipart 的 filename 欄位不保證保留路徑)。docId = 相對路徑第一段(資料夾名)。
2. **後端重建暫存資料夾再走既有 `ingestFolder`**:multer `.array('files')` 收檔(diskStorage 隨機檔名避免互撞),依 `paths[i]` 在 `os.tmpdir()` 暫存區重建目錄樹,呼叫 `ingestFolder(tempRoot/<folderName>, { projectId, phase })`,finally 清理暫存。不複製任何進料邏輯 — 驗證(恰好一個 PDF、至少一個 md)、持久化、重灌語意自動一致。
3. **路徑防護**:每個相對路徑先 `fixLatin1Mojibake`(multipart 文字欄位同樣可能被 latin1 誤解)再正規化;含 `..`、開頭 `/`、或 resolve 後跳出暫存根目錄 → 整批 400。
4. **phase 解析順序**:body.phase(下拉)優先 → `phaseFromFolderName(folderName)` → 都沒有回 400(訊息提示選擇階段)。與 CLI 的 resolvePhase 邏輯一致。
5. **三項上傳檢查(使用者指定)**:
   - **選完即驗(前端)**:input change 當下驗「恰好一個頂層 PDF、至少一個頂層 md」(chunkFolderMarkdown 只讀頂層 md,故以頂層為準)與白名單;不合格顯示原因並中止,不發請求。
   - **白名單報錯(前後端)**:允許 .md/.pdf/.jpg/.jpeg/.png/.gif/.webp/.bmp/.svg;出現其他副檔名(.DS_Store、.tmp…)即報錯並列出檔名——依使用者選擇「直接報錯」而非靜默略過,避免使用者不知道什麼被丟掉。
   - **覆蓋確認**:後端查 listDocuments,同名 docId 存在且未帶 `overwrite=true` → 409 回 docId;前端收到 409 跳 confirm,確認後帶旗標重送(重灌=整夾替換,沿用既有語意)。
6. **大小限制**:multer limits 設單檔 50MB / 總數 300 檔,防呆誤選巨大資料夾;超限回 400。

## Risks / Trade-offs

- [瀏覽器對資料夾選取的相容性] → webkitdirectory 為事實標準(Chrome/Edge/Safari/Firefox 皆支援);不支援的環境仍有單檔上傳與 CLI。
- [多檔 multipart 記憶體/磁碟壓力] → diskStorage + 檔數/大小上限;暫存 finally 必清。
- [paths 與 files 順序錯位] → 以同名欄位陣列同序附加(FormData 保序);後端檢查兩者長度一致,不一致 400。
