## Context

回答由 `retrieval.answer()` 驅動:`buildSystemInstruction(hasNet, uploadedCodes)` 組出 system prompt(工具規則 + NPDS 目錄),模型再靠 `search_documents` 的 top-5 chunks 回答。prompt 中沒有專案名稱與任何專案背景,導致「100T」這類專案代稱被誤認成零件(檢索碰巧抓到「10/100/1000M」乙太網 chunk)。

現況相關事實:
- `answer()` 已為 netlist 解析出 `projectName`(`store.listProjects()` 找 id),可直接重用。
- `projects` 表只有 `id / name / created_at`;`chunks` 表已有 try/ALTER 相容遷移前例。
- 專案路由在 `src/routes/projects.js`,寫入路由一律掛 `blockWhenReadOnly`。
- 前端為單頁 `public/index.html`,READ_ONLY 時以 `body.read-only` class 隱藏寫入入口(上傳區同模式)。

## Goals / Non-Goals

**Goals:**
- 每個專案可儲存一段使用者輸入的「專案背景說明」(自由文字)。
- 回答時 system prompt 固定含專案名稱;背景非空時含背景區塊。
- 管理頁可編輯、READ_ONLY 唯讀(寫入 403、UI 隱藏)。

**Non-Goals:**
- 不做全域(跨專案)system prompt。
- 不做 prompt 模板/變數替換;背景就是純文字原樣注入。
- 不改檢索(embedding query 不附加背景)——先驗證 prompt 注入是否足夠。
- 不做編輯歷史/版本。

## Decisions

1. **存在 `projects.context` 欄位,而非獨立檔案或新表**
   - 專案中繼資料本來就在 `projects` 表;一欄 TEXT 足夠,`listProjects()` 一次帶出,不加查詢。
   - 遷移沿用 `chunks` 的 try/ALTER 模式(`ALTER TABLE projects ADD COLUMN context TEXT DEFAULT ''`,已存在則忽略),舊 DB 無痛升級。
   - 替代:`data/` 下每專案一個 .md 檔——多一套 IO 與路徑處理,且與現有專案 CRUD 分離,否決。

2. **API 用 `PATCH /api/projects/:id`(body `{ context }`)**
   - 與既有 `PATCH .../documents/:docId/phase` 一致的部分更新語意;掛 `blockWhenReadOnly`。
   - `GET /api/projects` 既有回應直接多帶 `context`,前端不用新端點。
   - 驗證:`context` 須為字串(可空字串=清除);長度上限 4000 字,避免 prompt 被塞爆。

3. **注入位置:`buildSystemInstruction` 開頭固定加專案名稱行;背景區塊放在 NPDS 目錄之前**
   - 名稱行無條件注入(`目前專案名稱:「<name>」`),即使背景空白也能消除「100T=零件?」歧義。
   - 背景用獨立標題「## 專案背景(使用者提供)」,標明來源是使用者輸入、非文件檢索結果,並提示模型優先用它解讀專案代稱。
   - 函式簽名改為傳入 `{ projectName, projectContext }`(`answer()` 已查到 project 物件,零額外查詢)。

4. **前端:專案頁標題旁「專案設定」按鈕開啟區塊(textarea + 儲存)**
   - 沿用現有 READ_ONLY 隱藏模式(與上傳區相同 class 控制);儲存後就地提示成功。
   - 替代:專案列表頁編輯——背景屬於進入專案後的情境,放詳情頁較直覺。

## Risks / Trade-offs

- [使用者輸入直接進 prompt,可能與系統規則矛盾(prompt injection by owner)] → 單機自用工具、輸入者即管理者;區塊標明「使用者提供」且置於系統規則之後,規則仍在前面。
- [背景寫錯導致答案跟著錯] → UI 標示「此內容會影響所有回答」;可隨時清空恢復原行為。
- [listProjects 增加欄位影響既有呼叫端] → 只增不減,既有欄位不變;測試覆蓋。
- [兩實例(read-only:3000 + admin:3001)同 DB] → better-sqlite3 WAL 已處理並行,PATCH 為單行 UPDATE,無交疊覆寫問題。
