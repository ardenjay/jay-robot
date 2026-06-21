## Why

需要一個個人知識庫工具，能將 Markdown 文件轉化為可對話的 RAG 機器人，讓用戶可以用自然語言查詢自己整理的筆記與文件，而不需要手動搜尋。

## What Changes

- 全新 Node.js 網頁應用，提供 Markdown 文件上傳與問答介面
- 文件 ingestion pipeline：解析 Markdown 標題結構 → 切塊 → 向量化 → 儲存至 SQLite
- RAG 查詢引擎：將用戶問題向量化 → 相似度搜尋 → 組合 prompt → Gemini 生成答案
- 模組化 Adapter 層：VectorAdapter 與 LLMAdapter 介面，方便日後替換底層實作
- 前端：HTML + Vanilla JS 單頁應用，含上傳區與對話介面，顯示回答來源段落

## Capabilities

### New Capabilities

- `document-ingestion`: 上傳 Markdown 文件，解析標題結構切塊，向量化後儲存至 SQLite
- `rag-query`: 接收用戶問題，向量相似度搜尋相關段落，呼叫 LLM 生成附來源的回答
- `vector-adapter`: 抽象化向量儲存層，SQLite + sqlite-vec 為預設實作
- `llm-adapter`: 抽象化 LLM 與 Embedding 層，Gemini 2.5 Flash 為預設實作
- `chat-ui`: 瀏覽器端單頁介面，含文件上傳區、對話框、來源引用顯示

### Modified Capabilities

## Impact

- 新增 Node.js 專案（Express.js）
- 依賴：`express`, `better-sqlite3`, `sqlite-vec`, `@google/generative-ai`, `multer`, `marked`
- 本地 SQLite 資料庫檔案儲存向量與文件段落
- 需要 Gemini API Key（環境變數 `GEMINI_API_KEY`）
