## 1. Rerank 模組

- [x] 1.1 新增 `src/services/rerank.js`：`rerankChunks(adapter, query, chunks, topK)`——候選數 <= topK 直接原樣回傳（不呼叫 LLM）；否則以 listwise prompt 請生成模型輸出排序索引 JSON 陣列，解析後依序取前 topK
- [x] 1.2 保底：解析失敗或 `adapter.generate` 拋錯時退回候選原排序前 topK；模型列出不足 topK 個索引時依原順序去重遞補

## 2. 接進檢索管線

- [x] 2.1 `retrieval.js` 新增 `RERANK_POOL_K=15`；`runSearchDocuments` 取候選池改用 `RERANK_POOL_K`，取回後呼叫 `rerankChunks(adapter, query, pool, TOP_K)`
- [x] 2.2 hybridSearch / search 兩條路徑都改用候選池大小（保留舊注入物件無 hybridSearch 時 fallback 純向量）

## 3. 測試

- [x] 3.1 `tests/rerank.test.js`：候選<=topK 不呼叫 LLM、合法陣列重排截斷、不足 topK 遞補、無法解析退回原排序、呼叫拋錯退回原排序、重複索引去重
- [x] 3.2 更新 `tests/retrieval-prompt.test.js`：hybridSearch / search 呼叫的 topK 參數由 5 改為 15（候選池）
- [x] 3.3 `package.json` test script 加入 `tests/rerank.test.js`；`npm test` 全綠（158/158）

## 4. 真實資料驗證

- [x] 4.1 跑完整 33 題 eval：兩個目標 knownFail（電源輸入範圍、出貨包裝清單）轉綠，移除其 knownFail 標記
- [x] 4.2 確認無新退化；跑完整題浮出的三個既有問題（用哪一顆 soc = projects.context 資料斷句、TSMC CN34 = netlist 路由誤判、CN 編號 = 召回排名#22）查明根因後各標 knownFail 並註明與 rerank 無關
