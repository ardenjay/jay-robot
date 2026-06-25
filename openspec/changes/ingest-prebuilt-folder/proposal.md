## Why

目前唯一的進料路徑是 Web 上傳：server 端跑 MinerU/markitdown 轉檔，轉完把暫存目錄整個刪掉——MinerU 從 PDF 抽出的圖片因此遺失，也沒進知識庫。我們希望保留圖片（之後要能在 UI 顯示、甚至餵給 LLM）。最簡單可靠的做法，是把「跑 MinerU」移到使用者 PC 上，PC 處理好後把 `md + images` 整個資料夾複製到 server，再由一個指令觸發進料。這樣 server 不必跑 MinerU、圖片天生就在資料夾裡，不會被刪。

## What Changes

- 新增 CLI 進料腳本 `scripts/ingest-folder.js`，吃一個「已處理好的資料夾」並把它灌進知識庫：
  - 一個資料夾 = 一個 `docId`（取資料夾名）。docId **不驗證格式**，任何資料夾名皆可；用 NPDS 代碼命名僅為建議（方便自動帶 phase 與去重）。
  - 資料夾可含**多個 `.md`** + 一個 `images/`；所有 md 切出的 chunks 都歸這個 docId。
  - 每個 chunk 的 `title` 記錄來源 md 檔名（例如 `detail.md › 某段標題`），多 md 時可追溯來源。
  - 把 md 內的相對圖片連結 `![](images/x.jpg)` **改寫成絕對路徑** `![](/documents/<projectId>/<docId>/images/x.jpg)`，存進 chunk（讓資料一進來就是可顯示/可定位狀態）。
  - 把資料夾的 `images/` 複製到 `public/documents/<projectId>/<docId>/images/`，並一併保留 md 原檔。
  - 重複進料同一個 docId：沿用現行「先 `clear(docId)` 再 `add`」覆蓋，圖片資料夾整個換掉。
- 觸發方式：`node scripts/ingest-folder.js <folder> --project <id> [--phase <Cx>]`；`<folder>` 省略時預設讀 `incoming/` 下的資料夾，給了路徑就用該路徑（可絕對路徑）。
- phase 決定：`--phase` 省略時，**從資料夾名偵測 NPDS 代碼**（如 `C560` → C5）；偵測不到就**報錯要求給 `--phase`**——不猜、不沿用任何預設值。給了 `--phase` 則以參數為準。
- 重用現有 `ingestFile()` 的切塊 / 批次 embedding 邏輯，不另寫一套。
- **不受唯讀模式影響**：CLI 不走 web，唯讀服務維持唯讀。

## Capabilities

### New Capabilities
<!-- 無新 capability -->

### Modified Capabilities
- `document-ingestion`: 新增「以預先處理好的資料夾（多 md + images）進料、保留並改寫圖片連結、記錄來源 md 檔名」的需求。

## Impact

- **新增**：`scripts/ingest-folder.js`（CLI）。
- **修改**：`src/services/ingestion.js`（抽出可重用的進料邏輯，支援多 md、圖片複製、連結改寫、title 記檔名）。
- **資料夾約定**：`incoming/<docId>/{*.md, images/}`。
- **持久化位置**：`public/documents/<projectId>/<docId>/`（md 原檔 + `images/`）。
- **明確不做（各自之後）**：在 UI 實際顯示圖（下一個 change）、答案時把原圖餵給 LLM（階段二）。
- **無 breaking change**：既有 Web 上傳路徑不變；本功能為額外的進料管道。
