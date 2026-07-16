## ADDED Requirements

### Requirement: Sidecar per-row index for large tables
切塊時,系統 SHALL 對「body 列數超過 `MIN_TABLE_ROWS`」的表格(HTML `<table>` 或 markdown pipe 表)**額外**抽出每一 body 列,寫入獨立的 `table_rows` 儲存(每列內容 = 表頭欄名 + 該列儲存格,title = 章節路徑,自帶 embedding)。主 chunk 的切塊行為 SHALL 完全不變(整張表仍留在所屬段落 chunk 內);`table_rows` SHALL NOT 進入主 chunks 表或 FTS 索引。重灌文件(`clear`)時 SHALL 同步清除該文件的 `table_rows`。

#### Scenario: Dense spec table emits sidecar rows
- **WHEN** 文件含 body 列數 > 門檻的規格表(如 MTi §6.2 尺寸/重量/IP)
- **THEN** 每列(如「Weight … 8.9 gram」)各成一筆 `table_rows`,主 chunk 內容與數量與未啟用此功能時相同

#### Scenario: Small table emits nothing
- **WHEN** 表格 body 列數 ≤ 門檻
- **THEN** 不產生任何 `table_rows`,行為與現狀完全一致

#### Scenario: Re-ingest replaces sidecar rows
- **WHEN** 同一 docId 重新進料
- **THEN** 舊的 `table_rows` 被清除,不殘留
