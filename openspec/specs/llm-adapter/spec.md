## Purpose

TBD — LLM Adapter capability for the markdown-rag-chatbot. Defines the interface contract for LLM providers and provides a swappable adapter pattern for embedding and text generation.

## Requirements

### Requirement: LLMAdapter interface contract
所有 LLMAdapter 實作 SHALL 繼承 base class 並實作下列方法：`embed(text)`、`embedBatch(texts)`、`generate(prompt)`、`stream(prompt)`，以及支援工具呼叫的 `chatWithTools(messages, tools)`——給定對話訊息與工具宣告，回傳 LLM 要求的工具呼叫（function calls）或最終文字；呼叫端可將工具執行結果回填為訊息後再次呼叫，形成多輪迴圈。

#### Scenario: Embed text
- **WHEN** 呼叫 `embed(text)` 傳入字串
- **THEN** 回傳 float32 向量陣列（維度由實作決定）

#### Scenario: Embed a batch of texts
- **WHEN** 呼叫 `embedBatch(texts)` 傳入字串陣列
- **THEN** 回傳對應順序的向量陣列（每個元素為一筆 text 的向量）

#### Scenario: Generate response
- **WHEN** 呼叫 `generate(prompt)` 傳入完整 prompt 字串
- **THEN** 回傳完整的 LLM 回應字串

#### Scenario: Stream response
- **WHEN** 呼叫 `stream(prompt)` 傳入完整 prompt 字串
- **THEN** 回傳 AsyncGenerator，逐步 yield 每個 token 字串

#### Scenario: Tool-calling round
- **WHEN** 呼叫 `chatWithTools(messages, tools)` 且 LLM 判斷需要使用工具
- **THEN** 回傳所要求的工具呼叫（名稱與參數）；當 LLM 不需更多工具時改回傳最終文字

### Requirement: Gemini adapter as default implementation
系統 SHALL 提供 `GeminiAdapter`，使用 `gemini-embedding-001` 做 embedding（3072 維），使用 `gemini-2.5-flash` 做文字生成。文字生成（`generate()` 與 `stream()`）SHALL 帶入低 temperature 的 `generationConfig`（預設 0.2），使相同輸入下的回答更一致、更忠於提供的文件，降低無故放棄作答的機率。`embedBatch(texts)` SHALL 以 Gemini `batchEmbedContents` 一次送出多筆 text，減少 API 請求數。遇到 429（速率/配額）時，重試 SHALL 優先依伺服器回傳的 `retryDelay` 等待；若無則採指數退避，並設有等待上限與多次重試。

#### Scenario: Gemini embed returns 3072-dim vector
- **WHEN** 呼叫 `embed(text)`
- **THEN** 回傳長度為 3072 的 float 陣列

#### Scenario: Gemini batch embed returns vectors in order
- **WHEN** 呼叫 `embedBatch(texts)` 傳入多筆 text
- **THEN** 以單一 `batchEmbedContents` 請求取得結果，回傳與輸入同序的向量陣列

#### Scenario: Gemini stream generates tokens
- **WHEN** 呼叫 `stream(prompt)`
- **THEN** AsyncGenerator 逐步 yield 文字 token 直至生成完畢

#### Scenario: Generation uses low temperature
- **WHEN** 呼叫 `generate(prompt)` 或 `stream(prompt)`
- **THEN** 向模型送出的請求帶有低 temperature 的 `generationConfig`（預設 0.2），使相同問題與相同檢索內容下的回答趨於一致

#### Scenario: Retry respects server retry delay on 429
- **WHEN** embedding 或生成請求回傳 429 且 `errorDetails` 含 `RetryInfo.retryDelay`
- **THEN** 系統等待該建議時間後重試；若無 `retryDelay` 則採指數退避，於達到重試上限後才拋出錯誤

### Requirement: Adapter is swappable via configuration
系統 SHALL 透過環境變數決定載入哪個 LLMAdapter，上層 service 程式碼無需修改。

#### Scenario: Switch LLM adapter via environment variable
- **WHEN** 環境變數 `LLM_ADAPTER=claude` 被設定
- **THEN** 系統載入 `ClaudeAdapter` 而非預設的 Gemini 實作

### Requirement: Gemini implements tool calling via function declarations
`GeminiAdapter` SHALL 以 Gemini SDK 的 `functionDeclarations` 提供工具、解析回應中的 `functionCall`、並接受將工具結果以 `functionResponse` 回填後續呼叫，預設採 `AUTO` 模式（由模型決定是否呼叫工具）。

#### Scenario: Gemini requests a function call
- **WHEN** 以工具宣告呼叫 `chatWithTools`，且模型決定使用某工具
- **THEN** 回應含 `functionCall`（工具名稱與參數），呼叫端執行後以 `functionResponse` 回填再續

#### Scenario: Gemini returns final text when no tool needed
- **WHEN** 模型判斷不需要工具
- **THEN** 回應為一般文字，結束工具迴圈
