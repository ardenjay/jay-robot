## MODIFIED Requirements

### Requirement: Ollama adapter for local model serving
系統 SHALL 提供 `OllamaAdapter`（`LLM_ADAPTER=ollama` 啟用），以 Ollama REST API 實作 LLMAdapter 全部介面：`embed`/`embedBatch` 用 `/api/embed`（批次以單一請求送出 `input` 陣列）、`generate`/`stream`/`chatWithTools` 用 `/api/chat`。生成請求 SHALL 帶 `options.temperature`（預設 0.2）。端點與模型 SHALL 可由環境變數配置：`OLLAMA_BASE_URL`（預設 `http://localhost:11434`）、`OLLAMA_GEN_MODEL`（預設 `qwen3:14b`）、`OLLAMA_EMBED_MODEL`（預設 `bge-m3`）、`OLLAMA_NUM_CTX`（預設 `12288`）。生成請求 SHALL 帶 `options.num_ctx`——Ollama 執行期預設僅 4096，system prompt（含 NPDS 目錄）加工具宣告會超過而被靜默截斷，導致模型忽略指令與工具；預設 12288 取自實測最大 prompt（約 9310 tokens）加生成餘裕，避免預留過多 KV 記憶體。adapter SHALL 在某次請求的實際 prompt token 數（Ollama 回應的 `prompt_eval_count`）超過 `num_ctx` 的 90% 時輸出警告，使「接近截斷」顯性化。實作 SHALL 使用 Node 內建 `fetch`，不新增 npm 依賴。

#### Scenario: Context window covers system prompt and tools
- **WHEN** 送出生成／工具呼叫請求
- **THEN** 請求的 `options.num_ctx` 為配置值（預設 12288），不受 Ollama 4096 預設截斷影響

#### Scenario: Embed via Ollama
- **WHEN** 呼叫 `embed(text)` 或 `embedBatch(texts)`
- **THEN** 以 `/api/embed` 取得向量；批次時單一請求、回傳與輸入同序的向量陣列

#### Scenario: Stream tokens from Ollama
- **WHEN** 呼叫 `stream(prompt)`
- **THEN** 以 `/api/chat`（`stream:true`）取得 NDJSON 串流，AsyncGenerator 逐段 yield `message.content` 直到 `done`

#### Scenario: Models configurable via environment
- **WHEN** 設定 `OLLAMA_GEN_MODEL=llama3.1:8b` 與 `OLLAMA_EMBED_MODEL=nomic-embed-text`
- **THEN** 生成與 embedding 請求分別使用指定模型，未設定時使用預設值

#### Scenario: Warn when prompt approaches num_ctx
- **WHEN** 某次請求的回應 `prompt_eval_count` 超過 `num_ctx` 的 90%
- **THEN** adapter 輸出警告，指出 prompt token 數與 num_ctx，提示可能接近截斷
