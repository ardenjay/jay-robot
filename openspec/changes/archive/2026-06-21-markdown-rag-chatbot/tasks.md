## 1. 專案初始化

- [x] 1.1 建立 `package.json`，加入依賴：`express`、`better-sqlite3`、`sqlite-vec`、`@google/generative-ai`、`multer`、`marked`、`dotenv`
- [x] 1.2 建立 `.env` 範本檔（`.env.example`）含 `GEMINI_API_KEY`、`VECTOR_ADAPTER`、`LLM_ADAPTER` 欄位
- [x] 1.3 建立目錄結構：`src/adapters/vector/`、`src/adapters/llm/`、`src/services/`、`src/routes/`、`public/`、`data/`、`uploads/`
- [x] 1.4 建立 `.gitignore`，排除 `node_modules/`、`data/`、`uploads/`、`.env`

## 2. LLM Adapter 層

- [x] 2.1 建立 `src/adapters/llm/base.js`：定義 `LLMAdapter` base class，`embed()`、`generate()`、`stream()` 拋出 `NotImplementedError`
- [x] 2.2 建立 `src/adapters/llm/gemini.js`：實作 `GeminiAdapter`，`embed()` 使用 `text-embedding-004`（768 維），`generate()` 與 `stream()` 使用 `gemini-2.5-flash`
- [x] 2.3 在 `stream()` 加入 exponential backoff retry（最多 3 次）處理 rate limit
- [x] 2.4 建立 `src/adapters/llm/index.js`：依 `LLM_ADAPTER` 環境變數動態載入正確 adapter

## 3. Vector Adapter 層

- [x] 3.1 建立 `src/adapters/vector/base.js`：定義 `VectorAdapter` base class，`add()`、`search()`、`clear()` 拋出 `NotImplementedError`
- [x] 3.2 建立 `src/adapters/vector/sqlite.js`：實作 `SqliteVectorAdapter`，初始化時建立 `chunks` 表與 `chunks_vec` virtual table
- [x] 3.3 實作 `add(chunks)`：批次插入 chunks 及其 float32 embedding blob
- [x] 3.4 實作 `search(vector, topK)`：用 `vec_distance_cosine` 排序，回傳含 `text`、`title`、`docId`、`distance` 的陣列
- [x] 3.5 實作 `clear(doc_id)`：刪除指定 doc_id 的所有 chunks（用於 re-upload）
- [x] 3.6 建立 `src/adapters/vector/index.js`：依 `VECTOR_ADAPTER` 環境變數動態載入正確 adapter

## 4. Ingestion Service

- [x] 4.1 建立 `src/services/ingestion.js`：實作 `parseAndChunk(markdownText, filename)` 函式
- [x] 4.2 用 `marked` lexer 解析 token stream，遇 heading 開啟新 chunk，累積後續 token 文字
- [x] 4.3 實作超長 chunk 切割：超過 1500 字以段落（`\n\n`）再切
- [x] 4.4 實作 `ingestFile(filePath, filename)`：讀檔 → chunk → embed（含 backoff retry）→ 先刪舊 chunks → 寫入 vector store

## 5. Retrieval Service

- [x] 5.1 建立 `src/services/retrieval.js`：實作 `answer(question)` 函式
- [x] 5.2 embed 問題 → `vectorAdapter.search(vector, 5)` 取 top-5 chunks
- [x] 5.3 組合 prompt：系統指令（只根據提供資料回答）+ chunks 內容 + 用戶問題
- [x] 5.4 呼叫 `llmAdapter.stream(prompt)`，yield token 串流，完成後附上來源 title 列表
- [x] 5.5 資料庫為空時直接回傳提示訊息，不呼叫 LLM

## 6. Express 路由與入口

- [x] 6.1 建立 `src/routes/upload.js`：`POST /api/upload`，用 `multer` 接收單一 `.md` 檔案，呼叫 `ingestFile()`，回傳 JSON `{ chunks: N }`
- [x] 6.2 在 upload route 驗證副檔名，非 `.md`/`.markdown` 回傳 HTTP 400
- [x] 6.3 建立 `src/routes/chat.js`：`POST /api/chat`，設定 SSE header，呼叫 `answer()`，逐 token 發送 `data: <token>` 事件，結束時發送 `data: [SOURCES]<json>` 事件
- [x] 6.4 建立 `src/app.js`：初始化 Express，掛載路由，`express.static('public')`，監聽 port 3000

## 7. 前端 UI

- [x] 7.1 建立 `public/index.html`：單頁版面，包含上傳區（file input + 上傳按鈕 + 狀態訊息）與對話區（問題輸入框 + 對話記錄區）
- [x] 7.2 實作上傳功能：`fetch POST /api/upload`，顯示「上傳中...」與結果訊息，錯誤時顯示錯誤內容
- [x] 7.3 實作問答功能：`fetch POST /api/chat`，用 `ReadableStream` 接收 SSE，即時 append token 至對話區
- [x] 7.4 實作來源顯示：解析 `[SOURCES]` 事件，在回答下方渲染「來源：」列表
- [x] 7.5 實作送出中斷：若前一個串流尚在進行，先 `abort()` 再送出新問題
- [x] 7.6 Enter 鍵送出問題，送出時 disable 輸入框直到串流完成

## 8. 驗收測試

- [x] 8.1 上傳一份含多個標題的 `.md` 測試文件，確認 chunk 數量正確
- [x] 8.2 重複上傳同名文件，確認舊 chunks 被替換
- [x] 8.3 提問與文件相關的問題，確認答案引用正確段落並顯示來源
- [x] 8.4 提問與文件無關的問題，確認 LLM 回覆「無法在提供資料中找到」
- [x] 8.5 上傳非 `.md` 檔案，確認 UI 顯示錯誤訊息
- [x] 8.6 確認串流輸出即時顯示，不需等待完整回應
