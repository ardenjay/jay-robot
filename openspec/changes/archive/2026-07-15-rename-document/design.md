## Context

docId 出現在四處:chunks.doc_id、FTS(content_seg 文本含檔名 + doc_id 欄)、持久化路徑 `public/documents/<proj>/<docId>`(檔案型=單檔、目錄型=資料夾)、來源/下載 URL(即時由 docId 組出,前三者對了自然對)。embedding 輸入為「title+內文」,不含檔名。文件樹已有刪除/搬階段按鈕列與 READ_ONLY 隱藏慣例;`resolveDownload`/`resolveDocView` 皆以 docId 找檔。

## Goals / Non-Goals

**Goals:**
- 就地改名:DB、FTS、磁碟一次到位;改完新檔名關鍵字立即可搜。
- 不觸發 reembed / 重灌。

**Non-Goals:**
- 不做改名歷史/undo。
- 不自動保留副檔名(使用者輸入完整新名,前端預填舊名方便小改)。
- 不處理跨專案搬移。

## Decisions

1. **adapter 層 `renameDocument(projectId, oldDocId, newDocId)` 單一交易**:`UPDATE chunks SET doc_id = ? WHERE doc_id = ? AND project_id = ?`;同交易內把該批 chunks 的 FTS 列 DELETE 後以新 doc_id 重 INSERT(content_seg 含檔名,不能只改 doc_id 欄)。回傳更新筆數(0 = 文件不存在 → route 回 404)。
2. **磁碟改名放 route 層**:`fs.renameSync(docsRoot/proj/old, docsRoot/proj/new)`,檔案型與目錄型同一句;來源不存在(舊資料只進 DB 沒持久化)僅記 log 不失敗 — DB 是主體,磁碟是附件。若目標路徑已存在 → 409(避免覆蓋別的文件的持久化)。順序:先 DB 交易成功再動磁碟;磁碟失敗回滾 DB(再 rename 回舊名)成本高、發生率低,採「DB 成功後磁碟失敗 → 回 500 並在訊息註明持久化未搬,請重試」。
3. **驗證規則與上傳一致**:newDocId trim 後非空、不含 `/`、`\`、`..`;與 oldDocId 相同視為 no-op 回 200;與其他既有 docId 重複 → 409。
4. **前端用 `prompt()` 預填舊名**:與現有 confirm 刪除同等級的輕量互動;成功後 `loadDocTree()`。

## Risks / Trade-offs

- [DB 成功、磁碟 rename 失敗 → 短暫不一致] → 回 500 明講狀態;重試 rename 時 DB 端 no-op(名字已是新的)會 404…設計為:重試時若 DB 已是新名,只補磁碟搬移。實作上 route 先查 newDocId 是否已在 DB:是且磁碟舊路徑存在 → 只做磁碟搬移(自癒路徑)。
- [使用者把副檔名改掉(xxx.pdf → xxx)] → 檔案型下載仍以 docId 為檔名,只是副檔名遺失;前端預填舊名降低誤改,不硬性驗證(目錄型本來就沒副檔名)。
