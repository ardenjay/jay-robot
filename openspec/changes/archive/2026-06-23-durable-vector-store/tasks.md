## 1. 相依套件

- [x] 1.1 `npm install better-sqlite3`，確認可載入（prebuilt binary）
- [x] 1.2 `npm uninstall sql.js`（確認僅 `src/adapters/vector/sqlite.js` 用到）

## 2. 改寫 SqliteVectorAdapter（better-sqlite3）

- [x] 2.1 以 `new Database(this.dbPath)` 開檔；`db.pragma('journal_mode = WAL')`
- [x] 2.2 建構時建立 schema（`CREATE TABLE IF NOT EXISTS` projects / chunks，含 `project_id`、`phase` 欄位；保留 try/catch `ALTER TABLE` 對舊檔相容）
- [x] 2.3 移除 `_persist()` 與所有整檔覆寫；寫入改用 prepared statement 直接執行（可用交易包多筆 `add`）
- [x] 2.4 保留公開方法簽章與 `_ready`（設為已解析 Promise），讓 ingestion/retrieval/projects 與測試介面不變
- [x] 2.5 `add/search/clear/movePhase/listDocuments/isEmpty/createProject/listProjects` 以 better-sqlite3 的 `prepare().run()/.get()/.all()` 重寫，行為對等（search 仍 JS cosine）
- [x] 2.6 確保 `data/` 目錄存在（`mkdirSync` recursive）

## 3. 驗收

- [x] 3.1 `npm test`，確認 vector-adapter / ingestion 測試全部通過（介面對等）
- [x] 3.2 啟動 `npm start`，建立專案、上傳文件，確認可查詢；**重啟 server 後資料仍在**
- [x] 3.3 確認既有 `data/rag.db`（含 `100T` 專案）能被開啟、專案仍在
- [x] 3.4 確認寫入後 `data/rag.db` 直接更新（無 `_persist` 整檔覆寫路徑）
