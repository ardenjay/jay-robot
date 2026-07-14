## Why

送出問題後到第一個事件抵達前、工具執行期間、以及最終答案生成期間，畫面完全靜止（assistant 泡泡是空的）——本機 Ollama（qwen3:14b）每輪推理要數秒到數十秒，使用者以為當掉而重送或放棄。需要一個生成中提示讓使用者知道系統還在工作。

## What Changes

- 送出問題後立即在 assistant 泡泡顯示動態等待指示（跳動點 + 階段文字），第一個答案 token 抵達（或錯誤/結束）時移除。
- 指示文字隨 SSE 事件切換階段：初始「思考中…」→ 收到 `tool` 事件改「查詢中：<工具名>」→ 工具結果回填後改「整理答案中…」。
- 純前端變更（`public/index.html` 的 CSS + JS）；後端 SSE 事件流不動。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `chat-ui`: 新增「生成中指示」需求——等待期間顯示動態指示與階段文字，答案抵達時移除；既有串流顯示需求不變。

## Impact

- `public/index.html` — 指示元件 CSS（動畫）、SSE 處理迴圈的狀態切換 JS。
- 無後端、無 API、無相依性變更；`tests/` 無新增（純視覺行為，現有測試不涉前端 DOM）。
