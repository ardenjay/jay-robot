## ADDED Requirements

### Requirement: Project list view
UI SHALL 在首頁顯示所有專案列表，每個專案顯示名稱與建立時間，並提供建立新專案的入口。

#### Scenario: No projects exist
- **WHEN** 使用者開啟首頁且尚未建立任何專案
- **THEN** UI 顯示空狀態提示，引導使用者建立第一個專案

#### Scenario: Projects listed
- **WHEN** 使用者開啟首頁且已有專案
- **THEN** 顯示所有專案卡片，點擊可進入專案詳情頁

### Requirement: Create project form
UI SHALL 提供建立專案的表單，包含名稱（必填）欄位。

#### Scenario: Create project success
- **WHEN** 使用者填入名稱並送出
- **THEN** 系統建立專案後自動跳轉至該專案的詳情頁

#### Scenario: Create project with empty name
- **WHEN** 使用者送出空名稱
- **THEN** UI 顯示欄位錯誤，不送出請求

### Requirement: Project detail view with document tree and chat
UI SHALL 在專案詳情頁顯示：左側文件樹（C1–C7 階段）、右側聊天區域，並保留上傳入口（附帶 phase 選擇）。

#### Scenario: Upload file with phase selection
- **WHEN** 使用者在專案詳情頁選擇 phase（C1–C7）並上傳 `.md` 檔案
- **THEN** 文件上傳後自動歸屬至該 phase，文件樹即時更新

#### Scenario: Chat within project scope
- **WHEN** 使用者在專案詳情頁輸入問題
- **THEN** 問答僅在該專案的文件範圍內進行，不跨專案

## MODIFIED Requirements

### Requirement: Single-page application
UI SHALL 為單一 HTML 頁面，使用 hash routing（`#/`、`#/projects/:id`）在不同視圖間切換，無需整頁重載。

#### Scenario: Navigate to project detail
- **WHEN** 使用者點擊專案列表中的某個專案
- **THEN** URL hash 更新為 `#/projects/:id`，頁面切換至該專案的詳情視圖，無整頁重載

#### Scenario: Page load
- **WHEN** 使用者開啟 `http://localhost:3000`
- **THEN** 頁面呈現專案列表視圖，無需任何登入或設定
