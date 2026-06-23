> 驗收原則：優先用**決定性**方式（單元測試 / 對照 netparse 真值），LLM 相關才用觀察式。
> 任何會寫入的驗收**不得碰正式 `data/rag.db`**——用隔離/暫存 DB 或唯讀資料。netlist 查詢對 `tools/netlist/100T` 為唯讀，安全。

## 階段一：netparse --json（可獨立驗收）

- [x] 1.1 為查詢命令（`find/part/net/pin/connector/trace/info`）加 `--json`，輸出結構化 JSON（保留原文字輸出）
- [x] 1.2 各命令的 JSON 欄位定義清楚（如 `part` → `{refdes, part, pins:[{pin,net}]}`）

**✅ 階段一驗收（決定性、隔離）**
- [x] 1.3 對 `tools/netlist/100T` 跑每個命令 `--json`，以 `jq .` / `python -m json.tool` 確認**皆為可解析 JSON** 且含預期欄位
- [x] 1.4 對照真值：`part U42 --json` 的某腳位 net 與文字版輸出一致

## 階段二：netlist 工具執行 service（可獨立驗收）

- [x] 2.1 service 依**專案名**解析 `tools/netlist/<專案名>/`，三個 `.dat` 齊全才視為有 netlist
- [x] 2.2 `spawn('python3', [...,'--json'])` 執行並解析 JSON；錯誤（無此 refdes/net、檔缺）轉成可回填的工具錯誤物件
- [x] 2.3 定義各 netlist 工具的 function declaration（名稱、說明、參數 schema）

**✅ 階段二驗收（決定性單元測試，唯讀 100T）**
- [x] 2.4 新增 `tests/netlist-tool.test.js`：
  - `resolve('100T')` 有 netlist；`resolve('no-such')` 無
  - `part('100T','U42')` 回結構化結果且某腳位 net 正確（對照 1.4 真值）
  - 壞 refdes → 回工具錯誤物件、不 throw
- [x] 2.5 `npm test` 綠；確認測試**不觸碰** `data/rag.db`

## 階段三：llm-adapter 工具呼叫（可獨立驗收）

- [x] 3.1 `base.js` 新增 `chatWithTools(messages, tools)`
- [x] 3.2 `gemini.js` 實作：SDK `functionDeclarations` 送工具、解析 `functionCall`、`functionResponse` 回填續呼；預設 `AUTO`；沿用 `withBackoff`

**✅ 階段三驗收（決定性 stub + 可選一次真呼叫）**
- [x] 3.3 stub client 測試：`chatWithTools` 有把 tools 傳進去；回應含 `functionCall` 時能解析出 {name,args}；回填 `functionResponse` 後能續呼
- [x] 3.4（可選，耗一次 API）真實呼叫一題明確需要工具的問題，確認 Gemini 回 `functionCall`

## 階段四：retrieval 工具迴圈（核心端到端，可驗收）

- [x] 4.1 `answer()` 重構為工具迴圈：組工具集（`search_documents` + 該專案 netlist 工具）→ `chatWithTools` → 執行 functionCall、回填、再呼叫 → 直到最終文字
- [x] 4.2 現有向量 RAG 包成 `search_documents` 工具
- [x] 4.3 system prompt 強指令：連線/零件/net/腳位問題必須用 netlist 工具
- [x] 4.4 串接最終 token 串流與文件來源

**✅ 階段四驗收（端到端；隔離 vector DB、唯讀 netlist）**
- [x] 4.5 用**隔離/暫存 vector DB**啟動 app（不碰正式 `data/rag.db`），對 100T 問「U42 第 4 腳接到哪個 net？」→ 答案需與 `netparse part U42 --json` 真值相符
- [x] 4.6 問文件問題（用測試文件）→ 確認走 `search_documents`
- [x] 4.7 無 netlist 的專案 → 只提供文件工具、不報錯
- [x] 4.8 `npm test` 綠

## 階段五：大網/電源處理（可獨立驗收）

- [x] 5.1 查詢結果超過門檻時截斷+摘要（總數、依前綴統計、前 N 個）
- [x] 5.2 `trace` 起點為電源/地腳（名稱樣式 VDD/VCC/GND/VSS… + 節點數門檻）回警告與建議，不展開大量路徑

**✅ 階段五驗收（決定性，唯讀 100T）**
- [x] 5.3 測試：查已知電源網（如 `VDD_0V95_RTL0`）→ 結果被截斷且含摘要統計與總數
- [x] 5.4 測試：`trace U42.1`（電源腳）→ 回警告/建議，路徑數不爆量

## 階段六：SSE tool 事件 + UI（可驗收）

- [ ] 6.1 retrieval/chat：工具呼叫前發 `{type:'tool', …}` 事件
- [ ] 6.2 `public/index.html`：顯示「正在呼叫 X」，最終答案接續 Markdown 渲染

**✅ 階段六驗收（觀察 + 半決定性）**
- [ ] 6.3 `curl` chat SSE 端點問一題會用工具的問題 → 串流中 grep 得到 `"type":"tool"` 事件
- [ ] 6.4 瀏覽器實看：先顯示工具進度、工具完成後逐字渲染最終答案

## 階段七：整體驗收

- [ ] 7.1 端到端：混合問題（連線 + 文件）於同一對話正確綜合
- [ ] 7.2 明確指令（「用 trace 查 …」）被遵守
- [ ] 7.3 `npm test` 全綠；確認全程未動正式 `data/rag.db`
