## 1. OllamaAdapter 實作

- [x] 1.1 建立 `src/adapters/llm/ollama.js`：constructor 讀 `OLLAMA_BASE_URL`／`OLLAMA_GEN_MODEL`／`OLLAMA_EMBED_MODEL`（含預設值），啟動時 log 端點與模型名
- [x] 1.2 實作 `embed(text)` 與 `embedBatch(texts)`：`POST /api/embed`（`input` 為字串或陣列），回傳向量／同序向量陣列
- [x] 1.3 實作 `generate(prompt)` 與 `stream(prompt)`：`POST /api/chat`（單一 user message、`options.temperature: 0.2`、`think: false`）；stream 版解析 NDJSON 逐段 yield `message.content`（忽略 `message.thinking`）
- [x] 1.4 實作 Gemini↔Ollama 格式轉換：`toOllamaMessages(contents)`（user／model+functionCall／function+functionResponse 三種 role）與工具宣告轉換（`{type:'function', function}`）
- [x] 1.5 實作 `chatWithTools(contents, tools)`：轉換後送 `/api/chat`（`stream:false`、`think:false`），解析 `message.tool_calls`（arguments 字串時 JSON.parse、失敗容錯為 `{}`）回傳 `{functionCalls, text}`
- [x] 1.6 錯誤處理：連線被拒拋「無法連線 Ollama（URL），請確認 ollama serve 已啟動」；HTTP 錯誤帶回 error body 並在 model not found 時提示 `ollama pull`

## 2. 接線與配置

- [x] 2.1 `src/adapters/llm/index.js` 註冊 `ollama` adapter
- [x] 2.2 `.env.example` 新增 `OLLAMA_*` 變數與切換說明（含「換 embedding provider 必須備份 DB 並重新 ingest」警告）
- [x] 2.3 `src/adapters/vector/sqlite.js` 的 `cosineSimilarity` 加維度檢查：不相等回傳 0，每次搜尋至多 warn 一次「embedding 維度不符，請重新 ingest」

## 3. 測試

- [x] 3.1 新增 `tests/ollama-adapter.test.js`（stub `globalThis.fetch`）：embed／embedBatch 請求形狀與回應解析、批次同序
- [x] 3.2 測試訊息與工具格式轉換：三種 role 的 contents 轉出正確 messages；tool_calls 解析（物件與字串 arguments、壞 JSON 容錯）；無 tool_calls 回最終文字
- [x] 3.3 測試 NDJSON 串流解析與連線錯誤訊息（含 URL 與指引）
- [x] 3.4 把新測試檔加進 package.json 的 test script，跑全套測試

## 4. 修正：num_ctx 截斷（實測發現）

- [x] 4.0.1 新增 `scripts/reembed.js`：以 chunks.content 原文批次重嵌（輸入與 ingestion 一致），自動備份 DB；已用正式 DB 副本驗證（268 chunks → 1024 維、檢索正常）
- [x] 4.0 `options.num_ctx` 顯式設定（預設 16384、`OLLAMA_NUM_CTX` 可調）：Ollama 預設 4096 會靜默截斷 system prompt 與工具宣告，導致模型亂答不呼叫工具；含測試與 .env.example 說明

## 5. 端到端驗證（需本機 Ollama）

- [x] 4.1 `ollama pull qwen3:14b bge-m3` 後以 `LLM_ADAPTER=ollama` 啟動：上傳一份文件（embedding 走 Ollama）、問一個文件問題（tool-calling 迴圈 + 串流回答），確認 sources 正常
- [x] 4.2 驗證維度防護：用 Gemini 時期的舊 DB 直接查詢，確認收到明確 warning 而非垃圾結果
