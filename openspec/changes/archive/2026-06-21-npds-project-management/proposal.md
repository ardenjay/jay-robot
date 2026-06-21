## Why

目前的 RAG chatbot 只支援單一全域知識庫，但 NPDS（新產品開發系統）的使用場景需要「多專案」管理：每個專案按 C1–C7 階段組織文件，不同專案的文件互不干擾，且問答時必須明確知道哪些階段的文件已上傳、哪些缺少，才能給出有根據的回答或提示補傳。

## What Changes

- 新增 **Project** 概念：使用者可建立多個專案，每個專案有名稱與描述
- 每個專案擁有獨立的文件集合，按 NPDS 階段（C1–C7）分類
- 聊天時需先選擇專案，問答僅在該專案的已上傳文件範圍內進行
- 若回答問題需要某階段的文件但尚未上傳，系統主動提示使用者補傳
- UI 新增：專案列表、建立專案、文件樹狀圖（依 C1–C7 展開）
- 後端 SQLite schema 擴充：documents 表加入 `project_id` 與 `phase`（C1–C7）欄位

## Capabilities

### New Capabilities

- `project-management`: 建立、列出、切換專案；專案隔離各自的文件與向量索引
- `npds-document-tree`: 按 NPDS C1–C7 階段呈現已上傳文件的樹狀圖，標示缺少的階段
- `missing-document-hint`: RAG 查詢時偵測答案所需階段是否有文件，若無則回傳提示訊息要求補傳

### Modified Capabilities

- `document-ingestion`: 上傳時需附帶 `project_id` 與 `phase`（C1–C7）參數
- `rag-query`: 查詢時需帶 `project_id`，向量搜尋限縮至該專案的文件
- `chat-ui`: 新增專案選擇器、建立專案表單、文件樹狀圖側欄

## Impact

- `src/adapters/vector/sqlite.js`：`add()` / `search()` / `clear()` 加入 `projectId` 過濾
- `src/services/ingestion.js`：`ingestFile()` 加入 `projectId`、`phase` 參數
- `src/services/retrieval.js`：`answer()` 加入 `projectId` 參數
- `src/routes/upload.js`：接收 `projectId`、`phase` form fields
- `src/routes/chat.js`：接收 `projectId` request body field
- 新增 `src/routes/projects.js`：CRUD project API
- `public/index.html`：重構 UI 加入專案管理與文件樹
- SQLite schema migration：`chunks` 表新增 `project_id`、`phase` 欄位
