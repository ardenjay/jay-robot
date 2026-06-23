## Why

電路板的「連線/接腳/追線」問題本質是**圖查詢**（「U42.4 接到哪個 net？」「VDD 上掛了哪些零件？」「從某腳穿過串聯 R/L/FB 追到哪顆 IC？」），向量 RAG 對這類問題不可靠——相似度搜尋拼不出連線關係，多跳 trace 更不可能從文字 chunk 得到。

但 `tools/netlist/netparse.py` 已能對 Allegro PST netlist 做精確查詢。正確作法是讓 LLM 在需要時**直接呼叫這個工具**（function calling / agentic），用它的精確輸出回答——比 embedding 更準，是升級而非妥協。

## What Changes

- 問答從「向量 RAG 一條線」升級為 **LLM 工具呼叫迴圈**：LLM 預設自行決定要呼叫哪個工具
- 文件查詢本身也包成一個工具 `search_documents`（現有向量 RAG）；netlist 查詢成為一組工具（`find/part/net/pin/connector/trace/info`）
- **強系統指令**：凡涉及具體零件(refdes)、net、腳位、連線/追線，LLM 必須呼叫 netlist 工具、不得憑記憶猜測
- 給 `netparse.py` 每個查詢命令加 `--json` 輸出，供工具回填結構化結果
- **大網/電源處理**：電源/地或超大 net 截斷+摘要；trace 以電源腳為起點時回警告並建議改查 net
- **過程透明**：SSE 新增 tool 事件，前端顯示「正在呼叫 X」
- netlist 不上傳、不建 RAG：`.dat` 放在 `tools/netlist/<專案名>/`（進 git），查詢時依專案名解析資料夾

## Capabilities

### New Capabilities

- `netlist-query`：以 LLM 工具呼叫 netparse 對某專案的 netlist 做精確查詢（零件/net/腳位/追線），含 JSON 輸出與大網處理

### Modified Capabilities

- `llm-adapter`：新增工具呼叫（function calling）能力——送出工具宣告、解析 LLM 要求的 function call、回填 function response、支援多輪
- `rag-query`：問答改為工具呼叫迴圈；文件檢索成為其中一個工具，LLM 依問題選用文件或 netlist 工具
- `chat-ui`：串流新增「工具呼叫進度」事件並於前端顯示

## Impact

- `tools/netlist/netparse.py`：每命令加 `--json`；大網截斷摘要；trace 電源腳警告
- `src/adapters/llm/*`：新增工具呼叫方法（Gemini 用 SDK `functionDeclarations`/`functionCall`）
- `src/services/retrieval.js`：`answer()` 重構為工具迴圈；`search_documents` 工具；強系統指令
- 新增 netlist 工具執行 service（spawn `python3 netparse … --json`，依專案名找板子）
- `src/routes/chat.js` + `public/index.html`：SSE tool 事件 + UI 顯示
- netlist `.dat` 進 git（注意：屬板子設計資料，IP 考量已知悉並接受）
- 無資料庫 schema 變更
