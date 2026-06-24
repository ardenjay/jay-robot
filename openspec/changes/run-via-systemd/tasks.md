## 1. systemd unit 檔

- [x] 1.1 在 `deploy/jay-robot.service` 建立版控的 unit 檔：`Type=simple`、`User=jay`、`WorkingDirectory=/data/extra/jay/jay-robot`、`ExecStart=/usr/bin/node src/app.js`、`Restart=always`、`After=network.target`、`WantedBy=multi-user.target`
- [x] 1.2 unit 設 `Environment=PATH=/home/jay/miniconda3/condabin:/home/jay/miniconda3/bin:/usr/local/bin:/usr/bin:/bin`（含 conda 與系統路徑）
- [x] 1.3 unit 設 `Environment=NODE_ENV=production`、`Environment=PORT=3000`、`Environment=READ_ONLY=true`（分享實例唯讀）
- [x] 1.4 unit 設 `EnvironmentFile=/data/extra/jay/jay-robot/.env`（讀 GEMINI_API_KEY 等機密；不把機密寫進 unit）

## 2. 文件

- [x] 2.1 README 新增「以 systemd 部署」章節：安裝步驟（`sudo cp deploy/jay-robot.service /etc/systemd/system/`、`daemon-reload`、`enable --now`、`status`）
- [x] 2.2 README 補維運指令：`journalctl -u jay-robot -f`（log）、`systemctl restart jay-robot`（改 code/.env 後生效）、`stop`/`disable`
- [x] 2.3 README 補注意事項：改 `src/` 或 `.env` 要 restart；admin 需從相同工作目錄、用不同 `PORT` 跑 `npm start` 以共用同一顆 DB；不可同時運行兩個會寫入的實例

## 3. 驗收

- [x] 3.1 `systemd-analyze verify deploy/jay-robot.service` 通過（unit 語法正確，exit 0）
- [ ] 3.2 安裝並啟動後 `systemctl status jay-robot` 為 active (running)，`journalctl` 可見 "Jay Robot running" 與 "[Gemini] key 載入" 且無 spawn/ENOENT 錯誤 —— **需在主機 sudo 安裝後由使用者驗收**
- [ ] 3.3 `curl localhost:3000/api/config` 回 `{"readOnly":true}`；`curl -X POST localhost:3000/api/upload` 回 403 —— **需安裝後驗收**
- [ ] 3.4 驗證常駐性：關閉啟動用的終端機/連線後服務仍在；`systemctl restart` 後自動回復 —— **需安裝後驗收**
