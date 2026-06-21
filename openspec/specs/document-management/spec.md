## Purpose

This capability covers document management operations within a project, including creating, listing, and deleting documents and their associated data.

## Requirements

### Requirement: Delete document
系統 SHALL 提供 API 讓使用者刪除指定專案中的單一文件（移除該文件的所有 chunks）。

#### Scenario: Delete existing document
- **WHEN** 使用者對 `DELETE /api/projects/:projectId/documents/:docId` 送出請求，且該文件存在於指定專案
- **THEN** 系統刪除該文件的所有 chunks 並回傳 HTTP 200

#### Scenario: Delete non-existent document
- **WHEN** 使用者請求刪除不存在的文件
- **THEN** 系統仍回傳 HTTP 200（冪等操作，clear 不報錯）

### Requirement: Delete document UI
前端文件樹 SHALL 在每個文件名稱旁顯示刪除按鈕，點擊後透過二次確認再執行刪除，刪除成功後即時更新文件樹。

#### Scenario: User confirms deletion
- **WHEN** 使用者點擊文件旁的刪除按鈕並在確認對話框選擇確定
- **THEN** 系統呼叫 DELETE API，成功後從文件樹移除該文件

#### Scenario: User cancels deletion
- **WHEN** 使用者點擊刪除按鈕但在確認對話框選擇取消
- **THEN** 不送出任何請求，文件樹保持不變

### Requirement: Move document to different phase
系統 SHALL 提供 `PATCH /api/projects/:id/documents/:docId/phase` API，更新指定文件在該 project 內所有 chunks 的 phase 欄位。

#### Scenario: Move document to valid phase
- **WHEN** 用戶送出 PATCH 請求，body 包含有效的 `phase`（C1–C7）
- **THEN** 系統更新 SQLite 中該 docId + projectId 的所有 chunks phase 欄位，回傳 HTTP 200 `{ ok: true }`

#### Scenario: Move document to invalid phase
- **WHEN** PATCH 請求的 `phase` 不在 C1–C7 範圍內
- **THEN** 系統回傳 HTTP 400 並說明 phase 無效
