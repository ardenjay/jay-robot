## ADDED Requirements

### Requirement: Chunker tests
系統 SHALL 提供針對 `parseAndChunk()` 的 unit tests，涵蓋標題切塊、無標題、超長 chunk 三種情境。

#### Scenario: Document with multiple headings produces one chunk per heading
- **WHEN** Markdown 文件包含 3 個標題（# / ## / ###）
- **THEN** `parseAndChunk()` 回傳 3 個 chunk，每個 chunk 的 `title` 對應標題文字

#### Scenario: Document without headings produces single chunk
- **WHEN** Markdown 文件沒有任何標題
- **THEN** `parseAndChunk()` 回傳 1 個 chunk，`title` 為傳入的 filename

#### Scenario: Chunk exceeding 1500 characters is split
- **WHEN** 單一標題下方的內容超過 1500 字
- **THEN** `parseAndChunk()` 將該 chunk 拆成多個，每個不超過 1500 字

### Requirement: Vector adapter tests
系統 SHALL 提供針對 `SqliteVectorAdapter` 的 unit tests，涵蓋 add、search、clear 操作。

#### Scenario: Add chunks and search returns correct top result
- **WHEN** 新增兩個 chunk（向量不同），以其中一個的向量搜尋
- **THEN** 搜尋結果第一筆為該 chunk，cosine distance 最小

#### Scenario: Clear removes all chunks for a document
- **WHEN** 新增 chunk 後呼叫 `clear(docId)`
- **THEN** `isEmpty()` 回傳 `true`，搜尋回傳空陣列

#### Scenario: Re-adding same docId replaces old chunks
- **WHEN** 呼叫 `clear(docId)` 再 `add()` 同一份文件的新 chunks
- **THEN** 搜尋結果只包含新 chunks，舊 chunks 不出現

### Requirement: Ingestion pipeline tests
系統 SHALL 提供針對 `ingestFile()` 的 unit tests，使用 mock LLM adapter，不呼叫真實 Gemini API。

#### Scenario: Ingest file returns correct chunk count
- **WHEN** 傳入含 3 個標題的 Markdown 檔案與 mock LLM adapter
- **THEN** `ingestFile()` 回傳 chunk 數量為 3，vector store 中有 3 筆記錄

#### Scenario: Re-ingest same file replaces existing chunks
- **WHEN** 同一份文件 ingest 兩次（第二次內容不同）
- **THEN** vector store 最終只有第二次的 chunks

### Requirement: npm test runs all tests
系統 SHALL 提供 `npm test` script，一次執行 `tests/` 資料夾下所有 `.test.js` 檔案，並在測試失敗時以非零 exit code 結束。

#### Scenario: All tests pass
- **WHEN** 執行 `npm test`
- **THEN** 所有測試通過，exit code 為 0

#### Scenario: A test fails
- **WHEN** 某個 assertion 不符預期
- **THEN** 測試輸出明確顯示失敗的測試名稱，exit code 為非零
