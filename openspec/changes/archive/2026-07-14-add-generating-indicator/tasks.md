## 1. 前端實作（public/index.html）

- [x] 1.1 CSS：`.generating` 指示器樣式（三點跳動 `@keyframes` 動畫 + 階段文字）
- [x] 1.2 `appendAssistantBubble()` 建泡泡時插入指示器；提供 `setStage(text)` 與 `removeIndicator()`
- [x] 1.3 SSE 迴圈接線：初始「思考中」；`tool` 事件 → 「查詢中：<人話名>」（`search_documents`→搜尋文件、`netlist_*`→查電路、未知原樣）→ 「整理答案中」；首個 `token` → 移除並渲染
- [x] 1.4 兜底：`error` 事件、fetch catch、串流結束（無 token）三條路徑都移除指示器

## 2. 驗證

- [x] 2.1 以 `LLM_ADAPTER=ollama` 實測：送出問題立即見「思考中」動畫 → 工具階段文字切換 → 答案出現時指示器消失
- [x] 2.2 錯誤路徑實測（如暫停 Ollama 讓請求失敗）：指示器移除、錯誤訊息正常顯示
