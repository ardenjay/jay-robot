## 1. Backend：DELETE API

- [x] 1.1 在 `src/routes/projects.js` 新增 `DELETE /:id/documents/:docId` 路由
- [x] 1.2 路由中呼叫 `vectorStore.clear(docId, projectId)`，回傳 HTTP 200

## 2. Frontend：文件樹刪除按鈕

- [x] 2.1 在文件樹每筆文件旁加入刪除按鈕（`×`），僅在 hover 時顯示
- [x] 2.2 點擊刪除按鈕後以 `confirm()` 詢問確認
- [x] 2.3 確認後呼叫 `DELETE /api/projects/:projectId/documents/:docId`（需 `encodeURIComponent`）
- [x] 2.4 刪除成功後呼叫 `loadDocTree()` 更新文件樹

## 3. 驗收

- [ ] 3.1 啟動 `npm start`，在文件樹中刪除一份文件，確認樹狀結構即時更新
- [ ] 3.2 確認取消刪除時文件樹不變
- [x] 3.3 執行 `npm test`，確認 8 個測試仍全部通過
