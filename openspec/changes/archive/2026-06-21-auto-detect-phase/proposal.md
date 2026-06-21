## Why

上傳 NPDS 文件時，User 必須手動選擇階段（C1–C7），但 NPDS 文件代碼（如 `C303`、`C401`）本身就隱含階段資訊。自動判別可減少操作步驟，且允許事後移動階段，解決上傳錯階段後需刪除重傳的問題。

## What Changes

- **前端（上傳表單）**：選取檔案後，解析檔名中的 NPDS 文件代碼（`C[1-7]\d+`）自動預選階段下拉選單；User 仍可手動更改後送出
- **前端（文件樹）**：每個檔案新增「移動階段」按鈕，點擊後彈出階段選擇器，確認後呼叫 PATCH API 更新
- **後端 API**：新增 `PATCH /api/projects/:id/documents/:docId/phase`，更新該文件所有 chunks 的 phase 欄位
- **vector store**：新增 `movePhase(docId, projectId, newPhase)` 方法

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `document-ingestion`：上傳前端新增檔名解析自動預選 phase 邏輯
- `document-management`：新增移動階段 API 及 vector store 操作
- `chat-ui`：上傳表單自動預填 phase；文件樹新增移動階段互動

## Impact

- `public/index.html`：file input `change` 事件加入 phase 自動偵測；doc tree 每個檔案加入移動階段 UI
- `src/routes/projects.js`：新增 PATCH `/:id/documents/:docId/phase` route
- `src/adapters/vector/sqlite.js`：新增 `movePhase` 方法（UPDATE chunks SET phase = ? WHERE doc_id = ? AND project_id = ?）
- 無新依賴、無資料庫 schema 變更（phase 欄位已存在）
