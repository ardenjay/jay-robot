## ADDED Requirements

### Requirement: Display tool-call progress
聊天介面 SHALL 在助手回答過程中顯示工具呼叫進度：收到工具進度事件時，UI SHALL 呈現正在呼叫哪個工具（如「🔧 正在查 trace(U42.4)…」），讓使用者看到答案的依據；最終答案仍以 Markdown 逐字渲染。

#### Scenario: Show tool calls during answering
- **WHEN** 助手在生成過程中呼叫一個或多個工具
- **THEN** UI 依序顯示各工具呼叫的進度提示

#### Scenario: Final answer after tools
- **WHEN** 工具呼叫完成、LLM 開始輸出最終答案
- **THEN** UI 接續以 Markdown 逐字渲染最終答案（工具進度可保留為過程記錄）
