## 1. 容錯執行

- [x] 1.1 `runCase` 或其呼叫處包 try/catch：`answer()` 拋錯 → 等待數秒後重試一次；仍失敗回傳 `{ error: <訊息> }`
- [x] 1.2 主迴圈依結果分流：error → 印 `⚠️ ERROR`＋訊息、`errorCount++`、continue；不計入 hardFail
- [x] 1.3 結尾回報 hardFail 與 errorCount；exit code：hardFail>0→1；否則 errorCount>0→3；否則 0

## 2. 驗證

- [x] 2.1 重跑完整 85 題確認能跑完（暫時性 Ollama 掉線只損失該題、不中止）
- [x] 2.2 `--case` 單題正常路徑不受影響（PASS/FAIL 行為不變）
