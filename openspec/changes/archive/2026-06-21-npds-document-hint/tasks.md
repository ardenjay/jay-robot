## 1. NPDS 文件目錄模組（已完成）

- [x] 1.1 建立 `src/config/npds-catalog.js`，儲存 C1–C7 所有文件的代碼、名稱、說明
- [x] 1.2 實作 `formatCatalogForPrompt()` helper，將目錄轉為純文字清單供 prompt 使用

## 2. Retrieval Service 更新

- [x] 2.1 在 `src/services/retrieval.js` 引入 `npds-catalog.js` 的 `formatCatalogForPrompt`
- [x] 2.2 更新 `buildPrompt()`：在文件內容區塊之後加入「NPDS 文件目錄」參考區塊，並加入明確指令說明目錄用途（當無法回答時指名具體文件代碼 + 名稱）
- [x] 2.3 移除舊的 `missingPhases` 字串拼接邏輯，改由 LLM 根據目錄自行推理

## 3. 驗收

- [ ] 3.1 啟動 `npm start`，建立測試專案，只上傳 C1 相關文件
- [ ] 3.2 詢問 EMI 測試相關問題，確認 LLM 提示包含具體文件代碼（如 C471）與名稱
- [ ] 3.3 詢問可靠度測試相關問題，確認 LLM 提示 C489 可靠度測試報告（C4 DVT 試作）
- [ ] 3.4 上傳完整文件後再次詢問，確認 LLM 正常回答，不再出現補傳提示
- [x] 3.5 執行 `npm test`，確認 8 個測試仍全部通過
