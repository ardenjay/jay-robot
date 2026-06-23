## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Gemini implements tool calling via function declarations
`GeminiAdapter` SHALL 以 Gemini SDK 的 `functionDeclarations` 提供工具、解析回應中的 `functionCall`、並接受將工具結果以 `functionResponse` 回填後續呼叫，預設採 `AUTO` 模式（由模型決定是否呼叫工具）。

#### Scenario: Gemini requests a function call
- **WHEN** 以工具宣告呼叫 `chatWithTools`，且模型決定使用某工具
- **THEN** 回應含 `functionCall`（工具名稱與參數），呼叫端執行後以 `functionResponse` 回填再續

#### Scenario: Gemini returns final text when no tool needed
- **WHEN** 模型判斷不需要工具
- **THEN** 回應為一般文字，結束工具迴圈
