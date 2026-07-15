# Add LLM listwise rerank to document retrieval

## Why

hybrid search（BM25 + 向量 RRF）對「跨語言、跨文件」的相關性判斷不夠可靠：中文查詢對英文內容的正確 chunk 常常關鍵字字面零重疊、排名掉出候選窗；而 BM25 的 avgdl 是整個 FTS 表全域計算，任何一份文件的內容變動都會位移全庫長度基準、連帶讓不相關文件的排名翻掉（見 `fts5-hybrid-search-gotchas` 記憶）。實測有兩題（EAR-100T 電源輸入範圍、出貨包裝清單）就是這樣時好時壞，繼續調 doc_seg BM25 權重救不了、還會弄壞別題。需要一層不依賴關鍵字字面/全域統計的語意相關性判斷。

## What Changes

- 新增 `src/services/rerank.js`：候選數超過 topK 時，用現有生成模型（qwen3:14b，非專用 cross-encoder，因本機無此類模型、Ollama 也無 rerank 端點）對候選 chunks 做一次 listwise 語意排序，取前 topK。解析失敗或呼叫出錯時退回原排序，不中斷檢索。
- `retrieval.js`：`search_documents` 的候選池從直接取 TOP_K(5) 改為先取 `RERANK_POOL_K`(15)，再交給 rerank 篩至 TOP_K——放大候選池讓語言不匹配、原本進不了候選窗的正確 chunk 有機會先被撈到。

## Impact

- Affected specs: `rag-query`（檢索改為「取候選池 → LLM rerank → top-K」）
- Affected code: `src/services/retrieval.js`、新增 `src/services/rerank.js`
- 延遲：每次 `search_documents` 多一次生成模型呼叫；因 rerank 只吃候選片段前 400 字、`think:false`、greedy，額外延遲有限，換取跨語言召回的穩定性。
