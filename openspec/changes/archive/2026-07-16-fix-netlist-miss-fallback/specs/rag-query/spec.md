## MODIFIED Requirements

### Requirement: Forced retrieval when the model would answer without ever searching documents
prompt 規則對小模型(如 qwen3:14b)不可靠,系統 SHALL 以程式層防護兜底:專案有文件、模型要產生最終回答、且**整段對話從未成功呼叫過 `search_documents`**時,若滿足下列任一情境,系統 SHALL 代跑一次 `search_documents`(以原始問題為查詢),把結果以工具回合塞回對話歷史,讓模型依檢索結果重答:(a)模型完全未呼叫任何工具就要作答;(b)模型只用了 netlist 工具、且**每一次** netlist 查詢都 miss(結果 `found:false` 或工具執行錯誤)。每個問題 SHALL 最多強制一次(重答後仍不查文件則接受其回答,避免迴圈)。強制檢索 SHALL 發送與一般工具呼叫相同的進度事件,其來源 SHALL 計入 sources。若 netlist 有任一查詢命中(非全 miss),SHALL NOT 追加文件檢索。

#### Scenario: Zero-tool answer triggers forced search
- **WHEN** 模型第一輪未呼叫任何工具就回「請提供更詳細的資訊」
- **THEN** 系統代跑 search_documents(原問題),塞回結果後模型重答;前端看得到該次工具進度事件

#### Scenario: All-miss netlist answer triggers forced document search
- **WHEN** 模型只呼叫了 netlist 工具(如對「TSMC CN34 這條線做什麼用」呼叫 netlist_net),且該次(或多次)查詢全部回 `found:false`,接著要以「查無此 net」作答,且整段對話未曾查過文件
- **THEN** 系統代跑一次 search_documents(原問題),塞回結果後模型改依文件內容作答;前端看得到該次工具進度事件

#### Scenario: Forced at most once
- **WHEN** 強制檢索後模型仍不呼叫工具而直接作答
- **THEN** 系統接受該回答,不再重複強制

#### Scenario: No force when a netlist query hit
- **WHEN** 模型呼叫 netlist 工具且至少一次查詢命中(非全 miss),依結果作答
- **THEN** 系統不追加強制檢索(netlist 路徑有效)

#### Scenario: No force when the model already searched documents
- **WHEN** 模型已自行呼叫過 `search_documents` 後產生最終回答
- **THEN** 系統不追加強制檢索
