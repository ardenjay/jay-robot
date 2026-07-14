## Why

目前 LLM 只有 Gemini 一個真實 adapter，依賴外部 API：有配額限制（429 退避）、資料要出網、斷網不能用。接上 Ollama 後可以在本機／內網跑開源模型（生成 + embedding），開發測試不燒配額，敏感文件也不出內網。

## What Changes

- 新增 `OllamaAdapter`（`LLM_ADAPTER=ollama`）：實作 LLMAdapter 全部介面——`embed`、`embedBatch`、`generate`、`stream`、`chatWithTools`。
- 以 Ollama REST API 實作：`/api/embed`（原生支援批次）、`/api/chat`（生成、串流、tool calling）。用 Node 內建 `fetch`，不新增套件。
- `chatWithTools` 在 adapter 內部做格式轉換：呼叫端（retrieval service）維持 Gemini 形狀的 `contents`（`functionCall`/`functionResponse` parts），adapter 轉成 Ollama 的 `messages`/`tool_calls`/`tool` role，回傳統一的 `{functionCalls, text}`。上層程式碼零修改。
- 模型與端點可配置：`OLLAMA_BASE_URL`（預設 `http://localhost:11434`）、`OLLAMA_GEN_MODEL`（預設 `qwen3:14b`，需支援 tool calling 與中文）、`OLLAMA_EMBED_MODEL`（預設 `bge-m3`，多語 embedding）。
- Ollama 連不上時給明確錯誤訊息（提示 Ollama 未啟動／URL 錯誤），不做 429 退避（本機服務無配額問題）。
- 新增 `scripts/reembed.js`：換 embedding provider 後免重新上傳，直接以 DB 內 chunk 原文批次重嵌（自動備份 DB、支援 `--project`/`--db`/`--dry-run`）。

## Capabilities

### New Capabilities

（無 — Ollama 是既有 llm-adapter capability 的新實作）

### Modified Capabilities

- `llm-adapter`: 新增 Ollama adapter 需求（介面實作、格式轉換、環境變數配置、連線錯誤處理）；「Adapter is swappable via configuration」的場景擴充 `ollama` 選項。

## Impact

- `src/adapters/llm/ollama.js` — 新檔，OllamaAdapter 實作。
- `src/adapters/llm/index.js` — 註冊 `ollama` adapter。
- `.env.example` — 新增 `OLLAMA_*` 變數說明。
- `scripts/reembed.js` — 新檔，重嵌 CLI。
- `tests/` — 新增 OllamaAdapter 單元測試（mock fetch，驗證請求格式與回應解析、格式轉換）。
- **資料相容性**：embedding 換 provider 後維度不同（Gemini 3072 vs bge-m3 1024），舊 DB 的向量不能與新查詢向量混算——切到 Ollama 後既有文件必須重新 ingest（或分開用不同 DB 檔）。屬操作面約束，詳見 design。
- 相依性：不新增 npm 套件（Node 18+ 內建 fetch）；執行環境需自行安裝 Ollama 並 pull 對應模型。
