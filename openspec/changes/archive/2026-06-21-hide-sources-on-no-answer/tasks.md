## 1. Core Fix

- [x] 1.1 在 `src/services/retrieval.js` 的 `answer()` 中，串流 tokens 時同時累積 `fullResponse` 字串
- [x] 1.2 串流結束後，檢查 `fullResponse` 是否包含「無法在提供的資料中找到答案」，若是則送出空來源陣列
