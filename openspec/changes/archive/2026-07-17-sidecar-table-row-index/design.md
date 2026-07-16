# Design: sidecar table-row index + bounded injection

## 架構

```
ingestion:
  大表 → 整張留在主 chunk（現狀不變）
       → 每列另寫 table_rows（獨立表, 自帶 embedding, 不進 chunks/FTS）

retrieval (runSearchDocuments):
  variants → hybridSearch 主池 25×2 → union 30          ← 不變
  variants 向量（已算好, 零額外 embed 成本）
       └→ searchTableRows → cos ≥ FLOOR 的前 ≤2 列 → 附加進池 → rerank → TOP_K
```

## 關鍵決策

1. **不與正文同池**：前案敗因是無界競爭。sidecar 表只在「查詢明確像規格查找」（cos 過門檻）時限量附加，主池分毫不動。
2. **門檻當 router、上限當保險絲**：純數學路由，不吃 qwen3:14b 工具路由可靠性；也涵蓋 forced-search 路徑（它不經模型選工具）。
3. **注入=附加而非替換**：最壞情況 rerank 多看 2 個候選——rerank 本來就是做這個的。
4. **FLOOR 由探測定**：probe-floor.js 量 A 組（dilution 正解列 cos）與 B 組（退化題噪音上界）分佈，取分離點。原型數據：正解列 0.75/0.747，整表僅 0.58。
5. **純向量、不進 FTS**：避開 FTS5 虛表重建雷區（見 fts5-hybrid-search-gotchas）；規格查找的痛點在語意召回，關鍵字路徑主池已有整表 chunk 撐著。
6. **列抽取複用 stash**：`htmlTableRows`/`mdTableRows`/`tableRowsOf`/`tableRowChunks`（含單測）已寫好在 `git stash`（rejected: split-large-tables-into-rows），改去向即可。

## Schema

```sql
CREATE TABLE IF NOT EXISTS table_rows (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id     TEXT NOT NULL,
  title      TEXT,           -- md 檔名 › 章節路徑（與主 chunk title 同慣例）
  content    TEXT NOT NULL,  -- 表頭欄名 | 該列儲存格
  embedding  TEXT NOT NULL,  -- 輸入 = title\ncontent（與主 chunk 同慣例）
  project_id TEXT DEFAULT 'default'
);
```

`store.clear(docId, projectId)` 需同步清 `table_rows`（重灌文件時舊列要跟著走）。

## 注入細節

- `MAX_ROW_INJECT = 2`、`ROW_SIM_FLOOR = <探測定>`
- 對每個 query variant 的向量各查一次，合併取 cos 最高的 ≤2 列（跨 variant 去重）
- 注入的列以一般 chunk 形狀進池（title/text/docId），rerank 與 sources 沿用既有邏輯
- `table_rows` 為空（未 reindex 的專案）時零行為差異

## 回退

- 程式碼：change revert
- 資料：`table_rows` 是加法表，DROP 即回原狀；主 chunks 從頭到尾沒動過
