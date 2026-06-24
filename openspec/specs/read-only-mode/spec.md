## Purpose

提供可由環境變數切換的站台唯讀模式，讓 app 分享給其他人使用時，只能瀏覽與問答，無法上傳、刪除、搬移文件或新建專案。後端對寫入路由的強制阻擋為真正的安全邊界，前端隱藏寫入入口僅為體驗。

## Requirements

### Requirement: Read-only mode is toggled by environment variable

系統 SHALL 提供環境變數 `READ_ONLY` 控制站台是否進入唯讀模式。`READ_ONLY` 為字串 `"true"` 時啟用唯讀模式；未設定或為任何其他值時為一般（可寫入）模式，行為與導入本功能前完全相同。

#### Scenario: Read-only mode disabled by default
- **WHEN** 環境變數 `READ_ONLY` 未設定
- **THEN** 站台處於一般模式，所有寫入路由（上傳、新建專案、刪除文件、搬移 phase）正常運作

#### Scenario: Read-only mode enabled
- **WHEN** 環境變數 `READ_ONLY=true`
- **THEN** 站台進入唯讀模式，所有寫入路由被阻擋

### Requirement: Backend blocks all write routes in read-only mode

唯讀模式啟用時，後端 SHALL 對所有寫入路由回傳 HTTP `403` 並附帶錯誤訊息，且 SHALL 在執行任何寫入副作用（檔案寫入、轉檔、資料庫寫入、刪除）之前就阻擋。此阻擋為真正的安全邊界，不得僅依賴前端隱藏。受阻擋的路由為：`POST /api/upload`、`POST /api/projects`、`DELETE /api/projects/:id/documents/:docId`、`PATCH /api/projects/:id/documents/:docId/phase`。

#### Scenario: Upload blocked in read-only mode
- **WHEN** 唯讀模式啟用且收到 `POST /api/upload` 請求
- **THEN** 回傳 `403`，且不進行檔案儲存、轉檔或 RAG 寫入

#### Scenario: Project creation blocked in read-only mode
- **WHEN** 唯讀模式啟用且收到 `POST /api/projects` 請求
- **THEN** 回傳 `403`，且不建立新專案

#### Scenario: Document deletion blocked in read-only mode
- **WHEN** 唯讀模式啟用且收到 `DELETE /api/projects/:id/documents/:docId` 請求
- **THEN** 回傳 `403`，且不刪除任何文件或向量資料

#### Scenario: Phase move blocked in read-only mode
- **WHEN** 唯讀模式啟用且收到 `PATCH /api/projects/:id/documents/:docId/phase` 請求
- **THEN** 回傳 `403`，且文件的 phase 不變

#### Scenario: Direct API call cannot bypass the block
- **WHEN** 唯讀模式啟用，使用者以 `curl` 等工具繞過前端直接呼叫任一寫入路由
- **THEN** 仍回傳 `403`，不產生任何寫入副作用

### Requirement: Read routes remain available in read-only mode

唯讀模式 SHALL NOT 影響任何讀取與問答功能。`POST /api/chat`（問答）及所有 `GET` 讀取路由在唯讀模式下 SHALL 維持完全可用。

#### Scenario: Chat works in read-only mode
- **WHEN** 唯讀模式啟用且收到 `POST /api/chat` 請求
- **THEN** 正常進行檢索與問答，回傳答案

#### Scenario: Reading projects and documents works in read-only mode
- **WHEN** 唯讀模式啟用且收到讀取專案清單或文件樹的 `GET` 請求
- **THEN** 正常回傳資料

### Requirement: Config endpoint exposes the current mode

系統 SHALL 提供 `GET /api/config` 端點，回傳 JSON 物件，其中至少包含 `readOnly` 布林欄位，反映目前是否為唯讀模式。此端點 SHALL 在任何模式下都可讀取。

#### Scenario: Config reports read-only true
- **WHEN** 唯讀模式啟用且收到 `GET /api/config`
- **THEN** 回傳 `{ "readOnly": true }`

#### Scenario: Config reports read-only false
- **WHEN** 一般模式且收到 `GET /api/config`
- **THEN** 回傳 `{ "readOnly": false }`

### Requirement: Frontend hides write entry points in read-only mode

前端 SHALL 在載入時讀取 `GET /api/config`，當 `readOnly` 為 `true` 時隱藏所有寫入入口：左側上傳區（drop-zone 與上傳按鈕）、每個檔案的刪除按鈕與搬移 phase 按鈕、以及新建專案入口。一般模式下這些入口 SHALL 照常顯示。前端隱藏為體驗層，不取代後端阻擋。

#### Scenario: Write controls hidden in read-only mode
- **WHEN** 前端載入且 `/api/config` 回傳 `readOnly: true`
- **THEN** 上傳區、檔案的刪除與搬移按鈕、新建專案入口皆不顯示

#### Scenario: Write controls shown in normal mode
- **WHEN** 前端載入且 `/api/config` 回傳 `readOnly: false`
- **THEN** 上傳區、檔案的刪除與搬移按鈕、新建專案入口照常顯示
