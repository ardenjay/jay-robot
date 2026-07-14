## ADDED Requirements

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
RAG 回答的 system instruction SHALL 固定包含目前專案名稱;專案 `context` 非空時 SHALL 另含「專案背景(使用者提供)」區塊(置於 NPDS 文件目錄之前),供模型解讀專案代稱與背景。

#### Scenario: 專案名稱固定注入
- **WHEN** 對名為「100T」的專案提問(context 為空)
- **THEN** 送給 LLM 的 system instruction 含「目前專案名稱:「100T」」,且不含專案背景區塊

#### Scenario: context 注入
- **WHEN** 專案 context 為「100T = EAR-100T7」時提問
- **THEN** system instruction 含「專案背景(使用者提供)」區塊與該內容

### Requirement: Project settings UI
專案詳情頁 SHALL 提供「專案設定」入口編輯背景說明(textarea + 儲存);唯讀模式 SHALL 隱藏此入口。

#### Scenario: 編輯並儲存
- **WHEN** 管理模式下開啟專案設定、輸入背景並儲存
- **THEN** 呼叫 `PATCH /api/projects/:id`,成功後顯示已儲存提示

#### Scenario: 唯讀模式隱藏
- **WHEN** 唯讀模式載入專案頁
- **THEN** 不顯示專案設定入口
