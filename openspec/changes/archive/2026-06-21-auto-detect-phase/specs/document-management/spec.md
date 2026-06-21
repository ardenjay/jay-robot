## ADDED Requirements

### Requirement: Move document to different phase
系統 SHALL 提供 `PATCH /api/projects/:id/documents/:docId/phase` API，更新指定文件在該 project 內所有 chunks 的 phase 欄位。

#### Scenario: Move document to valid phase
- **WHEN** 用戶送出 PATCH 請求，body 包含有效的 `phase`（C1–C7）
- **THEN** 系統更新 SQLite 中該 docId + projectId 的所有 chunks phase 欄位，回傳 HTTP 200 `{ ok: true }`

#### Scenario: Move document to invalid phase
- **WHEN** PATCH 請求的 `phase` 不在 C1–C7 範圍內
- **THEN** 系統回傳 HTTP 400 並說明 phase 無效
