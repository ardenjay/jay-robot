## MODIFIED Requirements

### Requirement: Generate answer with source citations
系統 SHALL 將檢索到的 chunks 組合成 prompt，呼叫 LLM 生成回答，回答中 SHALL 標註所引用的來源標題。當 LLM 回應包含「無法在提供的資料中找到答案」片語時，來源列表 SHALL 為空陣列。sources 事件的值 SHALL 為以 docId 去重的物件陣列 `{docId: string, url: string}`，url 格式為 `/documents/<projectId>/<encodeURIComponent(docId)>`。

#### Scenario: Successful answer generation
- **WHEN** 系統取得相關 chunks 並呼叫 LLM
- **THEN** 回應包含答案文字及來源物件列表 `[{docId, url}]`，每份文件只出現一次

#### Scenario: LLM cannot find answer in provided context
- **WHEN** chunks 內容與問題無關
- **THEN** LLM 回覆說明無法在提供的資料中找到答案，不應捏造內容

#### Scenario: Sources hidden when LLM reports no answer
- **WHEN** LLM 回應包含「無法在提供的資料中找到答案」
- **THEN** 送出的來源列表為空陣列（不論 vector search 找到幾個 chunks）
