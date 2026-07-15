## 1. query expansion 模組

- [x] 1.1 新增 `src/services/query-expand.js`：`expandQuery(adapter, query)`——無 CJK 回 `[query]`；有 CJK 用 `adapter.generate` 翻英文,成功且與原查詢不同回 `[query, english]`,失敗/空退回 `[query]`
- [x] 1.2 導出 `hasCJK` 或內部使用；清掉翻譯結果的引號/前後空白

## 2. 接進檢索

- [x] 2.1 `retrieval.js` `runSearchDocuments`：對 `expandQuery` 回的每個 variant 各跑 embed + hybridSearch(RERANK_POOL_K)（無 hybridSearch 的舊物件退回 search）
- [x] 2.2 round-robin 合併去重(依 chunk id)成聯集,上限 30；交給 `rerankChunks(adapter, query, union, TOP_K)`（rerank 仍用原查詢）
- [x] 2.3 sources 累積、專案背景首 chunk 等既有行為不變

## 3. 單元測試

- [x] 3.1 `tests/query-expand.test.js`：無 CJK → 單查詢不呼叫 generate；有 CJK → 回 [原, 英]；翻譯拋錯 → 退回 [原]；翻譯回空/等同原查詢 → 退回 [原]；去引號
- [x] 3.2 `tests/retrieval-prompt.test.js`：驗證 runSearchDocuments 對兩個 variant 各檢索一次、聯集去重(以假 store 記錄呼叫)
- [x] 3.3 `npm test` 全綠

## 4. 真實資料驗證

- [x] 4.1 `node scripts/eval-answers.js --case "供電輸入電壓"` 轉綠(答出 4.5~24)
- [x] 4.2 跑完整 75 題確認無新退化（此改動影響所有中文查詢的檢索,回歸尤其重要）
