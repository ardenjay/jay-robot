## ADDED Requirements

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

### Requirement: Forced first retrieval when the model answers with zero tool calls
prompt 規則對小模型(如 qwen3:14b)不可靠,系統 SHALL 以程式層防護兜底:專案有文件、且模型未呼叫任何工具就要產生最終回答時,系統 SHALL 代跑一次 `search_documents`(以原始問題為查詢),把結果以工具回合塞回對話歷史,讓模型依檢索結果重答;每個問題 SHALL 最多強制一次(模型重答後仍不用工具則接受其回答,避免迴圈)。強制檢索 SHALL 發送與一般工具呼叫相同的進度事件,其來源 SHALL 計入 sources。

#### Scenario: Zero-tool answer triggers forced search
- **WHEN** 模型第一輪未呼叫任何工具就回「請提供更詳細的資訊」
- **THEN** 系統代跑 search_documents(原問題),塞回結果後模型重答;前端看得到該次工具進度事件

#### Scenario: Forced at most once
- **WHEN** 強制檢索後模型仍不呼叫工具而直接作答
- **THEN** 系統接受該回答,不再重複強制

#### Scenario: No force when the model already used tools
- **WHEN** 模型已自行呼叫過 search_documents 或 netlist 工具後產生最終回答
- **THEN** 系統不追加強制檢索
