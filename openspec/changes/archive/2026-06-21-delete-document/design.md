## Context

Vector adapter 已有 `clear(docId, projectId)` 方法，可刪除指定文件的所有 chunks。目前只在重新上傳同名文件時呼叫，未暴露給使用者。`listDocuments(projectId)` 回傳 `{phase, docId}` 陣列，docId 即原始檔名（如 `EAR-100T7_2026_03_09_A04.pdf`）。

## Goals / Non-Goals

**Goals:**
- 新增 DELETE API，讓前端可刪除指定文件的所有 chunks
- 文件樹每筆文件旁顯示刪除按鈕，點擊後二次確認再送出請求

**Non-Goals:**
- 不支援批次刪除或刪除整個 phase
- 不支援刪除整個專案

## Decisions

### 1. API 路由：`DELETE /api/projects/:projectId/documents/:docId`

**決定**：docId 作為 URL path parameter，前端用 `encodeURIComponent(docId)` 編碼。

**理由**：RESTful 語意清楚；docId 是檔名，可能含點號但不含斜線，URL 編碼足夠安全。

---

### 2. 前端確認方式：`window.confirm()`

**決定**：使用瀏覽器原生 `confirm()` 對話框，不另建 modal。

**理由**：實作簡單，刪除操作頻率低，不需要精美的 UI。

## Risks / Trade-offs

- **誤刪無法還原** → 用 `confirm()` 提示確認，已是合理的防護。未來如有需求可加 undo，但目前不在 scope。
