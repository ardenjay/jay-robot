## 1. Adapter 介面與 Gemini 實作

- [x] 1.1 `src/adapters/llm/base.js` 新增 `embedBatch(texts)` 抽象方法（未實作時拋 NotImplementedError）
- [x] 1.2 `src/adapters/llm/gemini.js` 實作 `embedBatch(texts)`：用 `model.batchEmbedContents({ requests: texts.map(t => ({ content: { parts: [{ text: t }] } })) })`，回傳 `result.embeddings.map(e => e.values)`（與輸入同序），整批包在 `withBackoff` 內

## 2. 強化 withBackoff

- [x] 2.1 提高重試次數（`MAX_RETRIES` 由 3 提高，如 5）
- [x] 2.2 429 時解析 `err.errorDetails` 中 `RetryInfo` 的 `retryDelay`（如 `"17s"`）作為等待秒數；無則用指數退避 `2^attempt` 秒
- [x] 2.3 等待時間設上限（如 60 秒）

## 3. ingestion 改批次

- [x] 3.1 `src/services/ingestion.js` 新增 `BATCH_SIZE`（如 100）常數
- [x] 3.2 將 `rawChunks` 依 `BATCH_SIZE` 切片，逐批 `await adapter.embedBatch(slice.map(c => c.text))`
- [x] 3.3 將每批回傳向量與對應 chunk 組成 `embeddedChunks`（保持原 metadata 結構），再 `store.clear` + `store.add`

## 4. 驗收

- [x] 4.1 啟動 `npm start`，上傳一份大型 PDF（多頁、多 chunk），確認 ingestion 完成、不再因 429 整份失敗
- [x] 4.2 確認 chunk 數與儲存結果正確（向量數 = chunk 數，順序對應）
- [x] 4.3 查詢該文件，確認檢索與回答正常（向量維度一致）
- [x] 4.4 執行 `npm test`，確認現有測試全部通過
