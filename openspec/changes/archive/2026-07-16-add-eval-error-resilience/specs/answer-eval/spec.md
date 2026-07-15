## ADDED Requirements

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
