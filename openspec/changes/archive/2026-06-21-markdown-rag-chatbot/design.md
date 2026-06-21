## Context

個人知識庫 RAG 工具，從零開始建立。無現有程式碼需要遷移。
技術棧：Node.js + Express、SQLite（sqlite-vec）、Gemini API、HTML/Vanilla JS。
核心設計挑戰是讓 VectorStore 和 LLM 兩個關鍵依賴可以輕鬆替換，同時保持實作簡單。

## Goals / Non-Goals

**Goals:**
- 個人本地使用，單用戶，無需認證
- Markdown 文件上傳、切塊、向量化、儲存全流程
- 相似度搜尋 + Gemini 生成附來源的回答
- Adapter 介面讓 VectorStore 和 LLM 可獨立替換
- 串流輸出（streaming）提升體感速度

**Non-Goals:**
- 多用戶、多 session 隔離
- 非 Markdown 格式（PDF、Word 等）
- 生產環境部署、Docker 化
- 對話歷史持久化（每次問答獨立）

## Decisions

### 1. Adapter 介面設計

**決定**：定義兩個介面 class，實作透過繼承注入。

```
VectorAdapter (base.js)          LLMAdapter (base.js)
─────────────────────            ──────────────────────
async add(chunks)                async embed(text) → float[]
async search(vector, topK)       async generate(prompt) → string
async clear()                    async stream(prompt) → AsyncGenerator
```

每個 adapter 是獨立檔案，config 或環境變數決定載入哪個。

**為何不用 interface / 泛型**：Node.js 沒有強型別 interface，用基底 class 拋出 `NotImplementedError` 讓錯誤訊息明確。

**替換方式**：改一行 import 或環境變數 `VECTOR_ADAPTER=chroma`，上層完全不改動。

---

### 2. SQLite 向量搜尋

**決定**：使用 `sqlite-vec` npm 套件（SQLite 擴充）+ `better-sqlite3`。

schema：
```sql
CREATE TABLE chunks (
  id        INTEGER PRIMARY KEY,
  doc_id    TEXT NOT NULL,
  title     TEXT,
  content   TEXT NOT NULL,
  embedding BLOB NOT NULL   -- float32 array
);
CREATE VIRTUAL TABLE chunks_vec USING vec0(embedding float[768]);
```

搜尋：cosine distance，取前 5 個 chunks。

**為何不用 Chroma / Pinecone**：個人工具，零外部依賴，SQLite 已足夠，未來想換只需換 adapter。

---

### 3. Markdown Chunking 策略

**決定**：按標題（`#` / `##` / `###`）切割，保留標題作為 chunk 的 `title` 欄位。

演算法：
1. 用 `marked` 解析 token stream
2. 遇到 heading token 就開啟新 chunk
3. 累積後續 paragraph/list/code 等 token 的文字
4. chunk 大小不設硬限制（語意優先），超過 1500 字的 chunk 以段落為單位再切

**為何不用滑動視窗**：Markdown 文件本身已有語意邊界，按標題切更自然，來源引用也更清楚。

---

### 4. Embedding 與 LLM 都用 Gemini

**決定**：`text-embedding-004`（768 維）做 embedding，`gemini-2.5-flash` 做生成。

優點：單一 API key，免費額度涵蓋個人使用量。
風險：Gemini API 速率限制（15 RPM）在批次 ingestion 大量文件時可能觸發 → 加 retry with backoff。

---

### 5. 串流輸出

**決定**：後端用 `generateContentStream`，前端用 `EventSource` 或 `fetch` + ReadableStream 接收。

回應格式：`text/event-stream`（SSE），每個 token 一個事件。

---

### 6. 專案結構

```
jay_robot/
├── src/
│   ├── adapters/
│   │   ├── vector/
│   │   │   ├── base.js         ← 介面定義
│   │   │   └── sqlite.js       ← 實作
│   │   └── llm/
│   │       ├── base.js         ← 介面定義
│   │       └── gemini.js       ← 實作
│   ├── services/
│   │   ├── ingestion.js        ← parse → chunk → embed → store
│   │   └── retrieval.js        ← embed query → search → generate
│   ├── routes/
│   │   ├── upload.js           ← POST /api/upload
│   │   └── chat.js             ← POST /api/chat (SSE)
│   └── app.js                  ← Express 入口
├── public/
│   └── index.html              ← 單頁 UI
├── data/                       ← SQLite 資料庫（gitignore）
├── uploads/                    ← 暫存上傳檔案（gitignore）
├── .env                        ← GEMINI_API_KEY
└── package.json
```

## Risks / Trade-offs

- **sqlite-vec 安裝問題** → 需要原生編譯，Windows 上可能需要 node-gyp 環境；mitigation：提供明確安裝指南，考慮備用純 JS cosine similarity 實作
- **Gemini rate limit（15 RPM）** → 大批 ingestion 時會觸發；mitigation：ingestion service 加 delay + retry with exponential backoff
- **大 chunk 影響搜尋品質** → 1500 字以上的段落語意可能模糊；mitigation：超長 chunk 再切，並在 prompt 中指示 LLM 只引用相關部分
- **無對話歷史** → 每次問答獨立，無法做 follow-up 問題；trade-off 是簡化後端狀態管理，個人工具可接受

## Open Questions

- sqlite-vec 在 Windows 上的原生模組是否穩定？需安裝測試確認
