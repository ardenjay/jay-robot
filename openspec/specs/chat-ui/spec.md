## Purpose

TBD — Chat UI capability for the markdown-rag-chatbot. Provides a single-page web interface for uploading Markdown files and interacting with the RAG-powered chatbot.

## Requirements

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

### Requirement: Chat interface with streaming display
UI SHALL 提供對話輸入框，用戶輸入問題後 SHALL 即時串流顯示 LLM 回答。助手回答 SHALL 以 **Markdown 渲染**呈現（粗體、項目清單、標題、程式碼、連結等），而非顯示原始 Markdown 符號；渲染於瀏覽器端以本機提供的 marked 函式庫完成。使用者輸入的問題泡泡 SHALL 維持純文字、不做 Markdown 渲染。

#### Scenario: Submit question and stream answer
- **WHEN** 用戶在輸入框輸入問題並按 Enter 或點擊送出
- **THEN** 回答區即時顯示生成中的文字，完成後停止更新

#### Scenario: Answer rendered as Markdown
- **WHEN** LLM 回答包含 Markdown 語法（如 `**粗體**`、`*` 項目清單、標題）
- **THEN** 回答泡泡顯示對應的格式化結果（粗體、清單、標題），不顯示原始 `**`、`*` 等符號

#### Scenario: Streaming renders progressively
- **WHEN** 回答以 token 串流逐步抵達
- **THEN** 回答泡泡隨累積的 Markdown 逐步重新渲染，最終呈現完整格式化內容

#### Scenario: User question is not rendered as Markdown
- **WHEN** 用戶送出的問題文字含有 Markdown 符號
- **THEN** 問題泡泡以純文字原樣顯示，不被解析為 Markdown

#### Scenario: Submit while previous response is streaming
- **WHEN** 用戶在上一個回答尚未完成時送出新問題
- **THEN** 前一個串流被中斷，開始處理新問題

### Requirement: Source citations display
UI SHALL 在每個回答下方顯示所引用的來源文件連結列表。每個來源 SHALL 渲染為可點擊的 `<a target="_blank">` 超連結，點擊後在新分頁開啟對應原始文件。

#### Scenario: Answer with sources
- **WHEN** LLM 回答完成且 sources 列表非空
- **THEN** 回答下方出現「來源：」區塊，列出來源文件的可點擊連結（顯示 docId，href 為 url）

#### Scenario: No relevant sources found
- **WHEN** 資料庫為空或無相關 chunks
- **THEN** 來源區塊顯示「無相關文件」

#### Scenario: LLM reports no answer
- **WHEN** sources 列表為空陣列（LLM 無法回答）
- **THEN** 來源區塊不顯示任何連結

### Requirement: Single-page application
UI SHALL 為單一 HTML 頁面，無需頁面跳轉，所有功能在同一畫面完成。

#### Scenario: Page load
- **WHEN** 用戶開啟 `http://localhost:3000`
- **THEN** 頁面呈現上傳區與對話區，無需任何登入或設定

### Requirement: Move document phase in document tree
文件樹中每個文件 SHALL 提供移動階段按鈕，點擊後顯示 C1–C7 選擇器（當前 phase 預選），選完後呼叫 PATCH API 並重新載入文件樹。

#### Scenario: User moves document to another phase
- **WHEN** 用戶在文件樹中點擊某文件的移動階段按鈕並選擇新 phase
- **THEN** 系統呼叫 PATCH API，成功後文件出現在新 phase 的分組下

#### Scenario: User cancels phase move
- **WHEN** 用戶點擊移動階段按鈕後按 Escape 或點擊取消
- **THEN** phase 不變，文件樹保持原狀

### Requirement: Navigate between project list and project detail
UI SHALL 提供專案列表頁與專案內頁兩個視圖。進入某專案內頁時，標題列 SHALL 顯示「返回專案列表」按鈕；點擊後 SHALL 回到專案列表頁，供使用者新建或切換專案。位於專案列表頁時，該返回按鈕 SHALL 隱藏。

#### Scenario: Back button visible in project detail
- **WHEN** 使用者進入某專案內頁（`#/projects/<id>`）
- **THEN** 標題列顯示「返回專案列表」按鈕

#### Scenario: Back button returns to project list
- **WHEN** 使用者在專案內頁點擊「返回專案列表」按鈕
- **THEN** 畫面切換回專案列表頁，可見建立專案表單與既有專案清單

#### Scenario: Back button hidden on project list
- **WHEN** 使用者位於專案列表頁
- **THEN** 返回按鈕不顯示

### Requirement: Display tool-call progress
聊天介面 SHALL 在助手回答過程中顯示工具呼叫進度：收到工具進度事件時，UI SHALL 呈現正在呼叫哪個工具（如「🔧 正在查 trace(U42.4)…」），讓使用者看到答案的依據；最終答案仍以 Markdown 逐字渲染。

#### Scenario: Show tool calls during answering
- **WHEN** 助手在生成過程中呼叫一個或多個工具
- **THEN** UI 依序顯示各工具呼叫的進度提示

#### Scenario: Final answer after tools
- **WHEN** 工具呼叫完成、LLM 開始輸出最終答案
- **THEN** UI 接續以 Markdown 逐字渲染最終答案（工具進度可保留為過程記錄）
