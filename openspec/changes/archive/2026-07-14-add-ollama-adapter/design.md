## Context

LLM 存取集中在 adapter 層（`src/adapters/llm/`），由 `LLM_ADAPTER` 環境變數在 `index.js` 選擇實作。介面（`base.js`）：`embed`、`embedBatch`、`generate`、`stream`（AsyncGenerator）、`chatWithTools(contents, tools)`。呼叫端 `retrieval.js` 以 **Gemini 形狀**組訊息：`contents = [{role: 'user'|'model'|'function', parts: [...]}]`，工具宣告為 Gemini `functionDeclarations` 形狀（`{name, description, parameters}`，JSON Schema）；期望回傳 `{functionCalls: [{name, args}], text}`。

Ollama 提供本機 REST API：`/api/chat`（messages 格式、`tools` 參數、NDJSON 串流）、`/api/embed`（`input` 接受字串或陣列，原生批次）。工具呼叫需模型支援（qwen3、qwen2.5、llama3.1+ 等）。

## Goals / Non-Goals

**Goals:**
- `LLM_ADAPTER=ollama` 即可全功能運作：上傳（embedding）、問答（tool-calling 迴圈）、串流。
- 上層程式碼（retrieval、ingestion、routes）零修改——格式差異全部關在 adapter 內。
- 零新 npm 依賴（Node 內建 fetch）。

**Non-Goals:**
- 不做 Gemini/Ollama 混用（如 Gemini 生成 + Ollama embedding）——一次只有一個 active adapter，混搭配置留待未來需要再說。
- 不做舊向量自動遷移／重嵌入——換 embedding provider 後由使用者重新 ingest。
- 不管理 Ollama 本身（安裝、pull 模型、GPU 配置）。
- 不動 mock adapter 與測試流程的預設值。

## Decisions

### 1. 訊息格式：呼叫端維持 Gemini 形狀，adapter 內部雙向轉換
- 轉換規則（`toOllamaMessages(contents)`）：
  - `{role:'user', parts:[{text}]}` → `{role:'user', content}`
  - `{role:'model', parts:[{functionCall}]}` → `{role:'assistant', tool_calls:[{function:{name, arguments}}]}`
  - `{role:'function', parts:[{functionResponse}]}` → 每個 response 一則 `{role:'tool', content: JSON.stringify(response)}`
  - 工具宣告 `{name, description, parameters}` → `{type:'function', function:{...}}`（欄位一對一，皆為 JSON Schema）
- 回應解析：`message.tool_calls[].function` → `{name, args}`（arguments 已是物件；若為字串則 JSON.parse）；無 tool_calls 時取 `message.content` 為最終文字。
- 替代案：把呼叫端改成 provider 中立的訊息格式再各自轉換——重構面大、動到 retrieval 與既有測試，對兩個 provider 的現況不划算；等第三個 provider 出現再考慮。

### 2. 預設模型：生成 `qwen3:14b`、embedding `bge-m3`，皆可用環境變數覆蓋
- 生成模型必須同時滿足：支援 Ollama tool calling、中文能力好。qwen3 系列兩者兼顧；14B 為使用者實際部署採用的版本（tool calling 可靠度優於 8B），機器跑不動時可用 `OLLAMA_GEN_MODEL` 降級。
- `bge-m3`（1024 維）是多語 embedding 的穩定選擇，中文檢索品質遠優於英文為主的 `nomic-embed-text`。
- 環境變數：`OLLAMA_BASE_URL`（預設 `http://localhost:11434`）、`OLLAMA_GEN_MODEL`、`OLLAMA_EMBED_MODEL`。溫度沿用全案慣例 0.2（`options.temperature`）。

### 3. HTTP 層用 Node 內建 fetch；串流解析 NDJSON
- `/api/chat` 帶 `stream:true` 回 NDJSON（一行一個 JSON chunk）：以 reader 逐行解析、yield `message.content`，`done:true` 結束。`generate()` 與 `chatWithTools()` 用 `stream:false` 拿完整回應。
- 錯誤處理：連線被拒（`ECONNREFUSED`/fetch TypeError）時拋出帶指引的錯誤：「無法連線 Ollama（$BASE_URL），請確認 ollama serve 已啟動」；HTTP 4xx/5xx 帶回 Ollama 的 error body（常見：model not found，提示 `ollama pull`）。
- 不做 429 退避：本機服務無配額；重試邏輯是 Gemini 特有的，不搬過來。
- qwen3 是 thinking 模型（`ollama show` 能力含 `thinking`）：Ollama 會把思考放在 `message.thinking`、答案在 `message.content`。adapter 一律只取 `message.content`（含串流），並在 `/api/chat` 帶 `think: false` 壓低延遲——RAG 工具迴圈每輪都推理一次，thinking 開著延遲會疊加；需要時可再開參數。
- **num_ctx 必須顯式設定**（實測踩坑）：Ollama 執行期預設 `num_ctx=4096`，與模型上限（qwen3:14b 為 40960）無關。本專案 system prompt 含完整 NPDS 目錄（4000+ 字元）加 netlist 工具宣告，第一輪就超過 4096；Ollama 會**從前面靜默截斷**，等於把 system 指令與工具砍掉，模型退化成裸聊天（憑常識亂答、不呼叫工具）。adapter 預設帶 `options.num_ctx: 16384`（`OLLAMA_NUM_CTX` 可調），16k 對 16GB VRAM 的 KV cache 綽綽有餘。

### 4. Embedding 維度不相容：明確擋下混用，重新 ingest 為正式路徑
- Gemini 3072 維、bge-m3 1024 維。`sqlite.js` 的 `cosineSimilarity` 以 `a.length` 迴圈，維度不符時會**靜默算出垃圾分數**——這比報錯更糟。
- 本 change 在 `cosineSimilarity` 加維度檢查：不相等時回傳 0 並（每次搜尋至多一次）console.warn 提示「embedding 維度不符，請重新 ingest」。屬防禦性實作細節，不改 vector-adapter 的 spec 需求（避免與進行中的 add-hybrid-search change 在 spec 層互相踩）。
- 操作建議寫進 `.env.example` 註解：切換 embedding provider 時，換一個 DB 檔（如 `DATA_DB=data/rag-ollama.db`…目前 DB 路徑未參數化，故實務上是備份舊檔後重 ingest）。

### 5. 測試策略：mock `fetch`，不依賴真實 Ollama
- 單元測試注入假 fetch（或以 `globalThis.fetch` stub），驗證：請求 URL/body 形狀（messages 轉換、tools 形狀、embed 批次）、tool_calls 解析、NDJSON 串流組回、連線錯誤訊息。
- 真實端到端（需本機 Ollama）留在 tasks 的手動驗證步驟，不進 CI 測試套件。

## Risks / Trade-offs

- [小模型 tool calling 可靠度低於 Gemini：可能不呼叫工具或吐錯格式] → 預設 qwen3（tool calling 訓練較佳）；arguments 解析容錯（字串時 JSON.parse，失敗回 `{}`）；行為品質本質上取決於使用者選的模型，屬已知取捨。
- [無 GPU 機器上 14B 生成延遲高（秒級~十秒級以上）] → 屬部署取捨；SSE 串流讓使用者看得到進度；文件註明可用 `OLLAMA_GEN_MODEL` 換小模型。
- [使用者切到 Ollama 忘了重新 ingest，檢索靜默劣化] → cosine 維度檢查 + warning 兜底，把「垃圾結果」變成「明確警告」。
- [Ollama API 格式演進（如 /api/embeddings → /api/embed）] → 只用現行穩定端點 `/api/embed`、`/api/chat`；版本過舊的 Ollama 會收到 404，錯誤訊息提示升級。

## Migration Plan

1. 純新增：預設 adapter 仍是 Gemini，行為零變化；設 `LLM_ADAPTER=ollama` 才啟用。
2. 切換步驟（文件化在 `.env.example`）：安裝 Ollama → `ollama pull qwen3:14b bge-m3` → 備份 `data/rag.db` → 設環境變數重啟 → 重新 ingest 文件。
3. 回滾：改回 `LLM_ADAPTER=gemini` 並還原原 DB 檔即可。

## Open Questions

- 無。預設模型若實測不佳，換 `OLLAMA_GEN_MODEL` 即可，不影響架構。
