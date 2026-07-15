## 1. query-aware snippet

- [x] 1.1 `rerank.js` 新增 `buildSnippet(query, text)`：text 短則整段；否則 head（~300）+ 若 query 詞在 head 之後才命中則附命中視窗（前後約 60/180 字）
- [x] 1.2 `buildPrompt` 的候選列點改用 `buildSnippet(query, c.text)` 取代原本的 `text.slice(0, SNIPPET_LEN)`

## 2. 單元測試

- [x] 2.1 `tests/rerank.test.js` 新增 buildSnippet（若導出）或透過 rerankChunks 行為驗證：短 text 原樣；長 text 且關鍵字在後段 → snippet 含該關鍵字；長 text 關鍵字在前段 → 只取 head；query 切不出詞 → 退回 head
- [x] 2.2 既有 rerank 測試維持通過；`npm test` 全綠

## 3. 真實資料驗證

- [x] 3.1 `node scripts/eval-answers.js --case "TPM"` 轉綠（答出 TPM 2.0）
- [x] 3.2 跑完整測試集確認無新退化
