## ADDED Requirements

### Requirement: Create project
系統 SHALL 允許使用者建立新專案，提供名稱（必填）與描述（選填）。

#### Scenario: Create project with valid name
- **WHEN** 使用者送出包含名稱的建立專案請求
- **THEN** 系統建立專案並回傳 HTTP 201 及新專案的 `id`、`name`、`created_at`

#### Scenario: Create project with empty name
- **WHEN** 使用者送出名稱為空的建立專案請求
- **THEN** 系統回傳 HTTP 400 並說明名稱為必填

### Requirement: List projects
系統 SHALL 提供列出所有專案的 API，回傳每個專案的 `id`、`name`、`created_at`。

#### Scenario: No projects exist
- **WHEN** 使用者請求專案列表且尚未建立任何專案
- **THEN** 系統回傳 HTTP 200 及空陣列

#### Scenario: Projects exist
- **WHEN** 使用者請求專案列表
- **THEN** 系統回傳所有專案，依建立時間降序排列

### Requirement: Project data isolation
每個專案的文件 chunks SHALL 與其他專案完全隔離，向量搜尋 SHALL 只在指定專案範圍內進行。

#### Scenario: Search does not cross project boundaries
- **WHEN** 在專案 A 中進行向量搜尋
- **THEN** 搜尋結果中不包含任何屬於其他專案的 chunks
