## ADDED Requirements

### Requirement: Persist converted markdown for converted single-file uploads
單檔上傳經轉檔（markitdown/MinerU）進料時，系統 SHALL 在持久化原始檔之外，把轉出的 markdown 一併存為 `public/documents/<project>/<docId>.md`（原始檔仍以原名保存、供下載）。直接上傳 .md 者不需 sibling（原檔即 md）。

#### Scenario: docx upload persists both original and converted md
- **WHEN** 上傳 `UM.docx` 完成進料
- **THEN** documents 目錄同時存在 `UM.docx`（原檔）與 `UM.docx.md`（轉出的 md）

### Requirement: Backfill accepts converted-md sibling as source
啟動回填的單檔佈局來源判定 SHALL 依序為：(1) `<docId>` 本身為 .md；(2) sibling `<docId>.md` 存在。兩者皆無才跳過（log 列明）。

#### Scenario: Previously-converted doc backfills from sibling
- **WHEN** 某 .docx 文件的 sidecar 版本落後，且其 `<docId>.md` sibling 存在
- **THEN** 回填以 sibling md 抽列、寫入 table_rows 並蓋戳，不再每次啟動被跳過

#### Scenario: Docs without sibling still skipped
- **WHEN** 歷史 .docx 文件無 sibling md
- **THEN** 行為與現狀相同（跳過＋log），重新上傳後產生 sibling 即自動納入
