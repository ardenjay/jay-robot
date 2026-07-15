# Spec: answer-eval

## Purpose

`scripts/eval-answers.js` 對 `answer()` pipeline 的回答品質回歸測試——用真實 LLM adapter、真實向量資料跑代表性問題，驗證答案是否符合預期，並支援快速的 smoke 子集供每次改動後手動驗證。與 `npm test`（mock adapter 的單元測試）分離。

## Requirements

### Requirement: 完整案例回歸測試
系統 SHALL 提供 `node scripts/eval-answers.js`，對指定專案（預設 100T）跑案例檔中的每一筆案例，透過真實 `answer()` pipeline（真實 LLM adapter、真實向量資料）取得答案，並判斷答案是否含 `expectAny` 列出的其中一個關鍵字。案例檔優先讀取 `evals/answer-cases.local.json`（gitignored，可放涉及客戶專案的真實資料），不存在則退回公開版 `evals/answer-cases.json`（僅放不涉密的示範案例）。

#### Scenario: 執行完整案例集
- **WHEN** 執行 `node scripts/eval-answers.js`
- **THEN** 案例檔中的每一筆案例都會被執行一次，並輸出 PASS/FAIL/KNOWN-FAIL 標記與答案摘要

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
系統 SHALL 提供 `--smoke` 參數，只執行案例檔中標記 `"smoke": true` 的案例，供每次改動後快速驗證的場景使用（人工執行、非自動觸發），且與 `--project`/`--case` 可疊加篩選。

#### Scenario: 執行 smoke 子集
- **WHEN** 執行 `node scripts/eval-answers.js --smoke`
- **THEN** 只有 `smoke: true` 的案例被執行，其餘案例被跳過

#### Scenario: smoke 與 case 疊加篩選
- **WHEN** 執行時同時帶 `--smoke` 與 `--case <子字串>`
- **THEN** 只執行「`smoke: true` 且問題文字包含該子字串」的案例

### Requirement: 單題執行失敗容錯，不中止整批
eval 執行單一案例時若 `answer()` pipeline 拋出例外（如本機 LLM 暫時掉連線），系統 SHALL 先自動重試該題一次（重試前短暫等待讓服務恢復）；若重試仍失敗，SHALL 將該題標記為 `ERROR`（有別於 PASS/FAIL/KNOWN-FAIL）、輸出錯誤摘要後**繼續執行後續案例**，不得因單題例外而中止整批。結尾 SHALL 分開回報「非 knownFail 的 FAIL 數」與「ERROR 數」。exit code SHALL 為：有 hardFail → 1；無 hardFail 但有 ERROR → 3；皆無 → 0。

#### Scenario: 單題 LLM 拋錯先重試
- **WHEN** 某案例執行時 `answer()` 拋出例外
- **THEN** 系統自動重試該題一次；若重試成功則以重試結果判定 PASS/FAIL

#### Scenario: 重試仍失敗記為 ERROR 並續跑
- **WHEN** 某案例重試後仍拋出例外
- **THEN** 該題標記為 ERROR，輸出錯誤訊息，接著繼續執行後續案例（不中止整批）

#### Scenario: 有 ERROR 但無測試失敗的 exit code
- **WHEN** 整批執行結束時沒有任何非 knownFail 的 FAIL，但有至少一題 ERROR
- **THEN** 結尾回報 ERROR 數，且 exit code 為 3（區分基礎設施失敗與測試失敗）

