## ADDED Requirements

### Requirement: Split large tables into per-row chunks
切塊時,系統 SHALL 對「body 列數超過 `MIN_TABLE_ROWS`(門檻,如 2)」的表格(HTML `<table>...</table>` 或 markdown pipe 表)拆成**每一 body 列各一個 chunk**;每個列 chunk 的內容 SHALL 包含該表的表頭列(欄名,提供欄位脈絡)與該列各儲存格文字,chunk 的 `title` SHALL 為當前章節路徑(與所屬段落相同)。列數不超過門檻的小表 SHALL 維持整塊、不拆。

此舉修正「密集多屬性規格/腳位表被整張塞進單一 chunk,單一屬性查詢(重量、IP、某 pin)對整表 embedding 相似度被稀釋而召回不到」的問題(見 spec-table-recall-dilution)。拆列後,單屬性查詢對「該屬性所在列」的小 chunk 有高相似度,得以進入候選池。

#### Scenario: Dense spec table is split per row
- **WHEN** 某段落含一個 body 列數 > 門檻的表格(如 MTi §6.2:Size/Weight/Temperature/IP-rating/... 多列)
- **THEN** 每一列(如「Weight … 8.9 gram」、「IP-rating … IP68」)各成一個 chunk,內容含表頭欄名與該列儲存格,title 為該段落章節路徑

#### Scenario: Single-attribute query recalls the right row
- **WHEN** 使用者問單一屬性(如「MTi 模組的重量」),而該屬性是密集規格表的其中一列
- **THEN** 該列的小 chunk 因高相似度進入候選池,模型據以答出正確值(8.9 gram),而非因整表 embedding 稀釋而落在池外

#### Scenario: Small table stays whole
- **WHEN** 表格 body 列數不超過門檻(如 2 列的公司資訊表)
- **THEN** 該表維持在所屬段落 chunk 內、不拆列

#### Scenario: Non-table content unaffected
- **WHEN** 段落為純內文(無表格)
- **THEN** 切塊行為與既有一致(依 `#` 標題與整段粗體標題切塊)
