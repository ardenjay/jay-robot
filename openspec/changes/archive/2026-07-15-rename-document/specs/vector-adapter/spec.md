## ADDED Requirements

### Requirement: renameDocument updates chunks and keyword index atomically
Vector adapter SHALL 提供 `renameDocument(projectId, oldDocId, newDocId)`:單一交易內更新該文件所有 chunks 的 `doc_id`,並重建其 FTS 索引列(索引文本含檔名,不可只改欄位),回傳更新的 chunk 數(0 表示文件不存在)。

#### Scenario: 改名後關鍵字索引跟上
- **WHEN** renameDocument 後以新檔名中的詞做關鍵字查詢
- **THEN** 可命中該文件 chunks;以舊檔名中的詞查詢不再命中(除非內文本身含該詞)

#### Scenario: 文件不存在
- **WHEN** oldDocId 在該專案無任何 chunks
- **THEN** 回傳 0,不做任何變更
