## Purpose

TBD — RAG Query capability for the markdown-rag-chatbot. Handles embedding user questions, retrieving relevant chunks from the vector store, generating answers via LLM, and streaming responses to the client.

## Requirements

### Requirement: Embed user question and retrieve relevant chunks
文件檢索 SHALL 以一個工具 `search_documents` 的形式提供給 LLM：當 LLM 判斷需要已上傳文件來回答時，呼叫該工具，系統才將問題向量化並從 vector store（hybrid search）取得候選池（預設池大小 25），再交由 LLM rerank 篩至 top-K（預設 K=5）供作答。文件檢索不再對每個問題無條件執行，而是由工具迴圈視需要觸發。

#### Scenario: LLM uses document search tool
- **WHEN** 使用者問題需要已上傳文件內容，LLM 呼叫 `search_documents`
- **THEN** 系統回傳 rerank 後最相關的 top-K chunks 及其 title 供 LLM 作答

#### Scenario: No documents uploaded
- **WHEN** LLM 呼叫 `search_documents` 但資料庫為空
- **THEN** 工具回傳「尚未上傳任何文件」的結果，LLM 據以回應

#### Scenario: Candidate pool reranked by relevance before truncation to top-K
- **WHEN** hybrid search 回傳的候選池數量大於 top-K（例如跨語言關鍵字不匹配，導致 BM25/向量分數排序與實際相關性不一致）
- **THEN** 系統呼叫 LLM 對候選池做一次語意排序，取排序後前 top-K 筆作為最終檢索結果，而非直接依 BM25/向量分數截斷

#### Scenario: Pool is wide enough to include vector-strong hits demoted by fusion
- **WHEN** 某正確 chunk 在純向量排名靠前（如 #13）、但在 RRF 融合後因跨語言關鍵字排名很差被拉低（如融合後 #19–22）
- **THEN** 候選池（預設 25）仍涵蓋該 chunk，交由 rerank 依語意把它排回 top-K

#### Scenario: Rerank call fails or returns unparseable output
- **WHEN** rerank 呼叫的 LLM 回應無法解析出有效索引，或呼叫本身出錯（如逾時、連線失敗）
- **THEN** 系統不中斷檢索流程，退回候選池原排序的前 top-K 筆

### Requirement: Generate answer with source citations
系統 SHALL 將檢索到的 chunks 組合成 prompt，呼叫 LLM 生成回答，回答中 SHALL 標註所引用的來源標題。當 LLM 回應包含「無法在提供的資料中找到答案」片語時，來源列表 SHALL 為空陣列。sources 事件的值 SHALL 為以 docId 去重的物件陣列 `{docId: string, url: string}`，url 格式為 `/documents/<projectId>/<encodeURIComponent(docId)>`。

#### Scenario: Successful answer generation
- **WHEN** 系統取得相關 chunks 並呼叫 LLM
- **THEN** 回應包含答案文字及來源物件列表 `[{docId, url}]`，每份文件只出現一次

#### Scenario: LLM cannot find answer in provided context
- **WHEN** chunks 內容與問題無關
- **THEN** LLM 回覆說明無法在提供的資料中找到答案，不應捏造內容

#### Scenario: Sources hidden when LLM reports no answer
- **WHEN** LLM 回應包含「無法在提供的資料中找到答案」
- **THEN** 送出的來源列表為空陣列（不論 vector search 找到幾個 chunks）

### Requirement: Stream LLM response to client
系統 SHALL 透過 SSE 串流問答過程：工具迴圈每次呼叫工具前 SHALL 發送工具進度事件，最終答案 SHALL 以 token 逐字串流，結束時 SHALL 發送來源列表事件。

#### Scenario: Streaming with tool progress
- **WHEN** LLM 在生成過程中呼叫工具
- **THEN** 前端先收到工具進度事件（顯示呼叫了哪個工具），工具完成後再逐字收到最終答案 token

#### Scenario: Stream ends
- **WHEN** LLM 完成生成
- **THEN** SSE 發送包含來源列表的最終事件後關閉連線

### Requirement: Answer via LLM tool-calling loop
系統 SHALL 以 LLM 工具呼叫迴圈回答問題：提供工具集（`search_documents` 與該專案可用的 netlist 工具），由 LLM 預設決定呼叫哪些工具；系統執行工具、將結果回填，反覆直到 LLM 產生最終答案。system 指令 SHALL 以獨立的 system 元素（`{role:'system'}`）送入 adapter，SHALL NOT 與使用者問題串接成同一個 user message——指令塞在 user message 內會被部分模型（如 qwen3）的 chat template 弱化，導致模型以文字宣告要用工具而不實際呼叫。system prompt SHALL 含強指令：凡涉及具體零件(refdes)、net、腳位、連線/追線，LLM 必須呼叫 netlist 工具而非憑記憶猜測。

#### Scenario: System instruction sent as system-role element
- **WHEN** `answer()` 組第一輪訊息
- **THEN** contents[0] 為 system 元素（含完整指令），contents[1] 為僅含使用者問題的 user 元素

#### Scenario: Circuit question routes to netlist tools
- **WHEN** 使用者問連線/零件/追線問題，且該專案有 netlist
- **THEN** LLM 呼叫 netlist 工具（而非文件查詢或憑記憶），依工具結果回答

#### Scenario: Document question routes to document search
- **WHEN** 使用者問已上傳文件相關問題
- **THEN** LLM 呼叫 `search_documents`，依檢索結果回答

#### Scenario: Mixed question uses multiple tools
- **WHEN** 問題同時需要連線資訊與文件說明
- **THEN** LLM 可在同一輪對話中呼叫多個工具，綜合結果作答

#### Scenario: Explicit user direction is honored
- **WHEN** 使用者明確要求使用某工具（如「用 trace 查 U42.4」）
- **THEN** LLM 依指令呼叫對應工具

### Requirement: Answer may include relevant figures from retrieved content

system instruction SHALL 引導 LLM：當檢索到的文件內容（chunk）中含有圖片 Markdown（已是絕對路徑的 `![](...)`），且該圖有助於說明答案時，LLM 可在最終答案中帶出該圖片連結。LLM SHALL 僅使用檢索內容中**既有**的圖片連結，SHALL NOT 自行杜撰或猜測任何圖片路徑。

#### Scenario: Relevant figure included in answer
- **WHEN** 某檢索到的 chunk 含 `![](/documents/p1/C560/images/fig1.jpg)`，且該圖與問題相關
- **THEN** LLM 的答案可包含該圖片 Markdown，使前端得以顯示該圖

#### Scenario: No fabricated image paths
- **WHEN** 檢索內容中沒有任何圖片連結
- **THEN** LLM 的答案不包含任何圖片 Markdown（不得自行編造路徑）

### Requirement: Must search before answering not-found or off-topic
system prompt SHALL 含以下路由防護指令:(1) 文件內容類問題(規格、價格、報價、採購、測試報告、日期等)LLM 一律先呼叫 `search_documents` 檢索,SHALL NOT 未經檢索就自行判定問題與專案無關或回答找不到;文件檢索為漸進式——第一輪結果相關但不足以完整回答時,必須以結果中出現的料號/單號/規格名/文件標題換關鍵字再檢索 1–3 輪,仍找不到才回答找不到;(2) 若 netlist 工具查無相關結果,且問題其實是「用了哪顆晶片/零件、規格為何」這類文件也能回答的問題,LLM 必須接著呼叫 `search_documents` 從已上傳文件中找答案,不可只查 netlist 就回答找不到;(3) 專案名稱與使用者提供的專案背景僅供解讀代稱,SHALL NOT 被用來判定使用者的問題與專案無關;(4) 建議上傳的文件只能從 NPDS 目錄(已排除已上傳者)挑選,出現在檢索結果或來源中的文件代表已上傳,SHALL NOT 建議使用者上傳它們。

#### Scenario: Netlist miss falls back to document search
- **WHEN** 使用者問「SoC 用哪一顆」,netlist_find 查無名為 SOC 的零件
- **THEN** LLM 接著呼叫 search_documents,從 datasheet 等文件答出所用晶片,而非直接回答找不到

#### Scenario: Progressive document search before giving up
- **WHEN** 使用者問「sensing camera 多少錢」,第一輪檢索只撈到採購概述(有廠商與數量、無單價)
- **THEN** LLM 以結果中的料號/單號(如 396DZ100018、PO-4510127873)換關鍵字再檢索,答出單價,而非一輪就回答文件未提供

#### Scenario: Off-topic-looking question still gets searched
- **WHEN** 使用者問「sensing camera 多少錢」,而專案背景描述產品為 Box PC
- **THEN** LLM 仍先呼叫 search_documents(專案文件含報價單/採購單),從 PO 文件答出價格,而非未經檢索判定與專案無關

### Requirement: Forced retrieval when the model would answer without ever searching documents
prompt 規則對小模型(如 qwen3:14b)不可靠,系統 SHALL 以程式層防護兜底:專案有文件、模型要產生最終回答、且**整段對話從未成功呼叫過 `search_documents`**時,若滿足下列任一情境,系統 SHALL 代跑一次 `search_documents`(以原始問題為查詢),把結果以工具回合塞回對話歷史,讓模型依檢索結果重答:(a)模型完全未呼叫任何工具就要作答;(b)模型只用了 netlist 工具、且**每一次** netlist 查詢都 miss。netlist「miss」的判定 SHALL 涵蓋所有 netlist 工具的查無結構:工具執行錯誤、`found:false`(net/part/pin/trace),或 `count:0`(find 零命中);`netlist_info`(總覽,無 found/count)不算 miss。每個問題 SHALL 最多強制一次(重答後仍不查文件則接受其回答,避免迴圈)。強制檢索 SHALL 發送與一般工具呼叫相同的進度事件,其來源 SHALL 計入 sources。若 netlist 有任一查詢命中(非全 miss),SHALL NOT 追加文件檢索。

#### Scenario: Zero-tool answer triggers forced search
- **WHEN** 模型第一輪未呼叫任何工具就回「請提供更詳細的資訊」
- **THEN** 系統代跑 search_documents(原問題),塞回結果後模型重答;前端看得到該次工具進度事件

#### Scenario: All-miss netlist answer triggers forced document search
- **WHEN** 模型只呼叫了 netlist 工具(如對「TSMC CN34 這條線做什麼用」呼叫 netlist_net),且該次(或多次)查詢全部回 `found:false`,接著要以「查無此 net」作答,且整段對話未曾查過文件
- **THEN** 系統代跑一次 search_documents(原問題),塞回結果後模型改依文件內容作答;前端看得到該次工具進度事件

#### Scenario: netlist_find zero-hit also triggers forced document search
- **WHEN** 模型呼叫 `netlist_find`(如關鍵字 `RJ45`)得到 `count:0` 的零命中,接著要回「未找到」,且整段對話未曾查過文件
- **THEN** 系統判定此為 netlist miss(即使回傳無 `found` 欄位)、代跑一次 search_documents,模型改依文件內容作答(如答出 C208 的 RJ45 connector J85)

#### Scenario: Forced at most once
- **WHEN** 強制檢索後模型仍不呼叫工具而直接作答
- **THEN** 系統接受該回答,不再重複強制

#### Scenario: No force when a netlist query hit
- **WHEN** 模型呼叫 netlist 工具且至少一次查詢命中(非全 miss),依結果作答
- **THEN** 系統不追加強制檢索(netlist 路徑有效)

#### Scenario: No force when the model already searched documents
- **WHEN** 模型已自行呼叫過 `search_documents` 後產生最終回答
- **THEN** 系統不追加強制檢索
