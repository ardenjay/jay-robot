## Why

目前 `SqliteVectorAdapter` 用 **sql.js（純記憶體 SQLite）**，每次寫入都把整個 DB 從記憶體匯出、**整檔覆寫** `data/rag.db`，且無任何並行保護。這導致：

- 多個 server 實例（或測試/重啟交疊）會**互相整檔覆寫，後寫蓋前寫**，造成資料無聲遺失（本次已實際發生：某專案的 chunks 全數消失）。
- 啟動時 `_init()` 無條件 `_persist()`，多一次無謂的整檔重寫。
- 整個 DB 常駐記憶體，大資料量時記憶體與寫入成本高。

改用**檔案型 SQLite（better-sqlite3）**可從根本消除「整檔覆寫 / 後寫蓋前寫」這類資料遺失。

## What Changes

- `SqliteVectorAdapter` 改用 **better-sqlite3**：寫入直接進檔案、具交易與 SQLite 檔案鎖，啟用 **WAL** 模式
- 移除 sql.js 的「記憶體 DB + `_persist()` 整檔覆寫」機制與 init 時的重寫
- 公開方法與 schema 維持不變（`add/search/clear/movePhase/listDocuments/isEmpty/createProject/listProjects`、`_ready`），上層程式碼與測試介面不變
- search 仍以 JS 端 cosine 排序（與現況一致；不引入 sqlite-vec）
- 移除不再使用的 `sql.js` 相依
- 既有 `data/rag.db`（標準 SQLite 檔）可被 better-sqlite3 直接開啟，現有資料（如專案列）不受影響

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `vector-adapter`：預設 SQLite 實作改為檔案型、交易式、可安全並行存取的持久化（better-sqlite3 + WAL），消除整檔覆寫造成的資料遺失；並校正 spec 與實作不符之處（實際以 JS 端 cosine 排序，非 sqlite-vec）

## Impact

- `src/adapters/vector/sqlite.js`：改寫為 better-sqlite3 實作
- `package.json`：新增 `better-sqlite3`、移除 `sql.js`
- 無 API / 前端變更；schema 不變
- ⚠️ better-sqlite3 為 native 套件（有 prebuilt binaries，linux-x64 通常免編譯）
