## Why

folder 進料的圖片連結改寫目前只認 mineru 風格的標準 Markdown 相對連結 `![](images/x.jpg)`，並假設圖都在 `images/` 子資料夾。但使用者也會用 **Obsidian** 整理文件：圖語法是 wiki-link `![[檔名.jpg]]`，圖放在筆記同名的附件子資料夾（如 `Thor Carrier Board/`）。這類文件進料後連結完全沒被改寫，chunk 存的是原樣 wiki-link——LLM 引用後前端 marked 不認得 `![[...]]`，答案與來源檢視器都只顯示成文字（實例：`C208 SoC Data Sheet`，7 張圖全沒顯示，圖檔其實都已持久化）。

## What Changes

- **連結改寫新增 Obsidian wiki-link 規則**：`![[name.jpg]]`（含 `![[name.jpg|alt]]` 變體）→ 在進料資料夾內**遞迴尋找**該檔名的圖檔（不限 `images/`，可在任意子資料夾）→ 改寫成標準 Markdown 絕對路徑 `![](/documents/<proj>/<docId>/<實際子路徑>/<檔名>)`，路徑各段 URL 編碼（沿用既有慣例）。
- **找不到對應檔案的 wiki-link 保留原樣**，不杜撰路徑。
- **來源檢視器同步受益**：`docView` 讀持久化 md 時套用同一改寫（對持久化資料夾建檔案索引後改寫）。
- **既有行為不變**：標準 `![](images/...)` 改寫照舊；持久化本來就是整夾複製，子資料夾圖檔已會被複製，不需改。

## Capabilities

### New Capabilities
<!-- 無 -->

### Modified Capabilities
- `document-ingestion`: 圖片連結改寫擴充支援 Obsidian wiki-link（`![[...]]`）與「圖檔位於任意子資料夾」。

## Impact

- **修改** `src/services/imageLinks.js`：`rewriteImageLinks` 擴充 wiki-link 規則，接受資料夾檔案索引以解析實際子路徑。
- **修改** `src/services/ingestion.js`：進料時對來源資料夾建立圖檔索引（檔名 → 相對子路徑）供改寫使用。
- **修改** `src/services/docView.js`：檢視時對持久化資料夾建立同樣索引並套用改寫。
- **測試**：wiki-link 改寫（含 `|alt` 變體、含空格檔名）、子資料夾尋檔、找不到保留原樣、與標準語法混用共存。
- **資料**：修完後受影響文件（如 C208）重灌一次即可顯示圖；因 docView 讀檔時也改寫，來源檢視器對已持久化的舊資料**不重灌也能**顯示（chunks 內的 wiki-link 則需重灌才會變成標準連結）。
