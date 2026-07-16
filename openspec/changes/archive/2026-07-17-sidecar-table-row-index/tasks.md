## 1. 前提驗證

- [x] 1.1 probe-floor.js:A 組(dilution 正解列 cos)與 B 組(退化題噪音上界)分佈;定 ROW_SIM_FLOOR;完全疊合則放棄

## 2. 實作

- [x] 2.1 sqlite adapter:`table_rows` schema + `addTableRows(rows)` + `searchTableRows(vector, k, projectId)` + `clear` 同步清列
- [x] 2.2 ingestion:自 stash 取回列抽取 helpers(htmlTableRows/mdTableRows/tableRowsOf/tableRowChunks);parseAndChunk 不變,改為在 embedAndStore 流程額外產出 sidecar rows(主 chunk 行為零改動)
- [x] 2.3 retrieval `runSearchDocuments`:池組完後查 table_rows,cos ≥ FLOOR 取 ≤2 列附加,rerank 前
- [x] 2.4 單元測試:列抽取(復用 stash 測試)、小表不產列、clear 清列、注入 additive(池不縮)、無列時零行為差異

## 3. Reindex + 回歸

- [x] 3.1 備份 rag.db;重灌 MTi、Thor 填 table_rows(主 chunks 應與現狀相同)
- [x] 3.2 完整 461 題回歸:dilution 題轉綠、上次 5 題不退化、無新退化;淨負則回退
- [x] 3.3 轉綠者移除 knownFail;commit(敏感檔 grep 檢查)+ archive + spec sync
