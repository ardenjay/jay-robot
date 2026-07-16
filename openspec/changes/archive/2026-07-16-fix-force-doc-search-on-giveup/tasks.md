## 1. 擴大 guard

- [x] 1.1 `retrieval.js` 定義放棄語前綴常數（`無法在提供的資料中找到`，取自 NO_ANSWER_PHRASE 的共同前綴）
- [x] 1.2 `shouldForceDocSearch` 增 `givingUp` 參數，回傳條件加 `|| !!givingUp`
- [x] 1.3 工具迴圈在模型無 function calls、要作答時，先算 `final`，以 `givingUp: final.includes(放棄語前綴)` 呼叫 `shouldForceDocSearch`

## 2. 單元測試

- [x] 2.1 `tests/retrieval-prompt.test.js` `shouldForceDocSearch` 分支：givingUp=true 且未查文件 → true；givingUp 但已查文件(usedDocSearch)→ false；netlist 有命中但非放棄 → false（既有）
- [x] 2.2 端到端：模型 netlist 部分命中後吐放棄語 → 系統強制代跑一次 search_documents,模型依文件重答
- [x] 2.3 `npm test` 全綠

## 3. 真實資料驗證

- [x] 3.1 `node scripts/eval-answers.js --case "CN1 和 GMSL"` 轉綠(答出 19~36V 與 12V)
- [ ] 3.2 跑完整 95 題確認無新退化(尤其純電路/netlist 命中題不受影響)
