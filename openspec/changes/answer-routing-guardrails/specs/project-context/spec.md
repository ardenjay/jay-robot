## MODIFIED Requirements

### Requirement: Answer prompt includes project name and context
RAG 回答的 system instruction SHALL 固定包含目前專案名稱;專案 `context` 非空時 SHALL 另含「專案背景(使用者提供)」區塊(置於 NPDS 文件目錄之前),供模型解讀專案代稱與背景。背景區塊 SHALL 明示其內容為使用者直接提供的可信事實、可直接作為回答依據;名稱與背景 SHALL NOT 被用來判定使用者的問題與專案無關(見 rag-query 的路由防護需求)。

#### Scenario: 專案名稱固定注入
- **WHEN** 對名為「100T」的專案提問(context 為空)
- **THEN** 送給 LLM 的 system instruction 含「目前專案名稱:「100T」」,且不含專案背景區塊

#### Scenario: context 注入
- **WHEN** 專案 context 為「100T = EAR-100T7」時提問
- **THEN** system instruction 含「專案背景(使用者提供)」區塊與該內容,並明示為可信、可直接引用的事實

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
