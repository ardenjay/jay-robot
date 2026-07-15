## Context

`scripts/eval-answers.js` 已存在，讀 `evals/answer-cases.json`、把 DB 複製到沙箱後跑真實 `answer()` pipeline（真實 Ollama + 真實 100T 資料），單題約 1–2 分鐘。33 題裡已有 5 題標了 `"smoke": true`（見 proposal），涵蓋 hybrid search 關鍵字索引、強制首輪檢索 fallback、表格數字抽取、指令型問答、拒答守門。

原提案曾規劃 git pre-commit hook 自動觸發，使用者最終決定不要自動化，改成「加在 test case 裡，每次改完人工要求全數通過」——即只做 `--smoke` 篩選功能，把「什麼時候跑、跑完要不要擋」交給人（或協作的 agent）的紀律，不寫進 git 生命週期。

## Goals / Non-Goals

**Goals:**
- `node scripts/eval-answers.js --smoke` 只跑 `smoke:true` 的 5 個案例，數分鐘內出結果
- 把「每次改完程式碼要跑 smoke 並要求全過」寫成明確、可依循的協作規範

**Non-Goals:**
- 不做任何自動觸發機制（git hook、CI、pre-push 等一律不做）
- 不改變完整 33 題手動執行的行為
- 不強制技術上擋住 commit/push——完全依賴執行者（含 AI 協作者）的紀律

## Decisions

**`--smoke` 的篩選邏輯**：在 `eval-answers.js` 現有的 `--project`/`--case` 篩選之後，再疊加一層「若傳入 `--smoke`，只保留 `c.smoke === true` 的案例」。三個篩選條件可疊加（例如同時給 `--smoke --case "BSP"` 也合理），不做互斥檢查。

**不做自動化的原因**：使用者權衡過 pre-commit/pre-push/CI 三種方案（見上一輪對話）後，明確選擇不採用任何一種——本機專案、單人開發，自動化 hook 每次 commit 多等 5-10 分鐘的成本大於「忘記手動跑」的風險；改用「協作規範」取代技術性強制，執行成本最低。

**規範怎麼落地**：不寫程式，而是記錄一條協作準則（例如 memory / CLAUDE.md）：**改動涉及 retrieval/prompt/adapter 相關程式碼後，執行 `node scripts/eval-answers.js --smoke`，確認 5 題全過（`knownFail` 除外）才算完成**。這條準則對「AI 協作者」（例如我）尤其重要——避免像本次一樣，改完東西不知道有沒有讓既有問答品質下降，得靠使用者事後手動抽查才發現。

## Risks / Trade-offs

- **[Risk] 沒有技術強制，容易被跳過（尤其時間趕的時候）** → Mitigation：這是使用者明確接受的取捨（見上輪對話「就是加在你的test case就好」），且成本已知——之後真的常忘記，再回頭考慮加自動化。
- **[Risk] 5 題 smoke 案例本身也可能因為 LLM 非決定性偶爾不穩定** → Mitigation：`GEN_TEMPERATURE` 預設已是 0（greedy），5 題都是已驗證過的清楚案例，暫不特別處理。

## Migration Plan

1. `scripts/eval-answers.js` 加 `--smoke` 參數與篩選
2. 手動跑 `node scripts/eval-answers.js --smoke` 驗證只跑 5 題且結果正確
3. 沒有部署/rollback 疑慮——純新增一個 CLI 參數，不影響既有呼叫方式
