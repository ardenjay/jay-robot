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
系統 SHALL 提供 `GeminiAdapter`，使用 `text-embedding-004` 做 embedding（768 維），使用 `gemini-2.5-flash` 做文字生成。

#### Scenario: Gemini embed returns 768-dim vector
- **WHEN** 呼叫 `embed(text)`
- **THEN** 回傳長度為 768 的 float 陣列

#### Scenario: Gemini stream generates tokens
- **WHEN** 呼叫 `stream(prompt)`
- **THEN** AsyncGenerator 逐步 yield 文字 token 直至生成完畢

### Requirement: Adapter is swappable via configuration
系統 SHALL 透過環境變數決定載入哪個 LLMAdapter，上層 service 程式碼無需修改。

#### Scenario: Switch LLM adapter via environment variable
- **WHEN** 環境變數 `LLM_ADAPTER=claude` 被設定
- **THEN** 系統載入 `ClaudeAdapter` 而非預設的 Gemini 實作
