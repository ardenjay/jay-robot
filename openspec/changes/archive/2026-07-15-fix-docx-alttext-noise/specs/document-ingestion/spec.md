## ADDED Requirements

### Requirement: Strip known auto-generated boilerplate before chunking
系統 SHALL 在 `parseAndChunk` 切塊前，從 Markdown 內容中移除已知的自動生成樣板文字（如 Word 對未手動撰寫替代文字的圖片自動產生、markitdown 轉檔時原樣保留的免責聲明「AI 產生的內容可能不正確」），避免此類重複出現的樣板文字污染 chunk 內容、進而灌高 BM25 詞頻或影響 embedding。清理 SHALL 僅移除已確認的樣板字串本身，不影響圖片語法或其他正文內容。

#### Scenario: docx 轉檔的圖片 alt-text 含免責聲明
- **WHEN** Markdown 內容中的圖片 alt-text 含「AI 產生的內容可能不正確」
- **THEN** 該字串（含前後可能的空白與句點）被移除，chunk 內容不再包含此字串，圖片語法（`![](...)`）本身保留

#### Scenario: 同一 chunk 含多張圖片、多次出現樣板文字
- **WHEN** 單一 chunk 因含多張圖片而重複出現該樣板文字多次
- **THEN** 每一次出現都被移除，不殘留任何一次

#### Scenario: 正文與其他描述文字不受影響
- **WHEN** 圖片 alt-text 除樣板文字外還有其他描述（如「一張含有 文字, 數字, 字型的圖片」），或該 chunk 含有與樣板文字無關的其他正文
- **THEN** 這些內容維持原樣，不被移除或改寫
