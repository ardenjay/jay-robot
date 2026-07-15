## ADDED Requirements

### Requirement: Keyword index covers chunk title
FTS 關鍵字索引的 `content_seg` SHALL 由「title + 換行 + content」經分詞後組成(寫入與整表重建皆同),使標題詞(如章節路徑中的「I/O 規格」)可被關鍵字檢索命中。索引定義變更 SHALL 以 `PRAGMA user_version` 版本戳觸發一次性整表重建:啟動時 user_version 低於目標版本即重建並寫回;既有的「chunks 與 FTS 筆數不符即重建」檢查保留。

#### Scenario: Title term matches via keyword search
- **WHEN** 某 chunk title 含「I/O 規格」而內文無此詞,使用者查詢含「I/O」
- **THEN** hybridSearch 的關鍵字腿可命中該 chunk

#### Scenario: One-time rebuild on version bump
- **WHEN** 以舊版索引(user_version 低於目標)的 DB 啟動 adapter
- **THEN** FTS 整表重建(既有 chunks 的 title 一併納入索引),user_version 更新;下次啟動不再重建

#### Scenario: Old chunks benefit without re-ingest
- **WHEN** 重建後查詢的關鍵字只出現在某舊 chunk 的 title
- **THEN** 該 chunk 可被關鍵字檢索命中(無需重灌文件)
