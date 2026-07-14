## Why

retrieval 把 5000 字的 system 指令與使用者問題串成同一個 user message（Gemini 時代的做法）。qwen3 的 chat template 對真正的 `system` role 有特殊權重，塞在 user 裡的指令被大幅弱化——實測「電源輸入範圍是多少」這類泛化問法，模型 100%（4/4）只以文字宣告要查文件而不實際呼叫工具，來源顯示「無相關文件」誤導使用者。A/B 對照：指令移到 `system` role 後工具呼叫率 0/3 → 3/3。

## What Changes

- `retrieval.js` 組訊息時把 system 指令標成獨立的 `role: 'system'` 元素，使用者問題單獨成 user message，不再串接。
- 各 adapter 把 system 元素對映到 provider 原生通道：Ollama → `system` role message；Gemini → SDK 的 `systemInstruction` 參數（原生支援，較現況更正統）；mock → 從 system 元素讀指令、user 元素讀問題。
- 工具呼叫迴圈行為、SSE 事件、sources 格式皆不變。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `llm-adapter`: 新增需求——`chatWithTools` 的 contents 首元素可為 `role: 'system'`，各實作 SHALL 對映到該 provider 的原生 system 通道。
- `rag-query`: 「Answer via LLM tool-calling loop」需求變更——system 指令 SHALL 以獨立 system 元素送出，不與使用者問題串接。

## Impact

- `src/services/retrieval.js` — contents 組裝。
- `src/adapters/llm/ollama.js` — `toOllamaMessages` 加 system 對映。
- `src/adapters/llm/gemini.js` — `chatWithTools` 抽出 system 元素傳 `systemInstruction`。
- `src/adapters/llm/mock.js` — `extractQuestion` 改讀分離後的結構。
- `tests/retrieval-prompt.test.js`（capture 邏輯）、`tests/ollama-adapter.test.js`（system 對映）、`tests/llm-tools.test.js`（如有依賴訊息結構）。
- 風險：Gemini 路徑行為變動（改用 systemInstruction），需以現有測試 + 手動驗證把關。
