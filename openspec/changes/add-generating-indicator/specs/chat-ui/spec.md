## ADDED Requirements

### Requirement: Generating indicator while waiting for answer
送出問題後，assistant 泡泡 SHALL 立即顯示動態生成中指示（動畫 + 階段文字），直到第一個答案 token 抵達才移除並開始渲染答案；錯誤或串流結束時亦 SHALL 移除（不留殘影）。階段文字 SHALL 由 SSE 事件驅動：初始為「思考中」，收到工具事件時顯示該工具的人話名稱（如 `search_documents`→「搜尋文件」、`netlist_*`→「查電路」），工具事件處理後顯示「整理答案中」。

#### Scenario: Indicator appears immediately on submit
- **WHEN** 使用者送出問題
- **THEN** assistant 泡泡立即出現動態指示與「思考中」文字，畫面不再是空白泡泡

#### Scenario: Stage text follows tool events
- **WHEN** SSE 收到 `tool` 事件（如 `search_documents`）
- **THEN** 指示文字切換為對應人話名稱（「查詢中：搜尋文件」），之後切為「整理答案中」

#### Scenario: Indicator removed when answer arrives
- **WHEN** 第一個 `token` 事件抵達
- **THEN** 指示器移除，泡泡開始顯示渲染後的答案

#### Scenario: Indicator removed on error or abnormal end
- **WHEN** SSE 回傳 `error` 事件、或連線中斷／`[DONE]` 而無任何 token
- **THEN** 指示器移除，不殘留動畫
