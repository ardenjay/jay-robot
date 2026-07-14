## Why

目前文件檢索只用向量餘弦相似度，對「精確關鍵字」類查詢效果差：料號、零件代碼、NPDS 文件代碼、專有名詞（如 `U42`、`C560`、`DDR5`）在 embedding 空間中常被語意相近但不含該關鍵字的 chunk 淹沒，導致 LLM 拿不到含關鍵字的原文而答不出來。加入 keyword search 與向量搜尋融合（hybrid search），讓語意查詢與精確關鍵字查詢都能命中。

## What Changes

- SQLite vector adapter 新增全文檢索索引（FTS5 + BM25），與 `chunks` 資料表同步維護（新增、刪除、既有資料 backfill）。
- 中英混合斷詞：CJK 字元以字為單位切分建索引，英數 token（料號、代碼）保持完整，確保「關鍵字精確命中」與中文查詢都可用。
- Vector adapter 介面新增 hybrid search：同時執行向量搜尋與 keyword 搜尋，以 Reciprocal Rank Fusion (RRF) 融合排名後回傳 top-K。
- `search_documents` 工具改走 hybrid search：檢索時同時使用問題的 embedding 與原始查詢文字；不支援 hybrid 的 adapter 自動 fallback 回純向量搜尋。
- 既有資料庫升級：啟動時偵測缺 FTS 索引則自動建立並 backfill，不需手動遷移。

## Capabilities

### New Capabilities

（無 — hybrid search 屬既有檢索能力的行為變更，不獨立成新 capability）

### Modified Capabilities

- `vector-adapter`: 新增 hybrid search 需求 — adapter SHALL 提供 `hybridSearch(queryText, vector, topK, projectId)`，SQLite 實作以 FTS5/BM25 + 向量餘弦相似度做 RRF 融合；FTS 索引與 chunks 寫入同步、舊資料自動 backfill。
- `rag-query`: 「Embed user question and retrieve relevant chunks」需求變更 — `search_documents` 由純向量 top-K 改為 hybrid search（向量 + 關鍵字融合）；adapter 不支援時 fallback 純向量。

## Impact

- `src/adapters/vector/base.js` — 介面新增 `hybridSearch`（預設丟 NotImplementedError 或 fallback）。
- `src/adapters/vector/sqlite.js` — FTS5 虛擬表、斷詞前處理、BM25 keyword search、RRF 融合、schema 遷移/backfill。
- `src/services/retrieval.js` — `runSearchDocuments` 改呼叫 hybrid search（帶原始查詢文字），保留 fallback。
- `tests/vector-adapter.test.js`、`tests/retrieval-prompt.test.js` — 新增 hybrid search 測試（關鍵字命中、融合排序、backfill、fallback）。
- 相依性：不新增套件（better-sqlite3 內建 FTS5）。
- 資料：既有 `data/rag.db` 首次啟動時自動建 FTS 索引並 backfill，屬向前相容變更。
