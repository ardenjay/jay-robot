## Purpose

TBD — RAG Query capability for the markdown-rag-chatbot. Handles embedding user questions, retrieving relevant chunks from the vector store, generating answers via LLM, and streaming responses to the client.

## Requirements

### Requirement: Embed user question and retrieve relevant chunks
系統 SHALL 將用戶問題向量化，並從 vector store 搜尋餘弦距離最近的 top-K chunks（預設 K=5）。

#### Scenario: Question matches stored content
- **WHEN** 用戶送出問題且資料庫有相關 chunks
- **THEN** 系統回傳相似度最高的 5 個 chunks 及其 title

#### Scenario: No documents uploaded
- **WHEN** 用戶送出問題但資料庫為空
- **THEN** 系統回傳提示訊息說明尚未上傳任何文件

### Requirement: Generate answer with source citations
系統 SHALL 將檢索到的 chunks 組合成 prompt，呼叫 LLM 生成回答，回答中 SHALL 標註所引用的來源標題。

#### Scenario: Successful answer generation
- **WHEN** 系統取得相關 chunks 並呼叫 LLM
- **THEN** 回應包含答案文字及引用的 chunk title 列表

#### Scenario: LLM cannot find answer in provided context
- **WHEN** chunks 內容與問題無關
- **THEN** LLM 回覆說明無法在提供的資料中找到答案，不應捏造內容

### Requirement: Stream LLM response to client
系統 SHALL 透過 Server-Sent Events（SSE）將 LLM 生成的 token 即時串流至前端。

#### Scenario: Streaming response
- **WHEN** LLM 開始生成答案
- **THEN** 前端即時收到每個 token，不需等待完整回應

#### Scenario: Stream ends
- **WHEN** LLM 完成生成
- **THEN** SSE 發送包含來源列表的最終事件後關閉連線
