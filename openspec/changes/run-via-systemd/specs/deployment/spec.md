## ADDED Requirements

### Requirement: App runs as a managed systemd service

系統 SHALL 提供版控的 systemd unit 檔（`deploy/jay-robot.service`），使 app 能作為長駐系統服務運行，而非僅能以 `npm start` 手動前景啟動。該服務 SHALL：背景常駐（脫離啟動者的終端機/連線）、設定為開機自動啟動、在程序非預期結束時自動重啟，並將輸出導入系統日誌（journald）。

#### Scenario: Service survives terminal disconnect
- **WHEN** 服務已啟動，啟動者關閉終端機或 SSH 連線
- **THEN** 服務繼續運行，不受連線中斷影響

#### Scenario: Service starts on boot
- **WHEN** 服務已 enable，主機重新開機
- **THEN** 服務在開機後自動啟動，無需人工介入

#### Scenario: Service restarts after crash
- **WHEN** 服務程序非預期結束（crash 或被 kill）
- **THEN** systemd 依 `Restart=always` 自動重新拉起服務

#### Scenario: Logs go to journald
- **WHEN** 服務運行並輸出訊息
- **THEN** 可透過 `journalctl -u jay-robot` 查得歷史與即時 log

### Requirement: Service runs with an explicit execution environment

unit 檔 SHALL 明確指定執行身分與環境，使服務不依賴啟動者的登入 shell 狀態。具體 SHALL 設定：執行使用者（`User=jay`）、工作目錄（`WorkingDirectory` 指向專案根目錄）、以及包含 conda 與系統路徑的 `PATH`，讓 `conda`（MinerU/markitdown）與 `python3`（netparse）等子程序可被 `spawn` 找到。機密（如 `GEMINI_API_KEY`）SHALL 經由 `EnvironmentFile`（`.env`）讀入，不得寫死在 unit 檔內。

#### Scenario: conda and python3 are reachable from the service
- **WHEN** 服務在唯讀以外的模式下處理需要 MinerU/markitdown 或 netparse 的請求
- **THEN** 子程序 `conda` 與 `python3` 能被找到並執行（因 unit 的 `PATH` 已含 conda 與系統路徑）

#### Scenario: Secrets loaded from .env, not the unit file
- **WHEN** 服務啟動
- **THEN** `GEMINI_API_KEY` 等機密由 `EnvironmentFile=.env` 載入，unit 檔本身不含機密值

#### Scenario: Working directory pins the data location
- **WHEN** 服務啟動
- **THEN** 以 `WorkingDirectory` 為基準解析 `data/rag.db`，指向專案既有的資料庫

### Requirement: Shared instance runs in read-only mode

提供給其他人使用的 systemd 實例 SHALL 透過 `Environment=READ_ONLY=true` 啟用唯讀模式，使所有寫入路由被阻擋、僅保留查詢與問答。

#### Scenario: Shared service is read-only
- **WHEN** 以 `deploy/jay-robot.service`（含 `READ_ONLY=true`）啟動服務並查詢 `GET /api/config`
- **THEN** 回傳 `{ "readOnly": true }`，且寫入路由回 403

### Requirement: Deployment and operations are documented

README SHALL 記載以 systemd 部署與維運的步驟，至少涵蓋：安裝（複製 unit、`daemon-reload`、`enable --now`、檢查 `status`）、查看 log（`journalctl`）、改動 code 或 `.env` 後需 `restart` 才生效，以及多實例注意事項（admin 實例需從相同工作目錄、使用不同 `PORT` 啟動以共用同一顆 DB；不可同時運行兩個會寫入的實例）。

#### Scenario: Operator can install and verify the service from the docs
- **WHEN** 維運者依 README 步驟安裝並啟動服務
- **THEN** 能完成安裝、確認服務 active，並透過文件所述指令查 log 與重啟

#### Scenario: Restart requirement is documented
- **WHEN** 維運者修改了 `src/` 程式碼或 `.env`
- **THEN** README 已說明需執行 `systemctl restart jay-robot` 才會生效
