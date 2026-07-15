## MODIFIED Requirements

### Requirement: Keyword index covers chunk title
FTS 關鍵字索引 SHALL 以兩個獨立欄位組成：`content_seg`（title + content 經分詞後組成）與 `doc_seg`（doc_id 經分詞後組成），使標題詞（如章節路徑中的「I/O 規格」）與文件名中的詞（如「100T」）皆可被關鍵字檢索命中——實例:「100T 有幾個 CAN」的答案 chunk 標題與內文皆無「100T」,僅文件名帶著。排序 SHALL 使用欄位加權的 BM25（`content_seg` 權重高於 `doc_seg`），使文件名匹配可補足內文完全沒有該詞的情況，但不能蓋過內文本身的相關性——同一份文件內，內容真正相關且字數較長的 chunk 排名 SHALL 不因為其他內容空洞的 chunk 也命中文件名而被壓過。索引定義變更 SHALL 以 `PRAGMA user_version` 版本戳觸發一次性整表重建:啟動時 user_version 低於目標版本即重建並寫回;既有的「chunks 與 FTS 筆數不符即重建」檢查保留。

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

#### Scenario: Doc name match does not override in-document content relevance
- **WHEN** 同一份文件內有兩個 chunk：一個內容空洞（如封面/安裝須知），另一個內容長且真正回答問題（如規格列表），查詢字串含該文件的文件名關鍵字（如專案代號）
- **THEN** 內容真正相關的 chunk 排名 SHALL 不被內容空洞的 chunk 壓過——後者不因文件名占其總字數比例高而在 BM25 上獲得不成比例的優勢
