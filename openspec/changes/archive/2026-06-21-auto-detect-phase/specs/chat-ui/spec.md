## MODIFIED Requirements

### Requirement: Markdown file upload interface
UI SHALL 提供文件上傳區，讓用戶可選取或拖曳 `.md` / `.pdf` 檔案並送出，上傳後顯示處理結果。選取檔案後，UI SHALL 嘗試從檔名自動預填 phase 下拉選單；User 可在送出前修改。

#### Scenario: Upload file and show result
- **WHEN** 用戶選取 `.md` 或 `.pdf` 檔案並點擊上傳
- **THEN** UI 顯示上傳中狀態，完成後顯示「已處理 N 個段落」訊息

#### Scenario: Auto-fill phase from filename
- **WHEN** 用戶選取的檔案名稱含 NPDS 文件代碼（如 `C303_spec.md`）
- **THEN** phase 下拉選單自動預選對應階段（如 C3）

#### Scenario: Upload error
- **WHEN** 上傳失敗（格式錯誤或伺服器錯誤）
- **THEN** UI 顯示具體錯誤訊息，不清除已輸入內容

## ADDED Requirements

### Requirement: Move document phase in document tree
文件樹中每個文件 SHALL 提供移動階段按鈕，點擊後顯示 C1–C7 選擇器（當前 phase 預選），選完後呼叫 PATCH API 並重新載入文件樹。

#### Scenario: User moves document to another phase
- **WHEN** 用戶在文件樹中點擊某文件的移動階段按鈕並選擇新 phase
- **THEN** 系統呼叫 PATCH API，成功後文件出現在新 phase 的分組下

#### Scenario: User cancels phase move
- **WHEN** 用戶點擊移動階段按鈕後按 Escape 或點擊取消
- **THEN** phase 不變，文件樹保持原狀
