## ADDED Requirements

### Requirement: Must search before answering not-found or off-topic
system prompt SHALL 含以下路由防護指令:(1) 文件內容類問題(規格、價格、報價、採購、測試報告、日期等)LLM 一律先呼叫 `search_documents` 檢索,SHALL NOT 未經檢索就自行判定問題與專案無關或回答找不到;文件檢索為漸進式——第一輪結果相關但不足以完整回答時,必須以結果中出現的料號/單號/規格名/文件標題換關鍵字再檢索 1–3 輪,仍找不到才回答找不到;(2) 若 netlist 工具查無相關結果,且問題其實是「用了哪顆晶片/零件、規格為何」這類文件也能回答的問題,LLM 必須接著呼叫 `search_documents` 從已上傳文件中找答案,不可只查 netlist 就回答找不到;(3) 專案名稱與使用者提供的專案背景僅供解讀代稱,SHALL NOT 被用來判定使用者的問題與專案無關。

#### Scenario: Netlist miss falls back to document search
- **WHEN** 使用者問「SoC 用哪一顆」,netlist_find 查無名為 SOC 的零件
- **THEN** LLM 接著呼叫 search_documents,從 datasheet 等文件答出所用晶片,而非直接回答找不到

#### Scenario: Progressive document search before giving up
- **WHEN** 使用者問「sensing camera 多少錢」,第一輪檢索只撈到採購概述(有廠商與數量、無單價)
- **THEN** LLM 以結果中的料號/單號(如 396DZ100018、PO-4510127873)換關鍵字再檢索,答出單價,而非一輪就回答文件未提供

#### Scenario: Off-topic-looking question still gets searched
- **WHEN** 使用者問「sensing camera 多少錢」,而專案背景描述產品為 Box PC
- **THEN** LLM 仍先呼叫 search_documents(專案文件含報價單/採購單),從 PO 文件答出價格,而非未經檢索判定與專案無關
