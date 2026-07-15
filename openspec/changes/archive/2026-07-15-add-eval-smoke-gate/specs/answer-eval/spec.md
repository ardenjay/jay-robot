## ADDED Requirements

### Requirement: 完整案例回歸測試
系統 SHALL 提供 `node scripts/eval-answers.js`，對指定專案（預設 100T）跑 `evals/answer-cases.json` 中的每一筆案例，透過真實 `answer()` pipeline（真實 LLM adapter、真實向量資料）取得答案，並判斷答案是否含 `expectAny` 列出的其中一個關鍵字。

#### Scenario: 執行完整案例集
- **WHEN** 執行 `node scripts/eval-answers.js`
- **THEN** `evals/answer-cases.json` 中的每一筆案例都會被執行一次，並輸出 PASS/FAIL/KNOWN-FAIL 標記與答案摘要

#### Scenario: 案例失敗且非 knownFail
- **WHEN** 某案例答案不含任何一個 `expectAny` 關鍵字，且該案例沒有標記 `knownFail: true`
- **THEN** 該案例標記為 FAIL，且整體執行以非零 exit code 結束

#### Scenario: knownFail 案例失敗不影響整體結果
- **WHEN** 某案例標記 `knownFail: true` 且答案不含任何 `expectAny` 關鍵字
- **THEN** 該案例標記為 KNOWN-FAIL，不計入導致非零 exit code 的失敗數

#### Scenario: 依專案與案例文字篩選
- **WHEN** 執行時帶 `--project <名稱>` 或 `--case <子字串>`
- **THEN** 只執行對應專案、或問題文字包含該子字串的案例

### Requirement: Smoke 子集執行
系統 SHALL 提供 `--smoke` 參數，只執行 `evals/answer-cases.json` 中標記 `"smoke": true` 的案例，供每次改動後快速驗證的場景使用（人工執行、非自動觸發），且與 `--project`/`--case` 可疊加篩選。

#### Scenario: 執行 smoke 子集
- **WHEN** 執行 `node scripts/eval-answers.js --smoke`
- **THEN** 只有 `smoke: true` 的案例被執行，其餘案例被跳過

#### Scenario: smoke 與 case 疊加篩選
- **WHEN** 執行時同時帶 `--smoke` 與 `--case <子字串>`
- **THEN** 只執行「`smoke: true` 且問題文字包含該子字串」的案例

