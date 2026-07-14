## ADDED Requirements

### Requirement: Obsidian wiki-link images are rewritten to absolute paths

圖片連結改寫 SHALL 支援 Obsidian wiki-link 語法：`![[檔名]]` 與 `![[檔名|替代文字]]`。改寫時 SHALL 在進料資料夾內（含任意層子資料夾）尋找該檔名對應的檔案，並將 wiki-link 改寫為標準 Markdown 絕對路徑 `![](/documents/<projectId>/<docId>/<實際相對子路徑>)`，路徑各段 SHALL 做 URL 編碼（含空格的檔名與子資料夾名可正確解析）。若資料夾內找不到該檔名的檔案，該 wiki-link SHALL 保留原樣，不得杜撰路徑。既有的標準 Markdown 相對連結（`![](images/...)`）改寫行為 SHALL 維持不變，兩種語法可在同一份 md 中混用。

#### Scenario: Wiki-link image in a note-named subfolder
- **WHEN** md 含 `![[Thor CB Fig1-1 Block Diagram.jpg]]`，且該檔位於子資料夾 `Thor Carrier Board/`
- **THEN** 寫入 chunk 的內容中該連結為 `![](/documents/<proj>/<docId>/Thor%20Carrier%20Board/Thor%20CB%20Fig1-1%20Block%20Diagram.jpg)`（標準語法、URL 編碼）

#### Scenario: Wiki-link with alt text
- **WHEN** md 含 `![[fig.jpg|方塊圖]]`，且 `fig.jpg` 存在於資料夾內
- **THEN** 改寫為標準 Markdown 圖片語法並指向該檔的絕對路徑（alt 部分不影響路徑解析）

#### Scenario: Wiki-link target not found is left as-is
- **WHEN** md 含 `![[missing.jpg]]`，但資料夾內（含子資料夾）沒有該檔
- **THEN** 該 wiki-link 保留原樣，不改寫、不杜撰路徑

#### Scenario: Standard and wiki-link syntax coexist
- **WHEN** 同一份 md 同時含 `![](images/a.jpg)` 與 `![[b.jpg]]`（兩檔皆存在）
- **THEN** 兩者皆被改寫為各自的標準絕對路徑，互不影響

### Requirement: Source viewer resolves wiki-link images from the persisted folder

來源檢視器讀取持久化 md 時，SHALL 對 Obsidian wiki-link 套用同樣的改寫（以持久化資料夾內的實際檔案位置解析），使含 wiki-link 的文件在檢視器中能顯示圖片。

#### Scenario: Viewer shows wiki-link images
- **WHEN** 使用者點開一個含 `![[...]]` 圖語法的 folder 文件來源
- **THEN** 檢視器渲染出對應圖片（wiki-link 已被解析為持久化位置的絕對路徑）
