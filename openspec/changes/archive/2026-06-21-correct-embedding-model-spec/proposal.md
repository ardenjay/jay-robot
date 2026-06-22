## Why

`llm-adapter` 主 spec 寫的 embedding 模型與維度跟實際程式碼不符：

- spec 寫「使用 `text-embedding-004` 做 embedding（768 維）」
- 實際 `GeminiAdapter` 用的是 `gemini-embedding-001`，且實測回傳維度為 **3072**（非 768）

spec 與程式碼不一致會誤導後續開發與維護判斷。本變更純粹校正文件，使其反映現況。

## What Changes

- 將 `llm-adapter` spec 中的 embedding 模型由 `text-embedding-004` 校正為 `gemini-embedding-001`
- 將維度由 768 校正為 3072（已用一次實際 embed 呼叫驗證）
- 僅文件更新，無任何程式碼 / 行為變更

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `llm-adapter`：校正「Gemini adapter as default implementation」需求中的 embedding 模型名稱與向量維度，使其與實作一致

## Impact

- `openspec/specs/llm-adapter/spec.md`：更新模型名稱與維度描述及對應 scenario
- 無程式碼變更、無 API / 資料庫 / 前端變更
