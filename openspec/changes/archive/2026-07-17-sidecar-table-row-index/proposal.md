# Sidecar table-row index with bounded injection

## Why

Recurring bug（見 spec-table-recall-dilution memory）：密集規格/pin 表整張一個 chunk 時，單屬性查詢（重量、IP、pin1）對整表 embedding 相似度被稀釋（cos ~0.58），連候選池都進不了 → 純召回失敗。

前一個解法 `split-large-tables-into-rows`（把列 chunk 倒進同一向量池）經完整 461 題回歸證實**淨負、已否決**：750 個碎列與正文**無界競爭**，(1) 灌爆候選池害 5 題原本會過的題退化；(2) dilution 目標題在全池競爭下仍 fail。教訓：問題不在「拆不拆列」，在「列與正文同池無界競爭」。

## What Changes

- **Ingestion**：大表（body 列數 > 門檻）整張仍留在主 chunk（正文檢索零改動）；**另外**把每列（表頭欄名 + 該列儲存格 + 章節路徑 title）寫進**獨立的 `table_rows` 表**（自帶 embedding，不進 `chunks`、不進 FTS）。
- **Vector adapter**：新增 `table_rows` schema 與 `searchTableRows(vector, k, projectId)`（純向量比對）。
- **Retrieval（`runSearchDocuments`）**：主池組完（union 30）後、rerank 前，用已算好的查詢向量查 `table_rows`，只取 **cos ≥ FLOOR 的前 ≤ MAX_ROW_INJECT（2）列**附加進池（30→最多32）。相似度門檻即 router、注入上限即保險絲；rerank 當守門員。不依賴 LLM 工具路由（qwen3:14b 路由不可靠且 forced-search 路徑不經模型選工具）。
- 需 reindex 有原始 md 的文件（MTi、Thor）填 `table_rows`。

## 成敗前提（先驗證再實作）

門檻要分得開：dilution 正解列 cos（原型 0.75/0.747）vs 退化題查詢對全部列的最高噪音 cos。探測腳本 `probe-floor.js` 量兩組分佈；因注入是**附加**（原 30 候選一個不少），即使間隙不完美，只要噪音不明顯高於正解，rerank 守門下仍可行。探測若顯示完全疊合則放棄此設計。

## Impact

- Affected specs: `document-ingestion`（列入 sidecar 表）、`document-retrieval`（有界注入）
- Affected code: `src/services/ingestion.js`（列抽取，複用 stash 的 helpers）、`src/adapters/vector/sqlite.js`（table_rows + searchTableRows）、`src/services/retrieval.js`（注入 ~10 行）
- 風險比前案低一個量級：主池與 FTS 完全不動，最壞情況＝rerank 多看 2 個候選。仍以完整 461 題回歸為收斂門檻（dilution 題轉綠、上次 5 題不退化、無新退化）；rag.db 有備份。
