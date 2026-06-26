## ADDED Requirements

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
