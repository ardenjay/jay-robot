## Context

前端單頁（`public/index.html`）以 fetch + ReadableStream 讀 SSE：`token`（一次含完整答案或錯誤文字）、`tool`（工具進度）、`sources`、`[DONE]`。assistant 泡泡在送出時就建立（`appendAssistantBubble()`），但 token 抵達前是空的。工具事件已即時顯示在 `tool-log` 區，但「兩個事件之間」與「送出到第一個事件之間」沒有任何動態。

## Goals / Non-Goals

**Goals:**
- 從送出到答案出現的每一刻，泡泡內都有動態訊號（動畫 + 當前階段文字）。
- 零後端變更；不影響既有 Markdown 渲染與工具日誌行為。

**Non-Goals:**
- 不做真正的逐字串流改造（`chatWithTools` 一次回整段是後端結構，另案處理）。
- 不做進度百分比或耗時估計（無資料可依據）。
- 不動上傳區的等待狀態（已有）。

## Decisions

### 1. 指示器放在 assistant 泡泡內文區，第一個 `token` 抵達時整個替換
- `appendAssistantBubble()` 建泡泡時同時插入 `<div class="generating">`（三個 CSS 動畫跳動點 + `<span>` 階段文字）。
- 收到第一個 `token` → 移除指示器、開始渲染 Markdown；收到 `error` 或 `[DONE]` → 同樣移除（防呆：異常結束不留殘影）。
- 替代案「泡泡外的全域 spinner」：跟對話流視覺脫節，且多輪對話時不知道在等哪一則。

### 2. 階段文字由既有 SSE 事件驅動，不新增事件型別
- 初始：「思考中…」。收到 `tool` 事件：「查詢中：<工具顯示名>」（工具名做人話對映：`search_documents`→「搜尋文件」、`netlist_*`→「查電路」；未知名稱原樣顯示）。該輪工具事件處理完後回到「整理答案中…」。
- 事件已足夠表達階段；後端加事件是不必要的耦合。

### 3. 純 CSS 動畫（`@keyframes` 跳動點），不引入任何函式庫
- 專案前端零框架（vanilla JS + marked），維持慣例。

## Risks / Trade-offs

- [多輪工具呼叫時階段文字快速跳動] → 工具日誌區本來就逐行累積，指示文字只反映最新狀態，可接受。
- [SSE 連線中斷（無 error 事件）指示器殘留] → fetch catch 與 reader 結束路徑都走同一個移除函式兜底。

## Migration Plan

純前端新增，重新整理頁面即生效；無回滾需求（revert commit 即可）。

## Open Questions

- 無。
