## MODIFIED Requirements

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
