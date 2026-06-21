## 1. SQLite Schema Migration

- [x] 1.1 在 `src/adapters/vector/sqlite.js` 初始化時建立 `projects` 表：`id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT`
- [x] 1.2 在 `chunks` 表新增 `project_id TEXT DEFAULT 'default'` 和 `phase TEXT DEFAULT ''` 欄位（用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 做向後相容遷移）

## 2. Vector Adapter 更新

- [x] 2.1 `add(chunks)` 接受 chunks 物件中的 `projectId` 和 `phase`，寫入對應欄位
- [x] 2.2 `search(vector, topK, projectId)` 新增 `projectId` 參數，WHERE 條件限縮至指定專案
- [x] 2.3 `clear(docId, projectId)` 新增 `projectId` 參數，刪除時同時過濾 `project_id`
- [x] 2.4 `listDocuments(projectId)` 新方法：回傳該專案所有不重複的 `{phase, doc_id}` 組合

## 3. Project API 路由

- [x] 3.1 建立 `src/routes/projects.js`
- [x] 3.2 實作 `POST /api/projects`：建立專案（name 必填），回傳 201 + `{id, name, created_at}`
- [x] 3.3 實作 `GET /api/projects`：回傳所有專案列表，依 `created_at` 降序
- [x] 3.4 實作 `GET /api/projects/:id/documents`：呼叫 `listDocuments(projectId)`，回傳 `{C1:[], C2:[], ..., C7:[]}` 格式
- [x] 3.5 在 `src/app.js` 掛載 `/api/projects` 路由

## 4. Ingestion 服務更新

- [x] 4.1 `ingestFile(filePath, filename, projectId, phase, llmAdapter, vectorAdapter)` 新增 `projectId`、`phase` 參數
- [x] 4.2 `embeddedChunks` 每筆加入 `projectId`、`phase`
- [x] 4.3 `store.clear(docId, projectId)` 改為帶 `projectId` 呼叫

## 5. Upload 路由更新

- [x] 5.1 `src/routes/upload.js` 讀取 form fields `project_id` 和 `phase`
- [x] 5.2 驗證 `project_id` 非空，否則回傳 400
- [x] 5.3 驗證 `phase` 為 C1–C7，否則回傳 400
- [x] 5.4 呼叫 `ingestFile` 時傳入 `project_id`、`phase`

## 6. Retrieval 服務更新

- [x] 6.1 `answer(question, projectId)` 新增 `projectId` 參數
- [x] 6.2 `vectorStore.search(vector, topK)` 改為 `vectorStore.search(vector, topK, projectId)`
- [x] 6.3 查詢前取得專案所有已上傳 phases（`listDocuments`），計算出空的 phases 清單
- [x] 6.4 若有空的 phases，在 system prompt 末尾加入提示：「以下 NPDS 階段尚無文件：{phases}，若答案需要這些階段的資料，請提示使用者補傳。」

## 7. Chat 路由更新

- [x] 7.1 `src/routes/chat.js` 從 request body 讀取 `project_id`
- [x] 7.2 呼叫 `answer(question, projectId)`

## 8. 前端 UI 重構

- [x] 8.1 在 `public/index.html` 加入 hash router（監聽 `hashchange`，解析 `#/` 和 `#/projects/:id`）
- [x] 8.2 建立「專案列表」視圖：呼叫 `GET /api/projects`，渲染專案卡片列表
- [x] 8.3 建立「建立專案」表單（modal 或 inline），呼叫 `POST /api/projects`，成功後跳轉至 `#/projects/:id`
- [x] 8.4 建立「專案詳情」視圖：左側文件樹 + 右側聊天區
- [x] 8.5 文件樹元件：呼叫 `GET /api/projects/:id/documents`，渲染 C1–C7 樹狀結構，空階段顯示灰色
- [x] 8.6 上傳表單：新增 phase 下拉（C1–C7），上傳時帶入 `project_id` 和 `phase`，成功後重新整理文件樹
- [x] 8.7 聊天區：問答請求帶入 `project_id`

## 9. 驗收

- [ ] 9.1 建立兩個專案，各自上傳不同文件，確認聊天互不干擾
- [ ] 9.2 在某專案中只上傳 C1 文件，詢問 C4 相關問題，確認 LLM 提示補傳 C4
- [ ] 9.3 文件樹顯示正確：有文件的 phase 列出檔名，空 phase 有視覺區別
- [x] 9.4 執行 `npm test`，確認既有 8 個測試仍全部通過
