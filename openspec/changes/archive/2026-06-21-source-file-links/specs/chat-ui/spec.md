## MODIFIED Requirements

### Requirement: Source citations display
UI SHALL 在每個回答下方顯示所引用的來源文件連結列表。每個來源 SHALL 渲染為可點擊的 `<a target="_blank">` 超連結，點擊後在新分頁開啟對應原始文件。

#### Scenario: Answer with sources
- **WHEN** LLM 回答完成且 sources 列表非空
- **THEN** 回答下方出現「來源：」區塊，列出來源文件的可點擊連結（顯示 docId，href 為 url）

#### Scenario: No relevant sources found
- **WHEN** 資料庫為空或無相關 chunks
- **THEN** 來源區塊顯示「無相關文件」

#### Scenario: LLM reports no answer
- **WHEN** sources 列表為空陣列（LLM 無法回答）
- **THEN** 來源區塊不顯示任何連結
