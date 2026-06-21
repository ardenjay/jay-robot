## ADDED Requirements

### Requirement: Document tree by NPDS phase
系統 SHALL 提供 API 回傳指定專案中已上傳文件的清單，依 NPDS 階段（C1–C7）分組。

#### Scenario: Project has documents in multiple phases
- **WHEN** 請求專案的文件樹，且該專案在 C2、C4 有文件
- **THEN** 回傳結構包含 C1–C7 所有鍵值，C2、C4 各含文件名稱列表，其餘為空陣列

#### Scenario: Project has no documents
- **WHEN** 請求一個尚未上傳任何文件的專案的文件樹
- **THEN** 回傳 C1–C7 所有鍵值均為空陣列

### Requirement: Document tree UI rendering
前端 SHALL 將文件樹以樹狀圖呈現，C1–C7 各為一個可展開節點，節點下方列出該階段已上傳的文件名稱。

#### Scenario: Phase with documents shows file list
- **WHEN** 使用者展開有文件的階段節點（如 C3）
- **THEN** 節點下方顯示所有屬於 C3 的文件名稱

#### Scenario: Empty phase is visually distinct
- **WHEN** 某個階段（如 C5）尚未上傳任何文件
- **THEN** 該節點顯示為灰色或帶「尚未上傳」標示，與有文件的節點有視覺區別
