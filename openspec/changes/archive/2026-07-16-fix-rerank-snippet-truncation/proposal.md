# Query-aware rerank snippet so answers deep in long chunks stay visible

## Why

`add-llm-rerank` 給重排器看的每個候選片段固定截前 400 字（`SNIPPET_LEN`）。長表格 chunk（如產品規格表，上限 1500 字）若答案落在 400 字之後，重排器就看不到關鍵字，會誤判該候選不相關而踢出 top-K——即使召回本身把正確 chunk 排在候選池很前面。

實測失敗案例：「EAR-100T 的硬體安全模組是哪個版本的 TPM?」正確 chunk（DS Specifications 表、C455 Specification 表）分別在候選池 #1、#3（召回沒問題），但「TPM 2.0」分別出現在第 576、427 字，都超過 400 字截斷，重排器看不到「TPM」，把兩者都踢出 top-5，模型答「沒有提到」。用「前段 + query 命中處視窗」的 snippet 後，重排器立刻把含 TPM 2.0 的 chunk 選為首選。

## What Changes

- `rerank.js` 的候選片段改為 query-aware：先取 chunk 前段（head），若查詢關鍵字在該 chunk 中出現於 head 之後，另外附上該命中處的一段視窗，確保答案關鍵字對重排器可見；片段總長仍有上限、不整段灌入。

## Impact

- Affected specs: `rag-query`（rerank 候選片段的產生方式）
- Affected code: `src/services/rerank.js`
- 對片段落在前段或短 chunk 者行為不變；只有「長 chunk 且關鍵字在後段」時才附視窗，prompt 增量有限。
