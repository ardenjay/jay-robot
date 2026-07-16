## 1. 實作

- [x] 1.1 `OllamaAdapter` 建構子讀取 `timeoutMs`(OLLAMA_TIMEOUT_MS/120000)、`maxRetries`(OLLAMA_MAX_RETRIES/2)、`retryDelayMs`(OLLAMA_RETRY_DELAY_MS/2000)，可由 opts 覆寫
- [x] 1.2 新增 `_postJson(path, body)`：AbortController timeout 包住 fetch+res.json()；連線瞬斷/AbortError(逾時)/5xx → 重試(退避)；4xx → 立即拋錯不重試；重試耗盡拋含 URL+ollama serve 指引的錯誤
- [x] 1.3 `generate`／`chatWithTools`／`embedBatch` 改用 `_postJson`；`stream()` 維持 `_post`
- [x] 1.4 保留既有錯誤訊息格式（URL 指引、model not found → ollama pull）

## 2. 單元測試

- [x] 2.1 連線瞬斷第一次失敗、第二次成功 → 自動重試回成功（注入 fetch 計數）
- [x] 2.2 逾時（fetch 永不 resolve）→ AbortController 觸發、重試、最終拋逾時錯誤（timeoutMs/retryDelayMs 用小值）
- [x] 2.3 4xx（model not found）→ 不重試（fetch 只被呼叫一次）、訊息含 ollama pull
- [x] 2.4 5xx → 有重試
- [x] 2.5 既有 embedBatch/chatWithTools/錯誤訊息測試維持通過；`npm test` 全綠

## 3. 驗證

- [x] 3.1 `node scripts/eval-answers.js --smoke` 正常路徑不受影響（成功即回、無多餘延遲）
