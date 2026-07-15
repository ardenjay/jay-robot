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

### Requirement: Download original file endpoint

系統 SHALL 提供 `GET /api/projects/:id/documents/:docId/download`，回傳該文件的「原始檔」並以 `Content-Disposition: attachment` 觸發瀏覽器下載、檔名為原始檔名。分流：

- **檔案型 docId**（web 上傳，docId 即檔名，持久化為單一檔）→ 回傳該檔。
- **目錄型 docId**（folder 進料，持久化為目錄）→ 回傳目錄內的 `.pdf`。

找不到原始檔（如目錄內無 `.pdf`，或路徑不存在）→ 回 404。路徑解析 SHALL 防止穿越（不得讀取文件目錄以外的檔案）。此為 GET 讀取路由，SHALL NOT 受唯讀模式（`READ_ONLY`）阻擋。

#### Scenario: Download a web-uploaded file
- **WHEN** 對檔案型 docId（如 `C560.pdf`）呼叫 download 端點
- **THEN** 回傳該檔內容，附 `Content-Disposition: attachment`，瀏覽器以原檔名下載

#### Scenario: Download a folder-ingested document's original
- **WHEN** 對目錄型 docId（如 `C204 MTi 600`，目錄內含 `MT1603P.pdf`）呼叫 download 端點
- **THEN** 回傳該 `MT1603P.pdf`，瀏覽器以該檔名下載

#### Scenario: No original to download
- **WHEN** 目錄型 docId 的目錄內沒有 `.pdf`，或 docId 不存在
- **THEN** 回 404

#### Scenario: Download works in read-only mode
- **WHEN** 站台以 `READ_ONLY=true` 運行，呼叫 download 端點
- **THEN** 正常回傳檔案（GET 讀取路由，不被唯讀阻擋）

### Requirement: Download by clicking the document name in the tree

文件樹中**點擊文件名稱** SHALL 觸發該文件原始檔的下載（呼叫 download 端點）。名稱 SHALL 呈現可點擊的視覺提示（如游標、hover 樣式）。此為讀取操作，SHALL 在唯讀模式下**仍可用**（與刪除、移動階段等寫入操作不同——後者在唯讀模式隱藏）。

#### Scenario: Click the file name in the tree
- **WHEN** 使用者點擊文件樹中某文件的名稱
- **THEN** 瀏覽器開始下載該文件的原始檔

#### Scenario: Name download works in read-only mode
- **WHEN** 站台以 `READ_ONLY=true` 運行，使用者點擊文件名稱
- **THEN** 仍正常下載（刪除/移動按鈕則隱藏，名稱下載不受影響）

### Requirement: Rename document
系統 SHALL 提供 `PATCH /api/projects/:id/documents/:docId/rename`(body `{newDocId}`)就地改名:同一交易更新該文件所有 chunks 的 `doc_id` 與 FTS 索引列,並將持久化檔案/資料夾 `fs.rename` 至新名(磁碟來源不存在時僅更新 DB)。newDocId SHALL 驗證非空且不含 `/`、`\`、`..`;與其他既有 docId 重複或目標持久化路徑已存在 SHALL 回 409;文件不存在回 404;唯讀模式回 403。改名 SHALL NOT 觸發重新 embedding 或重灌。

#### Scenario: 改名成功
- **WHEN** 對「C208 DataSheet」PATCH `{newDocId: "C208 Jetson Thor SoC Data Sheet"}`
- **THEN** 回 200;文件樹顯示新名、來源檢視與下載以新名可用、以新檔名關鍵字提問可命中該文件 chunks,舊名搜不到

#### Scenario: 名稱衝突
- **WHEN** newDocId 與專案內另一份文件相同
- **THEN** 回 409,資料不變

#### Scenario: 非法名稱
- **WHEN** newDocId 為空白或含 `/`、`\`、`..`
- **THEN** 回 400

#### Scenario: 唯讀模式
- **WHEN** `READ_ONLY=1` 時呼叫 rename
- **THEN** 回 403

#### Scenario: 改名入口(UI)
- **WHEN** 管理模式下滑過文件樹的文件列
- **THEN** 顯示改名按鈕(與刪除/搬階段同排),點擊以預填舊名的輸入框改名,成功後樹即時更新;唯讀模式不顯示
