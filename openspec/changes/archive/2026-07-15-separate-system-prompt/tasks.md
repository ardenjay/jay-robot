## 1. 訊息結構與 adapter 對映

- [x] 1.1 `retrieval.js`：contents 改為 `[{role:'system', parts:[{text:sys}]}, {role:'user', parts:[{text:question}]}]`
- [x] 1.2 `ollama.js` `toOllamaMessages`：`role:'system'` → `{role:'system', content}`
- [x] 1.3 `gemini.js` `chatWithTools`：抽出開頭 system 元素 → `getGenerativeModel({ systemInstruction })`，其餘 contents 照傳；無 system 元素時行為不變
- [x] 1.4 `mock.js` `extractQuestion`：優先取第一個 user 元素全文；保留「使用者問題」標記解析為 fallback

## 2. 測試

- [x] 2.1 `tests/ollama-adapter.test.js`：system 元素對映測試（messages[0] 為 system role）
- [x] 2.2 `tests/retrieval-prompt.test.js`：capture 改驗 contents[0]（system）含指令、contents[1]（user）僅問題
- [x] 2.3 跑全套測試（含 llm-tools、read-only 等依賴 mock 的套件），修正受影響斷言

## 3. 端到端驗證

- [x] 3.1 `LLM_ADAPTER=ollama` 重跑「電源輸入範圍是多少」×3：每次都實際呼叫 `search_documents` 並依文件作答（修復前 0/4）
- [x] 3.2 泛化問法抽測 1–2 題（如「相機是怎麼接的」）確認工具迴圈與 sources 正常
