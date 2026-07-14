## MODIFIED Requirements

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
