## 1. Backend: read-only middleware

- [x] 1.1 新增 `src/middleware/readOnly.js`，匯出 `blockWhenReadOnly(req, res, next)`：當 `process.env.READ_ONLY === 'true'` 回 `403 { error: '此站台為唯讀模式，不開放上傳/修改' }`，否則 `next()`
- [x] 1.2 在 `src/routes/upload.js` 將 `blockWhenReadOnly` 掛在 `upload.single('file')` 之前（唯讀時連 multer 都不接收檔案）
- [x] 1.3 在 `src/routes/projects.js` 將 `blockWhenReadOnly` 掛在 `POST /`、`DELETE /:id/documents/:docId`、`PATCH /:id/documents/:docId/phase` 之前；確認 `GET` 與 `POST /api/chat` 不掛

## 2. Backend: config endpoint

- [x] 2.1 新增 `GET /api/config` 路由，回傳 `{ readOnly: process.env.READ_ONLY === 'true' }`（新檔 `src/routes/config.js` 或併入既有路由）
- [x] 2.2 在 `src/app.js` 註冊 config 路由，確認任何模式下都可讀取

## 3. Frontend: hide write entry points

- [x] 3.1 `public/index.html` 初始化時 `fetch('/api/config')`，取得 `readOnly` 旗標
- [x] 3.2 `readOnly` 為 true 時隱藏左側上傳區（drop-zone、上傳按鈕、相關狀態/log 區）
- [x] 3.3 `readOnly` 為 true 時不渲染每個檔案的刪除（del-btn）與搬移 phase（move-btn）按鈕
- [x] 3.4 `readOnly` 為 true 時隱藏新建專案入口
- [x] 3.5 `readOnly` 為 false 時所有寫入入口照常顯示（回歸確認既有行為不變）

## 4. Tests

- [x] 4.1 新增測試：`READ_ONLY=true` 時四個寫入路由皆回 403、且無寫入副作用
- [x] 4.2 新增測試：`READ_ONLY=true` 時 `POST /api/chat` 與讀取 GET 仍正常（非 403）
- [x] 4.3 新增測試：`GET /api/config` 在 true / 未設定 兩種情況分別回 `readOnly: true` / `false`
- [x] 4.4 將新測試加入 `package.json` 的 test script 並確認 `npm test` 全綠

## 5. Docs & deployment

- [x] 5.1 在 README / 部署說明補上 `READ_ONLY` 用法，與 systemd unit 範例（`Environment=READ_ONLY=true`）
- [x] 5.2 手動驗收：以 `READ_ONLY=true` 啟動隔離 instance（mock LLM + 隔離 cwd 的拋棄式 DB，未碰真實 `data/rag.db`）；`curl` 四條寫入路由皆回 403、GET /api/config 回 `{readOnly:true}`、GET 讀取與 chat 非 403。瀏覽器視覺確認留給使用者
