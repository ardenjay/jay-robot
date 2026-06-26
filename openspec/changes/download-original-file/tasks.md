## 1. 進料：必含並持久化原始檔

- [x] 1.1 `ingestFolder`/CLI 進料前驗證：資料夾頂層 `.pdf` 數 == 1，否則報錯拒收（0 → 需放 PDF；>1 → 需恰好一個），非零退出
- [x] 1.2 持久化改為「整個資料夾原樣複製」到 `public/documents/<proj>/<docId>/`（含 `.pdf`；md/images 行為不變）

## 2. 下載端點

- [x] 2.1 抽純函式 `resolveDownload(docsRoot, projectId, docId)` → 回傳要下載的實體檔路徑與檔名（檔案型→該檔；目錄型→目錄內的 `.pdf`；找不到→null）；含路徑穿越防護
- [x] 2.2 新增 `GET /api/projects/:id/documents/:docId/download`：用 `resolveDownload`，找到 → `res.download(path, filename)`（Content-Disposition attachment）；null → 404
- [x] 2.3 確認端點為 GET、未掛 `blockWhenReadOnly`（唯讀可用）

## 3. 前端 doc tree 下載按鈕

- [x] 3.1 doc tree **點擊文件名稱**觸發 `download` 端點（名稱加 cursor/hover 提示）；取代獨立 ⬇ 按鈕
- [x] 3.2 名稱下載在唯讀模式「仍可用」（render 於 `READ_ONLY` 隱藏寫入鈕之前）
- [ ] 3.3 （可選，未做）下載失敗（404 無原始檔）給簡單提示——目前直接導向端點，缺 PDF 時瀏覽器顯示原始 404；待新進料一律含 PDF 後此情境罕見，留待需要時再加

## 4. 測試

- [x] 4.1 測 `resolveDownload`：檔案型 docId → 回該檔；目錄型（temp docsRoot 放 pdf+md+images）→ 回該 pdf；目錄無 `.pdf` → null；路徑穿越 → null（不碰真實 `data/rag.db`/`public`）
- [x] 4.2 測進料驗證：資料夾恰好一個 `.pdf` → 通過；缺 → 拒收；多個 → 拒收
- [x] 4.3 將新測試加入 `package.json` test script 並確認 `npm test` 全綠

## 5. 文件與驗收

- [x] 5.1 README 更新 folder 進料約定（資料夾需含一個原始檔）與下載說明
- [x] 5.2 驗收（瀏覽器，留給使用者）：tree 點 ⬇ 下載 web 單檔、下載 folder 原始 PDF；唯讀模式 ⬇ 仍顯示且可下載
