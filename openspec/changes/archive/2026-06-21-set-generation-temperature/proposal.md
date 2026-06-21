## Why

同一個問題、同一份已上傳文件，有時答得出來、有時卻回「無法在提供的資料中找到答案，請上傳 C602」。原因不是使用者操作（檢索是決定性的，相同問題會取得相同 chunks），而是文字生成沒有設定 temperature，沿用 Gemini 預設值（約 1.0，偏高），導致模型隨機決定要不要作答——對 RAG 這種「依文件回答、不需創意」的任務，這種不一致是明顯的品質問題。

## What Changes

- `GeminiAdapter` 的 `generate()` 與 `stream()` 在呼叫模型時帶入 `generationConfig: { temperature: <低值> }`（預設 0.2）
- 讓 RAG 回答更穩定、更貼著文件，降低「同問題不同結果」與無故放棄作答的機率
- 不改變 adapter 介面、不改 prompt、不改檢索邏輯

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `llm-adapter`：Gemini 文字生成新增低 temperature 設定，使回答在相同輸入下更一致、更忠於提供的文件

## Impact

- `src/adapters/llm/gemini.js`：新增 `GEN_TEMPERATURE` 常數，於 `generate()` 與 `stream()` 取得 model 時帶入 `generationConfig`
- 無 API 介面變更、無資料庫異動、無前端變更
- embedding 不受影響（本來就是決定性的）
