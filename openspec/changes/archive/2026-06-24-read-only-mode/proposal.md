## Why

目前 UI 開放任何人上傳、刪除、搬移文件與新建專案。當這個 app 要分享給其他人使用時，沒有任何機制阻止他人亂上傳、刪檔或破壞既有資料。需要一個可切換的「唯讀模式」，讓分享出去的站台只能查詢與問答，不能寫入。

## What Changes

- 新增環境變數 `READ_ONLY`（預設 `false`）。設為 `true` 時站台進入唯讀模式。
- **後端強制阻擋（安全層）**：唯讀模式下，所有寫入路由回 `403`：
  - `POST /api/upload`（上傳 + 轉檔 + 灌入 RAG）
  - `POST /api/projects`（新建專案）
  - `DELETE /api/projects/:id/documents/:docId`（刪除文件）
  - `PATCH /api/projects/:id/documents/:docId/phase`（搬移 phase）
- `POST /api/chat`（問答）與所有 `GET` 讀取路由**不受影響，必須保持可用**。
- 新增 `GET /api/config` 端點，回傳 `{ readOnly: <boolean> }`，供前端得知目前模式。
- **前端隱藏（體驗層）**：唯讀模式下，前端隱藏左側上傳區（drop-zone、上傳按鈕）、每個檔案的刪除與搬移 phase 按鈕、以及新建專案入口。

設計重點：後端阻擋是真正的安全邊界（避免有人直接 `curl` 繞過前端）；前端隱藏只是讓一般使用者看不到入口，不能單獨依賴它做安全。

## Capabilities

### New Capabilities
- `read-only-mode`: 由 `READ_ONLY` 環境變數驅動的站台唯讀模式——後端對所有寫入路由的強制 403 阻擋、`GET /api/config` 模式查詢端點、以及前端依模式隱藏寫入入口。

### Modified Capabilities
<!-- 無既有 capability 的需求改變；唯讀模式是疊加在現有路由之上的新行為，集中於新 capability 描述。 -->

## Impact

- **新增**：`READ_ONLY` 環境變數、`GET /api/config` 路由、後端 read-only 阻擋 middleware。
- **修改後端**：`src/routes/upload.js`、`src/routes/projects.js`（掛上阻擋 middleware）、`src/app.js`（註冊 config 路由）。
- **修改前端**：`public/index.html`（啟動時讀 `/api/config`，依 `readOnly` 隱藏上傳區、刪除/搬移按鈕、新建專案入口）。
- **部署**：給他人使用的 instance（例如 systemd unit）設 `Environment=READ_ONLY=true`；管理者自用的 instance 不設此旗標。
- **無 breaking change**：未設定 `READ_ONLY` 時行為與現況完全相同。
