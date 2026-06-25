## 1. 重構 ingestion 以支援資料夾進料

- [x] 1.1 在 `src/services/ingestion.js` 抽出可重用單元：給定 chunks 陣列做「批次 embed + clear(docId) + add」，供 web 與資料夾兩條路徑共用（不改變 web 上傳行為）
- [x] 1.2 新增 `ingestFolder(folderPath, { projectId, phase, docId })`：讀資料夾內所有 `.md`、各自 `parseAndChunk`，合併成同一 docId 的 chunks
- [x] 1.3 chunk `title` 記錄來源 md 檔名（例如 `detail.md › 標題`），多 md 可追溯
- [x] 1.4 切塊後、寫入前，將 md 內相對圖片連結 `![](images/x.jpg)` 改寫為 `![](/documents/<projectId>/<docId>/images/x.jpg)`；不動絕對/外部連結
- [x] 1.5 docId 取資料夾名

## 2. 圖片與原檔持久化

- [x] 2.1 將資料夾 `images/` 複製到 `public/documents/<projectId>/<docId>/images/`；無 `images/` 時略過不報錯
- [x] 2.2 保留 md 原檔到 `public/documents/<projectId>/<docId>/`
- [x] 2.3 重複進料同一 docId：`clear(docId)` 後，刪除並重建該 docId 的持久化資料夾再複製新內容（整夾替換）

## 3. CLI 腳本

- [x] 3.1 新增 `scripts/ingest-folder.js`：用 `util.parseArgs` 解析 `[folder]`、`--project`、`--phase`
- [x] 3.2 未給 `folder` 時預設讀 `incoming/`；給了則用該路徑（支援絕對路徑）
- [x] 3.3 `--project` 必填。phase 解析：有給 `--phase` 以參數為準（須 C1–C7）；沒給則從資料夾名偵測 NPDS 代碼推 phase；推不出就印錯誤要求 `--phase` 並非零退出（不猜、不套預設）。docId 不做格式驗證
- [x] 3.4 呼叫 `ingestFolder`，完成後印出 docId、來源 md 數、chunk 數、圖片數

## 4. 測試

- [x] 4.1 用 temp 資料夾（多 md + images）測 `ingestFolder`：chunks 全歸同一 docId、title 含來源 md 檔名（注入 mock LLM + temp DB，不碰真實 `data/rag.db`）
- [x] 4.2 測連結改寫：相對 `images/..` → 絕對 `/documents/<proj>/<docId>/images/..`；絕對/外部連結不變
- [x] 4.3 測圖片持久化：images 複製到 `public/documents/<proj>/<docId>/images/`；重進料整夾替換
- [x] 4.4 測無 `images/` 的資料夾仍正常進料
- [x] 4.5 測 phase 解析：資料夾名 `C560` 不給 `--phase` → 推得 C5；名字無代碼且不給 `--phase` → 報錯非零退出；`--phase` 越界 → 報錯
- [x] 4.6 將新測試加入 `package.json` test script 並確認 `npm test` 全綠

## 5. 文件

- [x] 5.1 README 新增「資料夾進料（PC 端 MinerU + CLI）」說明：資料夾約定、`scp` 到 `incoming/`、`node scripts/ingest-folder.js … --project --phase` 用法與驗收
