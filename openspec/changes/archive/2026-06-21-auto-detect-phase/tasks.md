## 1. Vector Store — movePhase 方法

- [x] 1.1 在 `src/adapters/vector/sqlite.js` 新增 `async movePhase(docId, projectId, newPhase)` 方法：執行 `UPDATE chunks SET phase = ? WHERE doc_id = ? AND project_id = ?` 並呼叫 `_persist()`

## 2. 後端 API — PATCH phase 路由

- [x] 2.1 在 `src/routes/projects.js` 新增 `PATCH /:id/documents/:docId/phase` 路由：驗證 `req.body.phase` 在 VALID_PHASES 內，呼叫 `vectorStore.movePhase(docId, projectId, phase)`，回傳 `{ ok: true }` 或 400

## 3. 前端 — 上傳表單自動偵測 phase

- [x] 3.1 在 `public/index.html` 的 file input `change` 事件中，加入 `detectPhase(filename)` 函式（正則 `/C([1-7])\d{2}/i`），偵測到時設定 phase `<select>` 的 value

## 4. 前端 — 文件樹移動階段 UI

- [x] 4.1 在文件樹每個檔案行加入「移動」按鈕（`⇄`），點擊後在該行顯示 C1–C7 的 `<select>`（預選當前 phase）
- [x] 4.2 選單值變更時，呼叫 `PATCH /api/projects/:id/documents/:docId/phase`，成功後關閉選單並重新呼叫 `loadDocTree()`
- [x] 4.3 加入 Escape 鍵或點擊選單外部關閉移動階段選單的處理
