## ADDED Requirements

### Requirement: Answer may include relevant figures from retrieved content

system instruction SHALL 引導 LLM：當檢索到的文件內容（chunk）中含有圖片 Markdown（已是絕對路徑的 `![](...)`），且該圖有助於說明答案時，LLM 可在最終答案中帶出該圖片連結。LLM SHALL 僅使用檢索內容中**既有**的圖片連結，SHALL NOT 自行杜撰或猜測任何圖片路徑。

#### Scenario: Relevant figure included in answer
- **WHEN** 某檢索到的 chunk 含 `![](/documents/p1/C560/images/fig1.jpg)`，且該圖與問題相關
- **THEN** LLM 的答案可包含該圖片 Markdown，使前端得以顯示該圖

#### Scenario: No fabricated image paths
- **WHEN** 檢索內容中沒有任何圖片連結
- **THEN** LLM 的答案不包含任何圖片 Markdown（不得自行編造路徑）
