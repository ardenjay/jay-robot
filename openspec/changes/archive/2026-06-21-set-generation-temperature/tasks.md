## 1. 設定生成 temperature

- [x] 1.1 在 `src/adapters/llm/gemini.js` 新增常數 `const GEN_TEMPERATURE = 0.2;`
- [x] 1.2 `stream()` 取得 model 時帶入 `generationConfig: { temperature: GEN_TEMPERATURE }`
- [x] 1.3 `generate()` 取得 model 時帶入相同 `generationConfig`

## 2. 驗收

- [x] 2.1 啟動 `npm start`，同一問題連續送出多次，確認不再出現「同問題、有時答得出來、有時說找不到」的不一致
- [x] 2.2 確認回答內容仍正確、忠於文件，且來源連結照常顯示
- [x] 2.3 執行 `npm test`，確認現有測試全部通過
