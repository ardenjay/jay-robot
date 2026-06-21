## 1. 準備工作

- [x] 1.1 建立 `tests/` 資料夾
- [x] 1.2 修改 `src/services/ingestion.js`：`ingestFile(filePath, filename, llmAdapter?)` 加入可選的第三個參數，預設使用全域 adapter
- [x] 1.3 在 `package.json` 新增 `"test"` script：`node --test tests/chunker.test.js tests/vector-adapter.test.js tests/ingestion.test.js`

## 2. Chunker Tests

- [x] 2.1 建立 `tests/chunker.test.js`，使用 `node:test` + `node:assert`
- [x] 2.2 測試：含多個標題的文件 → chunk 數量與 title 正確
- [x] 2.3 測試：無標題文件 → 1 個 chunk，title 為 filename
- [x] 2.4 測試：超過 1500 字的 chunk → 被切成多個，每個不超過 1500 字

## 3. Vector Adapter Tests

- [x] 3.1 建立 `tests/vector-adapter.test.js`，每個 test 使用獨立的臨時 DB 路徑（`os.tmpdir()` + random）
- [x] 3.2 測試：add 兩個不同向量的 chunks，search 回傳相似度最高的那個
- [x] 3.3 測試：clear(docId) 後 isEmpty() 為 true，search 回傳空陣列
- [x] 3.4 測試：clear 再 add 同一 docId，search 只回傳新 chunks

## 4. Ingestion Pipeline Tests

- [x] 4.1 建立 `tests/ingestion.test.js`
- [x] 4.2 實作 mock LLM adapter：`embed()` 回傳固定長度（3072）的零向量
- [x] 4.3 使用臨時 SQLite DB 與臨時 .md 測試檔案
- [x] 4.4 測試：ingestFile 回傳正確 chunk 數量，DB 中有對應筆數
- [x] 4.5 測試：同一 docId 重新 ingest，DB 只保留最新的 chunks

## 5. 驗收

- [x] 5.1 執行 `npm test`，確認全部測試通過，exit code 為 0
- [x] 5.2 手動破壞一個 assertion，確認 exit code 非零且輸出顯示失敗測試名稱
