## ADDED Requirements

### Requirement: Keyword index covers chunk title
FTS 關鍵字索引的 `content_seg` SHALL 由「doc_id(文件名)+ title + content」經分詞後組成(寫入與整表重建皆同),使標題詞(如章節路徑中的「I/O 規格」)與文件名中的詞(如「100T」)可被關鍵字檢索命中——實例:「100T 有幾個 CAN」的答案 chunk 標題與內文皆無「100T」,僅文件名帶著。索引定義變更 SHALL 以 `PRAGMA user_version` 版本戳觸發一次性整表重建:啟動時 user_version 低於目標版本即重建並寫回;既有的「chunks 與 FTS 筆數不符即重建」檢查保留。

#### Scenario: Title term matches via keyword search
- **WHEN** 某 chunk title 含「I/O 規格」而內文無此詞,使用者查詢含「I/O」
- **THEN** hybridSearch 的關鍵字腿可命中該 chunk

#### Scenario: One-time rebuild on version bump
- **WHEN** 以舊版索引(user_version 低於目標)的 DB 啟動 adapter
- **THEN** FTS 整表重建(既有 chunks 的 title 一併納入索引),user_version 更新;下次啟動不再重建

#### Scenario: Old chunks benefit without re-ingest
- **WHEN** 重建後查詢的關鍵字只出現在某舊 chunk 的 title
- **THEN** 該 chunk 可被關鍵字檢索命中(無需重灌文件)

#### Scenario: Doc name term matches via keyword search
- **WHEN** 答案 chunk 的「100T」只出現在文件名(C455 EAR-100T_UM…),標題與內文皆無
- **THEN** 查詢「100T 有幾個 CAN」時該 chunk 可被關鍵字腿命中,不被內文 CAN 高密度的無關文件壓過
