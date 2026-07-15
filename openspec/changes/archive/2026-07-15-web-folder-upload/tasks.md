## 1. 後端 route

- [x] 1.1 `src/routes/upload.js`:`POST /api/upload/folder`(blockWhenReadOnly)— multer `.array('files')`(diskStorage 隨機檔名;limits 單檔 50MB/300 檔),`paths` 同序欄位;長度不一致 400
- [x] 1.2 路徑處理:每條 path 過 `fixLatin1Mojibake` → 正規化;`..`/絕對路徑/跳出暫存根 → 整批 400;docId = 第一段資料夾名
- [x] 1.2b 檢查:副檔名白名單(違規 400 列檔名);同名 docId 未帶 overwrite → 409
- [x] 1.3 暫存重建目錄樹 → `resolvePhase`(body.phase 優先,否則 `phaseFromFolderName`,皆無 400)→ 呼叫 `ingestFolder` → 回 `{docId, mdCount, chunkCount, imageCount}`;finally 清理暫存
- [x] 1.4 測試(temp docsRoot + temp DB + mock LLM,經 HTTP):成功進料(含子資料夾圖)、缺 PDF 400、路徑穿越 400、白名單違規 400、覆蓋 409/帶旗標成功替換、phase 無法解析 400、READ_ONLY 403、paths/files 長度不符 400

## 2. 前端

- [x] 2.1 `public/index.html`:上傳區加「上傳資料夾」入口(`webkitdirectory`),選完即驗(恰好一個頂層 PDF、至少一頂層 md、白名單,違規列檔名不上傳),FormData 送 files+paths+project_id+phase;409 → 覆蓋確認後帶 overwrite 重送;成功後刷新文件樹與結果訊息;READ_ONLY 隨上傳區隱藏

## 3. 驗證

- [x] 3.1 `npm test` 全綠;不碰真實 `data/rag.db`
- [x] 3.2 使用者驗收:瀏覽器選真實資料夾(md+images+pdf)上傳,文件樹/來源看圖/下載 PDF 正常(驗收通過前不 commit)
