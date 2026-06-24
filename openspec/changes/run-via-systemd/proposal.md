## Why

目前這個 app 只能用 `npm start` 手動啟動，綁在啟動者的終端機/SSH 連線上——連線一斷服務就死、機器重開不會自動回來、crash 沒人重啟、log 也只在終端機。要真正「上線」分享給其他人用，需要把它變成一個由 systemd 託管的長駐系統服務。

## What Changes

- 新增版控的 systemd unit 檔 `deploy/jay-robot.service`，讓服務：
  - 背景常駐（脫離終端機/SSH 連線）
  - 開機自動啟動（`WantedBy=multi-user.target`）
  - crash 自動重啟（`Restart=always`）
  - log 進 journald（`journalctl -u jay-robot`）
- 以 `User=jay`、`WorkingDirectory=/data/extra/jay/jay-robot` 執行。
- **明確設定 `PATH`** 含 conda 與系統路徑，讓 `conda`（MinerU/markitdown）與 `python3`（netparse）可被 `spawn` 找到——systemd 預設環境很乾淨、不含 conda，這是最容易踩的坑。
- 機密（`GEMINI_API_KEY` 等）由 `EnvironmentFile=.env` 讀入，不寫進 unit 檔。
- 分享給他人的這台設 `Environment=READ_ONLY=true`（搭配既有唯讀模式）。
- README 補上安裝與維運說明：安裝（`cp` unit、`daemon-reload`、`enable --now`、`status`）、查 log（`journalctl -f`）、改 code/`.env` 後 `restart`，以及多實例注意事項。

不改任何應用程式邏輯，純部署/維運層。

## Capabilities

### New Capabilities
- `deployment`: 以 systemd 將 app 作為長駐服務運行的部署方式——背景常駐、開機自起、crash 自動重啟、明確的執行環境（PATH/env/工作目錄），以及維運流程。

### Modified Capabilities
<!-- 無既有 capability 的需求改變 -->

## Impact

- **新增**：`deploy/jay-robot.service`（版控的 unit 檔）。
- **修改**：`README.md`（安裝與維運章節）。
- **不改 code**：`src/` 不動；服務啟動的仍是現有的 `node src/app.js`。
- **執行需求**：部署主機需有 `node`、conda envs（mineru/markitdown）、`python3`、`.env`（含 `GEMINI_API_KEY`）、且 better-sqlite3 原生模組已可載入。
- **資料**：DB 沿用 `WorkingDirectory` 下的 `data/rag.db`；唯讀服務與 admin 實例可共用同一顆（SQLite WAL：多讀單寫安全），但不可同時開兩個寫入者。
