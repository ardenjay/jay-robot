## MODIFIED Requirements

### Requirement: Parse Markdown by headings
系統 SHALL 依 `#`、`##`、`###` 標題將 Markdown 文件切割成語意 chunks;每個 chunk 的 `title` SHALL 為其所屬的完整章節路徑(自最上層標題至最近標題,以「 › 」串接),切塊時依標題深度維護階層堆疊(遇同層或較淺標題即截斷堆疊)。

#### Scenario: Document with multiple headings
- **WHEN** Markdown 文件包含多個標題
- **THEN** 每個標題與其下方內容形成一個獨立 chunk

#### Scenario: Nested headings produce a section path
- **WHEN** 內容位於「# 介面 > ## 通訊 > ### CAN」之下
- **THEN** 該 chunk 的 `title` 為「介面 › 通訊 › CAN」

#### Scenario: Sibling heading truncates the stack
- **WHEN** 「### CAN」之後出現同層「### UART」,其後再出現上層「## 電源」
- **THEN** UART 段的 title 為「介面 › 通訊 › UART」,電源段的 title 為「介面 › 電源」

#### Scenario: Document without headings
- **WHEN** Markdown 文件沒有任何標題
- **THEN** 整份文件作為一個 chunk,`title` 為檔案名稱

#### Scenario: Chunk exceeds 1500 characters
- **WHEN** 單一 chunk 超過 1500 字
- **THEN** 系統以段落為單位進一步切割,確保每個 chunk 不超過 1500 字,各子塊沿用同一章節路徑 title

### Requirement: Embed and store chunks
系統 SHALL 將 chunks 透過 Embedding API 轉換為向量,並連同原始文字、標題、文件 ID 一起儲存至 vector store;embedding 的輸入文本 SHALL 為「title + 換行 + 內文」(標題脈絡參與語意比對),儲存的 `content` 欄位 SHALL 維持純內文。為降低 API 請求數與速率限制(429)風險,系統 SHALL 以**批次方式**產生 embedding(每批多個 chunk 一次送出),而非每個 chunk 各發一次請求。

#### Scenario: Embedding input includes the section path
- **WHEN** chunk title 為「介面 › 通訊 › CAN」、內文為規格表
- **THEN** 送給 embedding API 的文本以「介面 › 通訊 › CAN」開頭、換行後接內文;DB 的 `content` 僅存內文

#### Scenario: Batch embedding and storage
- **WHEN** 一份文件被切成多個 chunks 並進行 embedding
- **THEN** 系統分批呼叫批次 embedding(每批多筆),取得的向量與各 chunk 的 metadata 一同寫入 SQLite

#### Scenario: Embedding API rate limit hit
- **WHEN** Embedding API 回傳速率限制錯誤(429)
- **THEN** 系統重試該批請求;若回應含建議等待時間(`retryDelay`)則依其等待,否則採指數退避,達重試上限後才視為失敗

#### Scenario: Large document does not exhaust per-request rate limit
- **WHEN** 上傳頁數很多、chunks 數量龐大的文件
- **THEN** 因採批次 embedding,API 請求數遠少於 chunk 數,顯著降低觸發 429 的機率
