## Why

模型回答時不知道專案本身是什麼:實例「100T 有幾個 CAN」,「100T」是專案名稱(產品 EAR-100T7),但 system prompt 完全沒有專案名稱與背景,模型只憑檢索到的 top-5 chunks 猜,把 100T 誤認成 RTL8211F(「10/100/1000M」字面相近)。需要讓使用者為每個專案輸入背景說明,回答時注入 system prompt,消除這類指涉歧義。

## What Changes

- `projects` 表新增 `context` 欄位(TEXT,預設空字串),沿用既有 try/ALTER 相容遷移模式。
- Vector adapter 新增 `updateProjectContext(id, context)`;`listProjects()` 回傳含 `context`。
- 新增 API `PATCH /api/projects/:id`:更新專案 context(唯讀模式 403)。
- `retrieval.answer()` 的 system instruction 固定注入「目前專案名稱」一行;專案 context 非空時,加入「## 專案背景(使用者提供)」區塊(置於 NPDS 文件目錄之前)。
- 前端專案頁新增「專案設定」入口(textarea + 儲存),READ_ONLY 模式隱藏(同上傳區模式)。

## Capabilities

### New Capabilities

- `project-context`: 每個專案可儲存使用者提供的背景說明;透過 API 讀寫(唯讀模式禁止寫入),並於 RAG 回答時連同專案名稱注入 system prompt。

### Modified Capabilities

<!-- 無:vector-adapter / rag-query / read-only-mode 的既有需求不變,新行為全部收在 project-context 能力內 -->

## Impact

- `src/adapters/vector/sqlite.js`:schema 遷移、`updateProjectContext`、`listProjects` 含 context。
- `src/routes/projects.js`:新增 `PATCH /:id`(掛 `blockWhenReadOnly`)。
- `src/services/retrieval.js`:`buildSystemInstruction` 增加專案名稱與背景區塊;`answer()` 傳入專案資料。
- `public/index.html`:專案設定 UI(READ_ONLY 隱藏)。
- 測試:`tests/`(temp DB + mock LLM,不碰真實 `data/rag.db`)。
