## 1. 編號擷取工具

- [x] 1.1 在 `src/services/retrieval.js`（或就近的小工具）新增 `extractNpdsCode(name)`：以正則 `/C[1-7]\d{2,}/i` 擷取檔名中的 NPDS 編號，回傳大寫字串，取不到回傳 `null`

## 2. 查詢流程取得已上傳編號

- [x] 2.1 在 `answer()` 檢索後呼叫 `vectorStore.listDocuments(projectId)`，將每筆 `docId` 經 `extractNpdsCode` 轉換、濾掉 `null`、去重，組成已上傳編號集合（大寫）
- [x] 2.2 將已上傳編號集合一路傳到 `buildPrompt` → `formatCatalogForPrompt(excludeCodes)`

## 3. 目錄組裝更新（移除已上傳編號）

- [x] 3.1 `formatCatalogForPrompt(excludeCodes)` 新增可選參數：輸出時跳過 `code`（大寫比對）落在 `excludeCodes` 的文件項
- [x] 3.2 若某階段所有文件都被排除，連同階段標題一併略過
- [x] 3.3 `excludeCodes` 為空/未傳時，輸出與現狀完全相同（向後相容）

## 4. 驗收

- [x] 4.1 啟動 `npm start`，上傳一份檔名含 `C560` 的文件，詢問需 C560 的問題（使答案不足），確認回答不再建議上傳 C560
- [x] 4.2 詢問需 C602（未上傳）的問題，確認仍正常建議上傳 C602
- [x] 4.3 上傳檔名不含編號的文件，確認查詢行為正常、不報錯
- [x] 4.4 空專案查詢，確認 prompt 不含已上傳編號區塊、行為與原本相同
- [x] 4.5 執行 `npm test`，確認現有測試全部通過
