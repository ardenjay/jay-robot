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
系統 SHALL 透過環境變數決定載入哪個 LLMAdapter，上層 service 程式碼無需修改。可用值至少包含 `gemini`（預設）、`mock`、`ollama`；未知值 SHALL 啟動失敗並列出可用選項。

#### Scenario: Switch LLM adapter via environment variable
- **WHEN** 環境變數 `LLM_ADAPTER=claude` 被設定
- **THEN** 系統載入 `ClaudeAdapter` 而非預設的 Gemini 實作

#### Scenario: Ollama adapter selected via environment variable
- **WHEN** 環境變數 `LLM_ADAPTER=ollama` 被設定
- **THEN** 系統載入 `OllamaAdapter`，所有上層流程（ingestion、retrieval）照常運作

### Requirement: Gemini implements tool calling via function declarations
`GeminiAdapter` SHALL 以 Gemini SDK 的 `functionDeclarations` 提供工具、解析回應中的 `functionCall`、並接受將工具結果以 `functionResponse` 回填後續呼叫，預設採 `AUTO` 模式（由模型決定是否呼叫工具）。

#### Scenario: Gemini requests a function call
- **WHEN** 以工具宣告呼叫 `chatWithTools`，且模型決定使用某工具
- **THEN** 回應含 `functionCall`（工具名稱與參數），呼叫端執行後以 `functionResponse` 回填再續

#### Scenario: Gemini returns final text when no tool needed
- **WHEN** 模型判斷不需要工具
- **THEN** 回應為一般文字，結束工具迴圈

### Requirement: Ollama adapter for local model serving
系統 SHALL 提供 `OllamaAdapter`（`LLM_ADAPTER=ollama` 啟用），以 Ollama REST API 實作 LLMAdapter 全部介面：`embed`/`embedBatch` 用 `/api/embed`（批次以單一請求送出 `input` 陣列）、`generate`/`stream`/`chatWithTools` 用 `/api/chat`。生成請求 SHALL 帶 `options.temperature`（預設 0.2）。端點與模型 SHALL 可由環境變數配置：`OLLAMA_BASE_URL`（預設 `http://localhost:11434`）、`OLLAMA_GEN_MODEL`（預設 `qwen3:14b`）、`OLLAMA_EMBED_MODEL`（預設 `bge-m3`）、`OLLAMA_NUM_CTX`（預設 `16384`）。生成請求 SHALL 帶 `options.num_ctx`——Ollama 執行期預設僅 4096，system prompt（含 NPDS 目錄）加工具宣告會超過而被靜默截斷，導致模型忽略指令與工具。實作 SHALL 使用 Node 內建 `fetch`，不新增 npm 依賴。

#### Scenario: Context window covers system prompt and tools
- **WHEN** 送出生成／工具呼叫請求
- **THEN** 請求的 `options.num_ctx` 為配置值（預設 16384），不受 Ollama 4096 預設截斷影響

#### Scenario: Embed via Ollama
- **WHEN** 呼叫 `embed(text)` 或 `embedBatch(texts)`
- **THEN** 以 `/api/embed` 取得向量；批次時單一請求、回傳與輸入同序的向量陣列

#### Scenario: Stream tokens from Ollama
- **WHEN** 呼叫 `stream(prompt)`
- **THEN** 以 `/api/chat`（`stream:true`）取得 NDJSON 串流，AsyncGenerator 逐段 yield `message.content` 直到 `done`

#### Scenario: Models configurable via environment
- **WHEN** 設定 `OLLAMA_GEN_MODEL=llama3.1:8b` 與 `OLLAMA_EMBED_MODEL=nomic-embed-text`
- **THEN** 生成與 embedding 請求分別使用指定模型，未設定時使用預設值

### Requirement: Ollama tool calling with Gemini-shaped message translation
`OllamaAdapter.chatWithTools(contents, tools)` SHALL 接受與 Gemini adapter 相同形狀的輸入（Gemini 式 `contents` 與 `functionDeclarations` 式工具宣告），於 adapter 內部完成雙向格式轉換，回傳統一的 `{functionCalls: [{name, args}], text}`——上層呼叫端 SHALL 無需修改。轉換規則：`user` parts → user message；`model` 的 `functionCall` parts → assistant `tool_calls`；`function` 的 `functionResponse` parts → `tool` role messages；工具宣告 → `{type:'function', function:{name, description, parameters}}`。`tool_calls.function.arguments` 為字串時 SHALL JSON.parse，解析失敗時以空物件容錯。

#### Scenario: Model requests a tool call
- **WHEN** 以工具宣告呼叫 `chatWithTools`，Ollama 回應含 `message.tool_calls`
- **THEN** 回傳 `functionCalls`（名稱與 args 物件），text 為 null

#### Scenario: Multi-round tool loop completes
- **WHEN** 呼叫端把工具結果以 Gemini 形狀（`functionResponse` parts）回填後再次呼叫
- **THEN** adapter 轉為 `tool` role messages 送出，模型可據以回傳最終文字

#### Scenario: Final text when no tool needed
- **WHEN** Ollama 回應無 `tool_calls`
- **THEN** 回傳 `{functionCalls: [], text: message.content}`

### Requirement: Ollama connection errors are actionable
Ollama 無法連線（連線被拒／逾時）時，adapter SHALL 拋出含 base URL 與啟動指引（`ollama serve`）的錯誤；HTTP 錯誤 SHALL 帶回 Ollama 回應的 error 內容（如 model not found 時提示 `ollama pull <model>`）。adapter SHALL NOT 實作 429 退避重試（本機服務無配額限制）。

#### Scenario: Ollama not running
- **WHEN** `OLLAMA_BASE_URL` 指向的服務未啟動
- **THEN** 拋出錯誤，訊息含該 URL 與「請確認 ollama serve 已啟動」指引

#### Scenario: Model not pulled
- **WHEN** 指定模型不存在於 Ollama
- **THEN** 拋出錯誤，訊息含 Ollama 的 error 與 `ollama pull` 提示
