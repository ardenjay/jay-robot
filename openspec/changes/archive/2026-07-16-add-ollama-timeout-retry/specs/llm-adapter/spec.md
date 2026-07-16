## MODIFIED Requirements

### Requirement: Ollama connection errors are actionable
Ollama 無法連線（連線被拒／逾時）時，adapter SHALL 拋出含 base URL 與啟動指引（`ollama serve`）的錯誤；HTTP 錯誤 SHALL 帶回 Ollama 回應的 error 內容（如 model not found 時提示 `ollama pull <model>`）。

非串流請求（`generate`／`chatWithTools`／`embedBatch`）SHALL 設有請求逾時（AbortController，預設 120s，可由 `OLLAMA_TIMEOUT_MS` 覆寫），逾時即中止該請求而非無限等待；逾時涵蓋到取得完整回應 JSON 為止（不只連線建立）。對**連線層瞬斷、逾時、以及 5xx** SHALL 自動重試（預設 2 次，可由 `OLLAMA_MAX_RETRIES` 覆寫，重試間短暫退避）；對 **4xx（如 model not found 等確定性錯誤）SHALL NOT 重試**。adapter SHALL NOT 實作 429 配額退避（本機服務無配額限制）——此處重試針對基礎設施瞬斷，與配額無關。

#### Scenario: Ollama not running
- **WHEN** `OLLAMA_BASE_URL` 指向的服務未啟動
- **THEN** （重試耗盡後）拋出錯誤，訊息含該 URL 與「請確認 ollama serve 已啟動」指引

#### Scenario: Model not pulled
- **WHEN** 指定模型不存在於 Ollama（HTTP 4xx）
- **THEN** 立即拋出錯誤（不重試），訊息含 Ollama 的 error 與 `ollama pull` 提示

#### Scenario: Transient connection drop is retried
- **WHEN** 非串流請求第一次因連線瞬斷（fetch 失敗）而失敗，但下一次即可成功
- **THEN** adapter 自動重試並回傳成功結果，呼叫端無感

#### Scenario: Hung request times out and is retried
- **WHEN** 某次請求逾時（超過 `timeoutMs` 未取得完整回應）
- **THEN** adapter 中止該請求並重試；重試皆逾時則拋出逾時錯誤

#### Scenario: 4xx is not retried
- **WHEN** 請求回 HTTP 4xx（如 model not found）
- **THEN** adapter 不重試，立即拋出帶 Ollama error 的錯誤
