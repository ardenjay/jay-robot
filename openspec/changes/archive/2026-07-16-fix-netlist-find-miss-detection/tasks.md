## 1. 統一 miss 判定

- [x] 1.1 `netlist.js` 新增並導出 `isNetlistMiss(r)`：`!ok`、`result.found === false`、或 `result.count === 0` 皆為 miss；其餘（含 info 總覽、任何命中）非 miss
- [x] 1.2 `retrieval.js` 的 netlist miss 計數由寫死的 `result.found === false` 改為呼叫 `isNetlistMiss(r)`

## 2. 單元測試

- [x] 2.1 `tests/netlist-tool.test.js` 新增 `isNetlistMiss` 對真實 netlist 的各工具查無/命中：net 查無(found:false)、find 零命中(count:0)、find 命中(count>0)、part 查無、trace 命中、info(非 miss)、工具錯誤(ok:false)
- [x] 2.2 `tests/retrieval-prompt.test.js` 新增：模型呼叫 netlist_find 回 count:0 → 強制代跑一次 search_documents（沿用測試環境 netlist 不可用→ok:false 的路徑亦可，但改以 isNetlistMiss 涵蓋 count:0 語意由 2.1 保證）
- [x] 2.3 `npm test` 全綠

## 3. 真實資料驗證

- [x] 3.1 `node scripts/eval-answers.js --case "RJ45"` 轉綠（tool trace: netlist_find→(miss)→forced search_documents→答出 J85）；移除該案例 knownFail（本批新題，尚未標記，確認直接通過即可）
- [x] 3.2 跑完整測試集確認無新退化
