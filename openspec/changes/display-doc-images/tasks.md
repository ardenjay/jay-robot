## 1. 答案內嵌圖（位置 A）

- [x] 1.1 `public/index.html` 加圖片樣式：答案/檢視器內的 `img` 受限呈現（`max-width:100%`、`height:auto`、`display:block`），避免溢版
- [x] 1.2 `src/services/retrieval.js` 的 `buildSystemInstruction` 加引導：相關時可帶出檢索內容中既有的圖片連結（絕對路徑），且禁止杜撰任何圖片路徑

## 2. 來源檢視器端點（後端，位置 B）

- [x] 2.1 新增 `GET /api/projects/:projectId/documents/:docId/view`：`dir = public/documents/<proj>/<docId>`，是目錄 → 讀並合併所有 `.md` 回 `{ type:'markdown', markdown }`；是檔案 → 回 `{ type:'file', url }`；不存在 → 404
- [x] 2.2 確認此路由為 GET、未掛 `blockWhenReadOnly`（唯讀模式可用）；在 `src/app.js`/`projects` 路由註冊

## 3. 來源檢視器前端（位置 B）

- [x] 3.1 來源項目改為可點擊觸發檢視（不再只是 `target="_blank"` 連結）
- [x] 3.2 點擊 → 打 view 端點；`type:'markdown'` → 開 modal 以 marked 渲染（含圖）；`type:'file'` → `window.open(url)`（fallback 維持現行）
- [x] 3.3 modal 可關閉（Esc / 點背景 / 關閉鈕），內容套用與答案相同的 img 樣式

## 4. 測試

- [x] 4.1 後端測 view 端點：目錄型 docId（temp docsRoot 放多 md+圖）→ 回 `markdown` 且含絕對路徑圖連結與合併內容；檔案型 docId → 回 `file` + url；不存在 → 404（不碰真實 `data/rag.db`/`public`）
- [x] 4.2 將新測試加入 `package.json` test script 並確認 `npm test` 全綠

## 5. 驗收（瀏覽器，留給使用者）

- [ ] 5.1 問一個答案含圖的問題 → 圖顯示且不溢版
- [x] 5.2 點 folder 文件來源 → modal 渲染 md+圖；點 web PDF 來源 → 新分頁開 PDF
- [ ] 5.3 唯讀模式下點來源檢視仍可用
