## Context

app 是 Express（commonjs）伺服器，入口 `node src/app.js`，目前以 `npm start` 手動啟動。它有幾個執行期外部依賴：`spawn('conda', …)` 跑 MinerU/markitdown、`execFile('python3', …)` 跑 netparse、better-sqlite3 原生模組、以及 `.env` 裡的 `GEMINI_API_KEY`。DB 路徑為 `process.cwd()/data/rag.db`（綁工作目錄）。已實作的唯讀模式由 `READ_ONLY=true` 啟用。

主機為 Linux（systemd 255、user `jay`、node v22 在 `/usr/bin/node`、conda 在 `/home/jay/miniconda3`）。目標是把「給別人用」的實例變成 systemd 託管的唯讀長駐服務。

## Goals / Non-Goals

**Goals:**
- 一份版控、可重現的 systemd unit 檔，提供常駐/開機自起/自動重啟/journald log。
- 執行環境明確（user、工作目錄、PATH 含 conda、env 由 .env 載入），不依賴登入 shell。
- 分享實例預設唯讀。
- 文件化安裝與維運，含多實例與 restart 注意事項。

**Non-Goals:**
- 不改應用程式邏輯（`src/` 不動）。
- 不導入反向代理 / TLS / 容器化（屬另一層，未來可另開 change）。
- 不讓 DB 路徑可由環境變數設定（那是獨立議題，必要時另開 change）。
- 不做多核 / cluster / 零停機部署。

## Decisions

### 決策 1：unit 檔放在 repo 的 `deploy/`，安裝時 `cp` 到 `/etc/systemd/system/`
版控一份來源真相，安裝是把它複製過去再 `daemon-reload`。

- **為何**：unit 檔可審閱、可追蹤變更、可重現；直接在 `/etc/systemd/system/` 手寫無版控、難重建。
- **替代方案**：用 systemd `systemctl link` 直接連到 repo 檔 → 連結到使用者目錄較不直觀，且 repo 路徑變動會壞；`cp` 最簡單明確。

### 決策 2：`PATH` 明確含 conda
unit 設 `Environment=PATH=/home/jay/miniconda3/condabin:/home/jay/miniconda3/bin:/usr/local/bin:/usr/bin:/bin`。

- **為何**：systemd 服務的預設 `PATH` 不含 conda；`spawn('conda', …)` 會 `ENOENT`，PDF/Office 上傳轉檔全壞。這是把 npm start 搬到 systemd 最常見的故障點。
- **權衡**：路徑寫死於特定主機的 conda 安裝位置——可接受，因 unit 本就是該主機的部署設定；換機器時調整這行即可。

### 決策 3：機密走 `EnvironmentFile=.env`，不寫進 unit
- **為何**：unit 檔要進 git，不能含 `GEMINI_API_KEY`；`.env` 已被 gitignore 且現存。既有 `dotenv` 也會讀 `.env`，兩者一致、不衝突。

### 決策 4：分享實例 `Environment=READ_ONLY=true`
- **為何**：給別人用的這台只能查詢；複用已實作並測試過的唯讀模式（後端 403 + 前端隱藏）。

### 決策 5：admin 與唯讀實例的關係靠文件規範，不靠 code
admin 要寫入時，從**相同工作目錄**、用**不同 `PORT`**（如 3001）跑 `npm start`（不設 READ_ONLY），與唯讀服務共用同一顆 `data/rag.db`。

- **為何**：better-sqlite3 + WAL 的 SQLite 檔案鎖是跨程序的「多讀單寫」，唯讀實例不寫、admin 偶爾寫 → 安全。
- **風險防線**：明確在文件警告「不可同時運行兩個會寫入的實例」，避免重演 sql.js 時代的整檔互蓋資料遺失。

## Risks / Trade-offs

- **[漏設 conda PATH → 上傳轉檔壞]** → unit 明確設 PATH；README 安裝後驗收步驟包含查 log 是否有 spawn 錯誤。（唯讀實例本身不上傳，但設好 PATH 讓同一份 unit 也能用於非唯讀場景。）
- **[兩個寫入者同時跑 → 寫入序列化或衝突]** → 文件規範單一寫入者；唯讀實例零寫入。
- **[admin 從不同目錄啟動 → 指到另一顆空 DB]** → 文件明確要求 admin 從相同 `WorkingDirectory` 啟動。
- **[unit 內 PATH 綁特定 conda 路徑，換機失效]** → 視為主機部署設定，README 註明換機需調整。
- **[改 .env/code 後忘了 restart]** → README 明列 restart 為必要步驟。

## Migration Plan

1. 合併後，`deploy/jay-robot.service` 進 repo；不影響任何現有 `npm start` 流程。
2. 在主機 `sudo cp` unit → `daemon-reload` → `enable --now` → `status`/`journalctl` 驗收 → `curl /api/config` 應為 `{readOnly:true}`、寫入路由 403。
3. 回滾：`sudo systemctl disable --now jay-robot` 並移除 unit；回到手動 `npm start`，無資料變更。
