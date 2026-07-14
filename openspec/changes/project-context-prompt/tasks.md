## 1. 資料層(adapter)

- [x] 1.1 `src/adapters/vector/sqlite.js`:`projects` 表 schema 加 `context TEXT DEFAULT ''` + try/ALTER 相容遷移;`listProjects()` 回傳含 `context`
- [x] 1.2 新增 `updateProjectContext(id, context)`(單行 UPDATE)
- [x] 1.3 測試(temp DB):舊 DB 遷移後資料保留、update 後 listProjects 帶回新值

## 2. API 層

- [x] 2.1 `src/routes/projects.js`:新增 `PATCH /:id`(掛 `blockWhenReadOnly`);驗證 `context` 為字串且 ≤ 4000 字,否則 400
- [x] 2.2 測試:PATCH 成功後 GET 帶回 context;非字串/超長 400;`READ_ONLY=1` 時 403

## 3. Prompt 注入

- [x] 3.1 `src/services/retrieval.js`:`buildSystemInstruction` 改收 `{ projectName, projectContext }`,固定注入「目前專案名稱」行;context 非空時加「## 專案背景(使用者提供)」區塊(NPDS 目錄之前);`answer()` 傳入既有查到的 project 物件
- [x] 3.2 測試(mock adapter 擷取 contents):prompt 含專案名;context 非空含背景區塊、為空不含

## 4. 前端

- [x] 4.1 `public/index.html`:專案詳情頁加「專案設定」入口(textarea + 儲存,呼叫 PATCH,成功提示);READ_ONLY 隱藏(沿用現有 class 模式)

## 5. 驗證

- [x] 5.1 `npm test` 全綠;不碰真實 `data/rag.db`
- [x] 5.2 使用者驗收:在 100T 專案填入背景(如「100T = EAR-100T7…」)後,重問「100T 有幾個 CAN」確認不再誤認
