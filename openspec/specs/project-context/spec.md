# Spec: Project Context

## Purpose

每個專案可儲存一段使用者提供的「專案背景說明」,回答時連同專案名稱注入 system prompt,讓模型能正確解讀專案代稱與背景(例如「100T」指專案產品 EAR-100T7,而非某顆零件),不再只憑檢索到的 chunks 猜測。

---

## Requirements

### Requirement: Project stores a user-provided context
系統 SHALL 為每個專案儲存一段使用者提供的背景說明(`context`,自由文字,預設空字串),存於 `projects` 表;舊資料庫 SHALL 以相容遷移自動補欄位,既有資料不受影響。

#### Scenario: 舊 DB 自動遷移
- **WHEN** 以缺少 `context` 欄位的既有資料庫啟動 adapter
- **THEN** `projects` 表補上 `context` 欄位(預設空字串),既有專案資料完整保留

#### Scenario: 更新與讀取 context
- **WHEN** 呼叫 `updateProjectContext(id, context)` 後再 `listProjects()`
- **THEN** 回傳的該專案物件含更新後的 `context`

### Requirement: Project context is editable via API and blocked in read-only mode
系統 SHALL 提供 `PATCH /api/projects/:id` 更新專案 `context`(body `{ context }`,須為字串、長度上限 4000);`GET /api/projects` SHALL 回傳各專案的 `context`。唯讀模式下 PATCH SHALL 回 403。

#### Scenario: 更新成功
- **WHEN** 非唯讀模式下 PATCH `{ context: "100T = EAR-100T7 邊緣運算 Box PC" }`
- **THEN** 回 200,之後 `GET /api/projects` 該專案的 `context` 為更新後內容

#### Scenario: 無效輸入
- **WHEN** PATCH 的 `context` 非字串或超過 4000 字
- **THEN** 回 400 並附錯誤訊息

#### Scenario: 唯讀模式禁止寫入
- **WHEN** `READ_ONLY=1` 時 PATCH `/api/projects/:id`
- **THEN** 回 403,資料不變

### Requirement: Answer prompt includes project name and context
RAG 回答的 system instruction SHALL 固定包含目前專案名稱;專案 `context` 非空時 SHALL 另含「專案背景(使用者提供)」區塊,置於 system instruction 開頭(名稱行之後、工具規則與 NPDS 目錄之前)——小模型對長 prompt 中段注意力差,背景塞在中段會被忽略。背景區塊 SHALL 明示其內容為使用者直接提供的可信事實、可直接作為回答依據,並指示模型回答前先檢查背景是否已含答案;名稱與背景 SHALL NOT 被用來判定使用者的問題與專案無關(見 rag-query 的路由防護需求)。

#### Scenario: 專案名稱固定注入
- **WHEN** 對名為「100T」的專案提問(context 為空)
- **THEN** 送給 LLM 的 system instruction 含「目前專案名稱:「100T」」,且不含專案背景區塊

#### Scenario: context 注入
- **WHEN** 專案 context 為「100T = EAR-100T7」時提問
- **THEN** system instruction 含「專案背景(使用者提供)」區塊與該內容,並明示為可信、可直接引用的事實

#### Scenario: context 同時作為檢索結果首個 chunk
- **WHEN** context 非空且(模型或系統強制)呼叫 search_documents
- **THEN** 工具結果的第一個 chunk 為專案背景(title 標示「專案背景(使用者提供,可信事實)」、docId 為 null、不列入 sources),真實檢索 chunks 排在其後——小模型(qwen3:14b)實測只依據工具結果作答、忽略 system prompt 內的背景,塞進工具結果才會被使用

### Requirement: Project settings UI
專案詳情頁 SHALL 提供「專案設定」入口編輯背景說明(textarea + 儲存);唯讀模式 SHALL 隱藏此入口。儲存狀態 SHALL 清楚可辨:輸入內容與伺服器已存值不同時,儲存鈕可按並提示有未儲存的變更;相同時(含剛儲存成功、剛載入頁面)儲存鈕鎖定並顯示已儲存狀態。

#### Scenario: 編輯並儲存
- **WHEN** 管理模式下開啟專案設定、輸入背景並儲存
- **THEN** 呼叫 `PATCH /api/projects/:id`,成功後儲存鈕鎖定顯示「✓ 已儲存」

#### Scenario: 未儲存變更清楚可辨
- **WHEN** 使用者修改輸入框內容但尚未儲存
- **THEN** 儲存鈕變為可按,並顯示「有未儲存的變更」提示;儲存失敗時顯示錯誤且儲存鈕保持可按

#### Scenario: 唯讀模式隱藏
- **WHEN** 唯讀模式載入專案頁
- **THEN** 不顯示專案設定入口
