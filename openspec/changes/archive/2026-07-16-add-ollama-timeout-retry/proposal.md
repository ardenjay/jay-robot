# Ollama adapter: request timeout + transient-failure retry

## Why

長時間連續跑（如整晚回歸）時，本機 Ollama 在 GPU 高負載下會偶發**連線層暫時性失敗**（`fetch failed`）——伺服器沒崩（journal 無重啟），只是那一個請求被拒/重置。目前 `ollama.js` 的請求**完全沒有 timeout**：一個卡住的請求會無限期掛著，拖垮整個流程；連線瞬斷也沒有自動重試，直接往上拋。

這不是 429 配額問題（本機無配額），是純基礎設施瞬斷。adapter 層自癒能大幅提升長跑穩定度，跟 eval 層已有的每題重試形成雙保險。

## What Changes

- `OllamaAdapter` 的非串流請求（`generate`、`chatWithTools`、`embedBatch`）SHALL 加上：
  - **timeout**（AbortController，預設 120s，可用 `OLLAMA_TIMEOUT_MS` 覆寫）：卡住的請求逾時中止，不再無限掛著。
  - **重試**（預設 2 次，可用 `OLLAMA_MAX_RETRIES` 覆寫）：**僅對連線層瞬斷與 timeout、以及 5xx 重試**，退避數秒；**4xx（如 model not found）不重試**（是確定性錯誤）。
- 既有錯誤訊息（含 URL + `ollama serve` 指引、`ollama pull` 提示）維持不變。串流 `stream()`（互動 UI）本次不改。

## Impact

- Affected specs: `llm-adapter`（MODIFIED「Ollama connection errors are actionable」）
- Affected code: `src/adapters/llm/ollama.js`、`tests/ollama-adapter.test.js`
- 低風險：正常請求行為不變（成功即回）；只有瞬斷/逾時才多重試幾次。
