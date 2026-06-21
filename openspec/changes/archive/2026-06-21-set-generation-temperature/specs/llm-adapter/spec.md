## MODIFIED Requirements

### Requirement: Gemini adapter as default implementation
系統 SHALL 提供 `GeminiAdapter`，使用 `text-embedding-004` 做 embedding（768 維），使用 `gemini-2.5-flash` 做文字生成。文字生成（`generate()` 與 `stream()`）SHALL 帶入低 temperature 的 `generationConfig`（預設 0.2），使相同輸入下的回答更一致、更忠於提供的文件，降低無故放棄作答的機率。

#### Scenario: Gemini embed returns 768-dim vector
- **WHEN** 呼叫 `embed(text)`
- **THEN** 回傳長度為 768 的 float 陣列

#### Scenario: Gemini stream generates tokens
- **WHEN** 呼叫 `stream(prompt)`
- **THEN** AsyncGenerator 逐步 yield 文字 token 直至生成完畢

#### Scenario: Generation uses low temperature
- **WHEN** 呼叫 `generate(prompt)` 或 `stream(prompt)`
- **THEN** 向模型送出的請求帶有低 temperature 的 `generationConfig`（預設 0.2），使相同問題與相同檢索內容下的回答趨於一致
