## Purpose

TBD — LLM Adapter capability for the markdown-rag-chatbot. Defines the interface contract for LLM providers and provides a swappable adapter pattern for embedding and text generation.

## Requirements

### Requirement: LLMAdapter interface contract
所有 LLMAdapter 實作 SHALL 繼承 base class 並實作三個方法：`embed(text)`、`generate(prompt)`、`stream(prompt)`。

#### Scenario: Embed text
- **WHEN** 呼叫 `embed(text)` 傳入字串
- **THEN** 回傳 float32 向量陣列（維度由實作決定）

#### Scenario: Generate response
- **WHEN** 呼叫 `generate(prompt)` 傳入完整 prompt 字串
- **THEN** 回傳完整的 LLM 回應字串

#### Scenario: Stream response
- **WHEN** 呼叫 `stream(prompt)` 傳入完整 prompt 字串
- **THEN** 回傳 AsyncGenerator，逐步 yield 每個 token 字串

### Requirement: Gemini adapter as default implementation
系統 SHALL 提供 `GeminiAdapter`，使用 `gemini-embedding-001` 做 embedding（3072 維），使用 `gemini-2.5-flash` 做文字生成。文字生成（`generate()` 與 `stream()`）SHALL 帶入低 temperature 的 `generationConfig`（預設 0.2），使相同輸入下的回答更一致、更忠於提供的文件，降低無故放棄作答的機率。

#### Scenario: Gemini embed returns 3072-dim vector
- **WHEN** 呼叫 `embed(text)`
- **THEN** 回傳長度為 3072 的 float 陣列

#### Scenario: Gemini stream generates tokens
- **WHEN** 呼叫 `stream(prompt)`
- **THEN** AsyncGenerator 逐步 yield 文字 token 直至生成完畢

#### Scenario: Generation uses low temperature
- **WHEN** 呼叫 `generate(prompt)` 或 `stream(prompt)`
- **THEN** 向模型送出的請求帶有低 temperature 的 `generationConfig`（預設 0.2），使相同問題與相同檢索內容下的回答趨於一致

### Requirement: Adapter is swappable via configuration
系統 SHALL 透過環境變數決定載入哪個 LLMAdapter，上層 service 程式碼無需修改。

#### Scenario: Switch LLM adapter via environment variable
- **WHEN** 環境變數 `LLM_ADAPTER=claude` 被設定
- **THEN** 系統載入 `ClaudeAdapter` 而非預設的 Gemini 實作
