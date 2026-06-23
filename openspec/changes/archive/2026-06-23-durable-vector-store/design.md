## Context

`SqliteVectorAdapter`（`src/adapters/vector/sqlite.js`）目前用 sql.js：`_init()` 把檔案讀進記憶體建立 `SQL.Database`，每次寫入後 `_persist()` 以 `db.export()` 整檔覆寫 `data/rag.db`。問題：整檔覆寫 + 無鎖 → 多實例交疊時後寫蓋前寫、資料遺失。

better-sqlite3 是 Node 的同步、檔案型 SQLite 綁定（有 prebuilt binaries）。寫入直接進檔、支援交易與 WAL，多讀單寫由 SQLite 檔案鎖保證，不再有「整檔覆寫」。

## Goals / Non-Goals

**Goals:**
- 以 better-sqlite3 取代 sql.js，消除整檔覆寫/後寫蓋前寫造成的資料遺失
- 維持既有公開方法、schema、`_ready` 與測試介面不變
- 既有 `data/rag.db` 可直接沿用（標準 SQLite 格式）

**Non-Goals:**
- 不引入 sqlite-vec 或改變搜尋演算法（維持 JS 端 cosine）
- 不改 chunk schema 或 embedding 儲存格式（仍 TEXT/JSON）
- 不改 LLM / ingestion / 前端

## Decisions

### 1. better-sqlite3 + WAL，直接檔案寫入

**決定**：`new Database(dbPath)`；啟用 `db.pragma('journal_mode = WAL')`。所有寫入用 prepared statement 直接執行，**移除 `_persist()` 與 init 時的重寫**。

**理由**：WAL 提供較佳的並行（多讀單寫）與崩潰耐受；直接寫檔即根治整檔覆寫。即使誤開兩個實例，SQLite 鎖會序列化寫入、不會整檔互蓋。

---

### 2. 維持公開介面與 `_ready`，內部改同步

**決定**：方法簽章維持 `async`（呼叫端續用 `await`）；better-sqlite3 為同步，故內部不需 await。建構為同步，但保留 `this._ready = Promise.resolve()` 以相容既有 `await store._ready` 與測試。

**理由**：最小化對 ingestion/retrieval/projects/測試的衝擊；介面不變即可無痛替換。

---

### 3. Schema 與資料沿用

**決定**：沿用 `projects` 與 `chunks` 表與欄位（含 `project_id`、`phase`）；以 `CREATE TABLE IF NOT EXISTS` + 既有 `ALTER TABLE ... ADD COLUMN`（try/catch）保留對舊檔的相容。embedding 續存 JSON TEXT。

**理由**：better-sqlite3 可直接開啟 sql.js 寫出的標準 SQLite 檔，現有 `data/rag.db`（含專案列）不受影響；schema 不變則 search/儲存邏輯照舊。

---

### 4. 移除 sql.js 相依

**決定**：`package.json` 移除 `sql.js`（僅此 adapter 使用），新增 `better-sqlite3`。

**理由**：避免遺留無用依賴；降低混淆。

## Risks / Trade-offs

- **native 套件**：better-sqlite3 需對應 Node ABI 的 binary；有 prebuilt（linux-x64 常見環境免編譯），但若環境特殊可能需 build tools。apply 時以 `npm install` 驗證。
- **同步 I/O**：better-sqlite3 為同步呼叫，會阻塞事件迴圈；對本地單機、低併發的工具可接受，且寫入通常很快。
- **行為對等**：查詢/排序邏輯不變（JS cosine），風險低；以既有測試（vector-adapter / ingestion）驗證對等。
- **並行**：WAL + 鎖可防止「整檔互蓋」式遺失；仍建議單一 server 實例，但已非災難性。
