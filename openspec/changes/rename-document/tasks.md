## 1. Adapter

- [x] 1.1 `src/adapters/vector/sqlite.js`:`renameDocument(projectId, oldDocId, newDocId)` — transaction(chunks UPDATE + 該批 FTS delete/insert 含新檔名文本),回傳筆數
- [x] 1.2 測試(temp DB):改名後 hybridSearch 以新檔名詞可命中、舊檔名詞不命中;不存在回 0

## 2. Route

- [x] 2.1 `src/routes/projects.js`:`PATCH /:id/documents/:docId/rename`(blockWhenReadOnly)— 驗證(空/`/`/`\`/`..` → 400;同名 no-op 200;與他文件重複或目標路徑已存在 → 409;DB 無此文件 404);DB 成功後 fs.rename 持久化(來源不存在僅 log;自癒:DB 已是新名且舊磁碟路徑存在 → 只補搬移)
- [x] 2.2 測試(chdir temp + 真 router):成功(DB+磁碟都改,檔案型與目錄型)、409、400、403、404、磁碟無來源仍 200

## 3. 前端

- [x] 3.1 `public/index.html`:文件樹每列加 ✏️ 改名鈕(與 del/move 同排、READ_ONLY 隱藏),prompt 預填舊名 → PATCH → 成功 loadDocTree(),失敗 alert 錯誤

## 4. 驗證

- [x] 4.1 `npm test` 全綠;不碰真實 `data/rag.db`
- [x] 4.2 使用者驗收:UI 改名 → 樹更新、來源可開、新檔名關鍵字提問可命中(驗收通過前不 commit)
