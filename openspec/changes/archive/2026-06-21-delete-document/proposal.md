## Why

目前使用者上傳錯誤或過時的文件後，沒有辦法從專案中移除，只能重新上傳同名檔案覆蓋。需要提供明確的刪除入口，讓使用者能從文件樹中直接刪除個別文件。

## What Changes

- 新增 `DELETE /api/projects/:projectId/documents/:docId` API，刪除指定文件的所有 chunks
- 文件樹中每個文件名稱旁加入刪除按鈕，點擊後確認再呼叫 API，成功後更新文件樹

## Capabilities

### New Capabilities

- `document-management`：管理已上傳文件的生命週期，包含刪除個別文件

### Modified Capabilities

無

## Impact

- `src/routes/projects.js`：新增 `DELETE /:id/documents/:docId` 路由
- `public/index.html`：文件樹每筆文件加入刪除按鈕與確認流程
- 無資料庫 schema 異動（`clear(docId, projectId)` 已存在於 vector adapter）
