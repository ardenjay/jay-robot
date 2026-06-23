## MODIFIED Requirements

### Requirement: Embed and store chunks
系統 SHALL 將 chunks 的文字透過 Embedding API 轉換為向量，並連同原始文字、標題、文件 ID 一起儲存至 vector store。為降低 API 請求數與速率限制（429）風險，系統 SHALL 以**批次方式**產生 embedding（每批多個 chunk 一次送出），而非每個 chunk 各發一次請求。

#### Scenario: Batch embedding and storage
- **WHEN** 一份文件被切成多個 chunks 並進行 embedding
- **THEN** 系統分批呼叫批次 embedding（每批多筆），取得的向量與各 chunk 的 metadata 一同寫入 SQLite

#### Scenario: Embedding API rate limit hit
- **WHEN** Embedding API 回傳速率限制錯誤（429）
- **THEN** 系統重試該批請求；若回應含建議等待時間（`retryDelay`）則依其等待，否則採指數退避，達重試上限後才視為失敗

#### Scenario: Large document does not exhaust per-request rate limit
- **WHEN** 上傳頁數很多、chunks 數量龐大的文件
- **THEN** 因採批次 embedding，API 請求數遠少於 chunk 數，顯著降低觸發 429 的機率
