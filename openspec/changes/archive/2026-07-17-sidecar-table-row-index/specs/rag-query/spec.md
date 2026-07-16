## ADDED Requirements

### Requirement: Bounded table-row injection into rerank pool
`search_documents` 檢索時,系統 SHALL 在主候選池(hybrid union)組成後、rerank 前,以查詢向量比對 `table_rows`:僅當相似度 ≥ `ROW_SIM_FLOOR` 時,取最高的前 `MAX_ROW_INJECT`(2)列**附加**進候選池(不替換、不擠掉任何主池候選),交由 rerank 篩選。`table_rows` 為空或無列過門檻時,檢索行為 SHALL 與現狀完全一致。

#### Scenario: Single-attribute spec query gets the row injected
- **WHEN** 使用者問單一屬性(如「MTi 模組的重量」),正解列對查詢 cos 高於門檻
- **THEN** 該列被附加進候選池,rerank 將其選入 top-K,模型答出正確值(8.9 gram)

#### Scenario: Unrelated query injects nothing
- **WHEN** 查詢與任何表格列相似度低於門檻(如「EAR-100T 的音訊介面有哪些?」)
- **THEN** 不注入任何列,主池與 rerank 輸入與現狀完全相同(前案 5 題退化不再發生)

#### Scenario: Injection is additive
- **WHEN** 有列過門檻被注入
- **THEN** 主池原有候選一個不少,池大小最多 +MAX_ROW_INJECT
