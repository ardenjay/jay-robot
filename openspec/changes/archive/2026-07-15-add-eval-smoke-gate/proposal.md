## Why

`scripts/eval-answers.js` 跑一次完整 33 題約 30–60 分鐘（需真實 Ollama + 真實資料），沒人會每次 commit 前手動跑，於是「這次改動有沒有讓回答品質變差」只能靠肉眼偶爾抽查（正是本次 change 的起因：連續兩輪探索花了大量時間手動問問題才抓到回歸）。需要一個幾分鐘內跑完的小子集，在 commit 前自動擋下明顯的回歸，同時保留完整 33 題供有空時手動全面驗證。

## What Changes

- `evals/answer-cases.json` 中已標記 `"smoke": true` 的 5 題（涵蓋 hybrid search 關鍵字索引、強制首輪檢索 fallback、表格數字抽取、指令型問答、拒答守門五條不同路徑），`scripts/eval-answers.js` 新增 `--smoke` 參數，只跑這 5 題。
- **不做自動化（不接 git hook / CI）**：使用者決定改成人工紀律——每次改完程式碼，執行 `node scripts/eval-answers.js --smoke` 並要求全數通過（`knownFail` 除外）才算完成，記錄在協作規範裡（見 design.md）。
- 完整 33 題的手動執行方式（`node scripts/eval-answers.js`，不帶 `--smoke`）行為不變。

## Capabilities

### New Capabilities
- `answer-eval`：`scripts/eval-answers.js` 對 `answer()` pipeline 的回答品質回歸測試——包含既有的完整案例執行、`--project`/`--case` 篩選、`--smoke` 子集執行。此工具先前未建立正式 spec，隨本次變更一併補上完整需求。

### Modified Capabilities
（無——不涉及既有已上線 spec 的需求變更）

## Impact

- `scripts/eval-answers.js`：新增 `--smoke` 篩選邏輯
- `evals/answer-cases.json`：無需再變更（`smoke` 標記已於本次 change 之前完成）
- 不影響 `npm test`（單元測試，走 mock adapter，與此 eval 工具是分離的兩條測試路徑）
- 無 git hook、無 CI、無 `core.hooksPath` 變更——這輪明確排除自動化
