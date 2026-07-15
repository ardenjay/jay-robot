## 1. 程式層 guard

- [x] 1.1 `retrieval.js` 工具迴圈新增追蹤：`usedDocSearch`(任一次呼叫 search_documents 即 true)、`netlistCalls` / `netlistMisses`(每次 netlist 回應計數,`found===false` 或 `ok:false` 計為 miss)
- [x] 1.2 強制檢索條件由 `!usedAnyTool && !forcedSearch && hasDocs` 改為 `!usedDocSearch && !forcedSearch && hasDocs && (!usedAnyTool || allNetlistMissed)`,其中 `allNetlistMissed = netlistCalls > 0 && netlistMisses === netlistCalls`。實作上抽成純函式 `shouldForceDocSearch(...)` 並導出,便於窮舉各分支測試(測試環境 chdir 後拿不到真實 netlist fixture,抽純函式才能測「netlist 命中→不強制」這條)
- [x] 1.3 強制檢索走完後標記 `usedDocSearch = true`(避免重複);沿用既有「最多強制一次」語意

## 2. prompt 規則放寬(輔助引導)

- [x] 2.1 `buildSystemInstruction` 的 netlist-miss fallback 規則從「僅晶片/零件/規格問題」放寬為「任何 netlist 查無結果、問題可能由文件回答時,先呼叫 search_documents 再回答找不到」

## 3. 單元測試

- [x] 3.1 `tests/retrieval-prompt.test.js` 新增:模型呼叫 netlist_net 回 `found:false` → 系統強制代跑一次 search_documents,模型依文件結果重答;工具進度事件與 sources 正確
- [x] 3.2 新增:netlist 有一次命中(`found:true`)→ 不追加強制檢索
- [x] 3.3 既有測試(零工具強制、只強制一次、已用工具不強制)維持通過;`npm test` 全綠

## 4. 真實資料驗證

- [x] 4.1 `node scripts/eval-answers.js --case "TSMC CN34"` 轉綠(答出 i2c control);移除該案例 knownFail 標記
- [x] 4.2 跑完整 33 題確認無新退化(尤其純電路/netlist 題不受影響)
