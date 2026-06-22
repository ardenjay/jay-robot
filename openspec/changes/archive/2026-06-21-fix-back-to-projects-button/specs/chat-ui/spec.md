## ADDED Requirements

### Requirement: Navigate between project list and project detail
UI SHALL 提供專案列表頁與專案內頁兩個視圖。進入某專案內頁時，標題列 SHALL 顯示「返回專案列表」按鈕；點擊後 SHALL 回到專案列表頁，供使用者新建或切換專案。位於專案列表頁時，該返回按鈕 SHALL 隱藏。

#### Scenario: Back button visible in project detail
- **WHEN** 使用者進入某專案內頁（`#/projects/<id>`）
- **THEN** 標題列顯示「返回專案列表」按鈕

#### Scenario: Back button returns to project list
- **WHEN** 使用者在專案內頁點擊「返回專案列表」按鈕
- **THEN** 畫面切換回專案列表頁，可見建立專案表單與既有專案清單

#### Scenario: Back button hidden on project list
- **WHEN** 使用者位於專案列表頁
- **THEN** 返回按鈕不顯示
