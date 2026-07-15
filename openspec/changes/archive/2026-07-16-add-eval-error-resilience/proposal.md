# Make the eval resilient to transient LLM failures

## Why

完整 eval（85 題、約 13 分鐘）跑到後段時，本機 Ollama 在持續負載下會偶發掉連線（`fetch failed`）。目前單題一拋錯，最外層 catch 就 `process.exit`，整批 13 分鐘全白跑——實測連兩次都倒在第 78 題附近，前 77 題結果全丟。單一題目的暫時性 LLM 失敗不應摧毀整批回歸。

## What Changes

- `scripts/eval-answers.js` 每題包 try/catch：`answer()` 拋錯時**先重試一次**（等數秒讓 Ollama 恢復）；仍失敗則把該題記為 `ERROR`（有別於 PASS/FAIL/KNOWN-FAIL）、印出並**繼續**跑下一題，不中止整批。
- 結尾分開回報 hardFail 數與 error 數。exit code：有 hardFail → 1；無 hardFail 但有 error → 3（區分「測試失敗」與「基礎設施失敗」）；全清 → 0。

## Impact

- Affected specs: `answer-eval`
- Affected code: `scripts/eval-answers.js`
- 讓長回歸能跑完、拿到完整結果；暫時性 Ollama 掉線只損失該題（重試一次），不再前功盡棄。
