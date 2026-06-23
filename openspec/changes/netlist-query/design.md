## Context

問答目前是 `retrieval.answer()` 的單向流程：embed 問題 → 向量檢索 top-K → 組 prompt → stream。對「電路連線」這類圖查詢無效。`tools/netlist/netparse.py`（純 Python 標準庫）已能精確查詢 Allegro PST netlist（pstxprt/pstchip/pstxnet 三檔），但只有 `export` 是 JSON，其餘命令印純文字。專案已有 `spawn` 跑外部程式的模式（MinerU/markitdown）。Gemini SDK 0.24.1 支援 function calling（`functionDeclarations`/`functionCall`）。

## Goals / Non-Goals

**Goals:**
- 讓 LLM 能在需要時呼叫 netparse 精確回答電路問題
- 文件查詢與 netlist 查詢並存於同一對話，由 LLM 預設決定用哪個
- 過程對使用者透明（顯示呼叫了哪些工具）

**Non-Goals:**
- netlist 不上傳、不建向量 RAG（純即時查詢）
- 不重寫 netparse 的解析邏輯（沿用，只加 `--json` 與大網處理）
- 不做常駐 python 服務（冷啟 subprocess 每題重新 parse，目前可接受）
- 不在本變更引入硬性「強制工具」開關（先靠強系統指令）

## Decisions

### 1. 工具呼叫（function calling），非向量 RAG
**決定**：netlist 以 LLM function calling 查詢，不 embedding。
**理由**：連線/追線是圖查詢，需精確走訪；netparse 已實作。embedding 只會給模糊結果且無法多跳追線。

### 2. LLM 預設決定 + 文件查詢也是工具 + 強系統指令
**決定**：採 Gemini `AUTO` 模式；工具集 = `search_documents`（現有向量 RAG 包成工具）+ netlist 工具。system prompt 下強規則：涉及 refdes/net/腳位/連線必須呼叫 netlist 工具、不可憑記憶。
**理由**：統一、最 agentic、能混合（先 trace 再查文件補充）。強指令避免 LLM 用常識亂答或誤走文件路。
**保險（暫不做）**：若實測仍不聽話，再以樣式偵測切 `FunctionCallingMode.ANY`（可鎖 `allowed_function_names`）強制呼叫。

### 3. netparse 每命令加 `--json`
**決定**：`find/part/net/pin/connector/trace/info` 支援 `--json`，輸出結構化結果；保留原文字輸出供人用。
**理由**：結構化結果讓 LLM reason 更準、更不易誤讀對齊文字。netparse 已在 repo，改它無包袱。

### 4. 大網/電源處理：截斷摘要 + trace 電源腳警告（方案 1+3）
**決定**：
- 查詢（net/part）回傳超過門檻的節點時，**截斷並附摘要**（總數、依前綴統計 IC/電容…、列前 N 個），需要全部時 LLM 可再要求
- `trace` 起點為電源/地腳時，回**警告 + 建議**（改查 net 或換腳），不展開上百條路徑
- 判斷「電源/地」以**名稱樣式**（VDD/VCC/GND/VSS…）為主、節點數門檻為輔
**理由**：電源網 fan-out 極大，全列會爆 token 也無用。先靠命名（板子命名一致），門檻補漏。

### 5. 專案 → netlist 資料夾：依專案名；netlist 進 git；不上傳
**決定**：`tools/netlist/<專案名>/{pstxprt,pstchip,pstxnet}.dat`。查詢時以該專案名解析資料夾；存在 3 檔才對該專案啟用 netlist 工具，否則只有文件工具。`.dat` 進 git。
**理由**：對應使用者手動放置方式、零設定、無需上傳 UI。
**風險**：專案名須檔案系統安全（避免 `/`、特殊字元）；大檔進 git（已接受）。

### 6. 過程透明：SSE 新增 tool 事件
**決定**：工具迴圈每次呼叫前發 `{type:'tool', ...}` 事件，前端顯示「正在呼叫 X」；最終答案仍逐字 `token` 串流。
**理由**：工具跑完前沒有最終答案可串，顯示進度避免畫面空白、也讓使用者看到依據。

### 7. tasks 內部分階段
**決定**：spec 一次定義完整；實作分階段——
- **階段一（核心可跑）**：netparse `--json`、netlist 工具執行 service + 資料夾解析、llm-adapter 工具呼叫、retrieval 工具迴圈 + 強系統指令
- **階段二（體驗）**：大網摘要 + trace 電源腳警告、SSE tool 事件 + UI 顯示
**理由**：先讓核心問答能用工具，再打磨輸出與 UI。

**每階段獨立驗收**：每個階段都有自己的驗收方式，優先用決定性手段——netparse `--json`（JSON 可解析 + 對照真值）、netlist 工具 service（單元測試、唯讀 100T）、大網處理（單元測試）皆可自動化；llm-adapter 用 stub 測試 + 可選一次真呼叫；工具迴圈與 UI 用端到端觀察並**對照 netparse 真值**。所有會寫入的驗收一律用隔離/暫存 DB，不碰正式 `data/rag.db`。

## Risks / Trade-offs

- **最大的核心改動**：碰 llm-adapter / rag-query / chat-ui 三塊；工具迴圈取代既有單向 RAG 流程。分階段降低風險。
- **LLM 不呼叫工具**：靠強系統指令；殘留風險以 `FunctionCallingMode.ANY` 當保險。
- **多輪延遲**：每輪工具呼叫 = 一次 LLM round + 一次 subprocess；複雜問題較慢。
- **冷啟 parse**：大板子每題重 parse 三檔（約一兩秒）；需要再做常駐服務。
- **電源網判斷**：靠命名樣式，命名不規則時可能漏判；門檻為輔。
- **檔名安全 / 大檔進 git**：專案名須 FS-safe；netlist 為 IP（已接受進 git）。
