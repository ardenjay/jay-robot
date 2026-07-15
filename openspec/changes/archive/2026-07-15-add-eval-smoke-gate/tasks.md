## 1. eval-answers.js：`--smoke` 篩選

- [x] 1.1 `parseArgs` 加 `smoke: { type: 'boolean', default: false }`
- [x] 1.2 篩選邏輯：`--smoke` 時只保留 `c.smoke === true`（在既有 `--project`/`--case` 篩選之後疊加，非互斥）
- [x] 1.3 手動跑 `node scripts/eval-answers.js --smoke`，確認只跑 5 題且全部可正確判斷 PASS/FAIL（實測 5/5 PASS）

## 2. 收尾

- [x] 2.1 `npm test` 全數通過，確認沒有動到既有單元測試（147/147 pass）
