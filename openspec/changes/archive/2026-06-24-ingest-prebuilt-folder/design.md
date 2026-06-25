## Context

進料目前只有 Web 上傳一條路：[upload.js](../../../src/routes/upload.js) 收檔 → server 跑 MinerU/markitdown → `findFirstMd` 取單一 .md → `ingestFile()` 切塊/embed/存 → `finally { fs.rmSync(tmpDir) }`。MinerU 抽出的 `images/` 就在 tmpDir 裡，被這個 rmSync 刪光，也從未進知識庫。

`ingestFile(filePath, filename, projectId, phase, …)`（[ingestion.js](../../../src/services/ingestion.js)）已經是可注入、與 web 無關的純函式：讀單一 md → `parseAndChunk`（依標題切、>1500 字再切）→ 批次 `embedBatch` → `clear(docId)` + `add`。docId 目前 = filename。

新方向：把 MinerU 留在使用者 PC，server 改吃「已處理好的資料夾」。本設計聚焦這條 CLI 進料路徑與圖片持久化，不碰 UI 顯示與餵 LLM。

## Goals / Non-Goals

**Goals:**
- 一支 CLI 腳本把 `incoming/<docId>/{*.md, images/}` 灌進知識庫。
- 一資料夾 = 一 docId（資料夾名）；可多 md，chunks 全歸該 docId；title 記來源 md 檔名。
- 圖片複製到 `public/documents/<projectId>/<docId>/images/`，md 連結改寫為絕對路徑。
- 重用既有切塊/embedding 邏輯，避免複製一套。
- 不受唯讀模式影響（CLI 不走 web）。

**Non-Goals:**
- 不在 UI 顯示圖（下一個 change）。
- 不在答案時把圖餵給 LLM（階段二）。
- 不在 server 跑 MinerU（這條路徑由 PC 端處理）。
- 不做資料夾監看（watch）或進料 API。

## Decisions

### 決策 1：CLI 腳本，不開 API
`scripts/ingest-folder.js`，用法 `node scripts/ingest-folder.js [folder] --project <id> --phase <Cx>`。

- **為何**：admin-only 操作，CLI 最單純、零攻擊面、且天然不受唯讀模式影響；開 API 會與唯讀模式衝突、且「讀本機任意資料夾」做成端點有風險。
- **參數解析**：用 Node 內建 `util.parseArgs`，免新增依賴。

### 決策 2：把 `ingestFile` 的核心抽成可重用單元，新增「資料夾」進料入口
保留現有 `ingestFile`（web 路徑續用），抽出共用的「切塊 + 批次 embed + clear/add」步驟，新增 `ingestFolder(folderPath, { projectId, phase, docId })`：讀資料夾內**所有 `.md`**、各自 `parseAndChunk`、合併後以同一 docId embed/存。

- **為何**：避免兩套切塊/embedding 邏輯漂移；多 md 只是「對每個 md 跑 parseAndChunk 再合併」。
- **title 記來源**：把來源 md 檔名併入 chunk 的 `title`（例如 `detail.md › 標題`），多 md 時可追溯。

### 決策 3：圖片連結改寫採「進料時改成絕對路徑」
切塊後、寫入前，將 md 內相對圖片連結 `![](images/x.jpg)` → `![](/documents/<projectId>/<docId>/images/x.jpg)`。

- **為何**：答案由多個 chunk 揉成，顯示時前端已分不出每段來自哪個 docId，無法在顯示時正確補 base；故必須在「還知道 docId」的進料階段就改寫。順帶替階段二（載圖餵 LLM）鋪好可定位路徑。
- **改寫範圍**：只改相對的 `images/...` 連結；已是絕對路徑或外部 URL 的不動。

### 決策 4：持久化位置與覆蓋
複製 `images/` 與 md 原檔到 `public/documents/<projectId>/<docId>/`。重複進料：`clear(docId)`（既有）+ 刪除並重建該 docId 的持久化資料夾，再複製新內容。

- **為何**：與既有「同名覆蓋」語意一致；整夾替換避免殘留舊圖。

### 決策 5：docId 不驗證格式；phase 偵測缺則報錯（不猜、不沿用）
docId = 資料夾 basename，**不做格式驗證**，任何名字皆可進料。phase：`--phase` 有給以參數為準（須 C1–C7）；沒給則用既有 `detectPhase`/NPDS 代碼邏輯從資料夾名推 phase；推不出就**報錯要求 `--phase`**，不猜測、不套預設。

- **為何**：保留既有「不強制檔名格式」的彈性（web 上傳對無代碼檔名也照收）——docId 強制格式會把這彈性弄丟，沒必要。
- **phase 為何「缺則報錯」而非套預設**：web 前端有個「選新檔時 phase 下拉不清空、沿用上一次值」的小坑，會讓檔案被默默歸到錯的 phase。CLI 刻意避開此坑——能從名字推就推，推不出就明確要求，絕不沿用或預設到某個 phase。
- **替代方案**：加 `--docid` 覆寫 docId → 目前用不到，先不加，保持介面單純。

### 決策 6：staging 預設 `incoming/`，可被參數覆寫
未給路徑 → 讀 `incoming/`；給了 → 用該路徑（含絕對路徑）。

- **為何**：日常把資料夾 scp 到固定 `incoming/` 最省事；偶爾要從別處進料時用參數，保留彈性。

## Risks / Trade-offs

- **[多 md 的 docId 衝突／來源不清]** → 全歸同一 docId 是刻意設計；以 chunk `title` 記來源 md 檔名保留可追溯性。
- **[連結改寫誤傷非圖片連結]** → 僅針對相對 `images/...` 的 image 語法（`![](…)`）改寫，不動一般連結與絕對/外部 URL。
- **[圖片檔名衝突（多 md 共用 images/）]** → 以「整個資料夾的 images/」為單一來源複製，本就是共用 base，無跨資料夾衝突；同 docId 重進料採整夾替換。
- **[誤把巨量/無關資料夾進料]** → CLI 需明確給資料夾與 `--project`/`--phase`，無自動掃描全盤進料。
- **[與 web 上傳行為漂移]** → 兩條路徑共用抽出的切塊/embedding 單元，降低漂移。

## Migration Plan

1. 合併後新增 CLI；既有 web 上傳完全不變。
2. 使用：PC 跑 MinerU → `scp` 資料夾到 server `incoming/<docId>/` → `node scripts/ingest-folder.js incoming/<docId> --project <id> --phase <Cx>`。
3. 驗收：sqlite 出現該 docId chunks（title 含來源 md）、`public/documents/<projectId>/<docId>/images/` 有圖、chunk 內連結為絕對路徑、`curl /documents/<projectId>/<docId>/images/<file>` 可取得圖。
4. 回滾：刪除腳本即可；已寫入的 chunks/圖片可用既有刪除文件流程移除。
