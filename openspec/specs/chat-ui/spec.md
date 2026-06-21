## Purpose

TBD — Chat UI capability for the markdown-rag-chatbot. Provides a single-page web interface for uploading Markdown files and interacting with the RAG-powered chatbot.

## Requirements

### Requirement: Markdown file upload interface
UI SHALL 提供文件上傳區，讓用戶可選取或拖曳 `.md` 檔案並送出，上傳後顯示處理結果。

#### Scenario: Upload file and show result
- **WHEN** 用戶選取 `.md` 檔案並點擊上傳
- **THEN** UI 顯示上傳中狀態，完成後顯示「已處理 N 個段落」訊息

#### Scenario: Upload error
- **WHEN** 上傳失敗（格式錯誤或伺服器錯誤）
- **THEN** UI 顯示具體錯誤訊息，不清除已輸入內容

### Requirement: Chat interface with streaming display
UI SHALL 提供對話輸入框，用戶輸入問題後 SHALL 即時串流顯示 LLM 回答。

#### Scenario: Submit question and stream answer
- **WHEN** 用戶在輸入框輸入問題並按 Enter 或點擊送出
- **THEN** 回答區即時顯示生成中的文字，完成後停止更新

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
