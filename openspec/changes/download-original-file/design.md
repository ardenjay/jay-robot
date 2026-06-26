## Context

文件樹（[index.html](../../../public/index.html) `loadDocTree`）每個 file 目前有搬移 ⇄、刪除 🗑 按鈕（唯讀模式隱藏）。文件持久化在 `public/documents/<proj>/<docId>/`，但兩條進料路徑形態不同：web 上傳 = 單一原始檔（docId 即檔名）；folder 進料 = 目錄（`*.md` + `images/`，目前**不含**原始檔）。`download-original-file` 要讓使用者下載「原始檔」。

剛完成的 `display-doc-images` 已有 `resolveDocView`（目錄 vs 檔案分流）與 `GET .../view`；下載沿用同樣的分流思路。

## Goals / Non-Goals

**Goals:** 文件樹一鍵下載原始檔；web 與 folder 統一成「給原始檔」；唯讀站台可下載。

**Non-Goals:** 不打包 md+images（原始檔才是要下載的）；不改 RAG / 檢視器；不為缺原始檔的舊資料做轉檔或補救（重灌即可）。

## Decisions

### 決策 1：folder 進料「必含恰好一個 `.pdf`」
CLI 進料前掃描資料夾頂層的 `.pdf` 數：0 → 報錯「需放一個 PDF」；>1 → 報錯「PDF 需恰好一個」；==1 → 通過。

- **為何只認 `.pdf`**：folder 進料專為「PC 上以 mineru 處理 PDF」設計——只有 PDF 需要這條特殊路徑；其他格式（docx/pptx/xlsx/html…）走 web 上傳 + markitdown，那條本就直接持久化原始檔、可直接下載。所以 folder 的原始檔必然是 PDF，連白名單概念都省了。
- **副帶好處**：mineru 夾帶的 `_content_list.json`、`_middle.json` 等側生檔不是 `.pdf`，天然不被誤判。
- **持久化**：把整個資料夾原樣複製（含 `.pdf`）到 `public/documents/<proj>/<docId>/`，最簡單且 PDF 自然included。

### 決策 2：單一 download 端點，沿用目錄/檔案分流
`GET /api/projects/:id/documents/:docId/download`：
- 解析 `target = public/documents/<proj>/<docId>`（含路徑穿越防護，比照 `resolveDocView`）。
- 是檔案 → 該檔即原始檔。
- 是目錄 → 找目錄內的 `.pdf`（恰好一個，進料已保證）。
- 找到 → 以 `res.download(path, filename)`（Express 內建，設好 `Content-Disposition`）回傳；找不到 → 404。

- **為何用一個端點**：前端按鈕邏輯統一（一律打 download 端點），目錄/檔案差異藏在 server。
- **抽純函式**：把「給定 docsRoot/proj/docId 解析出要下載的實體檔路徑」抽成純函式（類似 `resolveDocView`），便於單元測試而不需起 server / 開 DB。

### 決策 3：點檔名即下載，唯讀模式也可用
doc tree 的**文件名稱本身可點擊**觸發下載（比獨立 ⬇ 按鈕直覺），名稱加 cursor/hover 提示。名稱在 `READ_ONLY` 隱藏寫入鈕之前就 render，**不**受唯讀隱藏。後端 download 端點亦未掛 `blockWhenReadOnly`。

- **為何點名稱而非按鈕**：使用者回饋獨立 ⬇ 不直覺；直接點檔名最符合直覺。
- **為何唯讀可用**：下載是讀取，唯讀站台訪客本來就該能取文件。與刪除/搬移（寫入，唯讀隱藏）明確區分。

## Risks / Trade-offs

- **[舊資料無原始檔]** → 現有 folder 文件（如 C204）下載回 404；文件化「重灌補 PDF」即可。前端可在 404 時提示「無原始檔」。
- **[未來想下載非 PDF 的 folder 原始檔]** → 目前 folder 一律 PDF；若日後有需求再放寬（小改）。
- **[路徑穿越]** → 沿用 `resolveDocView` 的 base 內檢查，download 端點同樣防護。
- **[目錄內意外有多個白名單檔]** → 進料時已擋（必恰好一個）；端點端再取第一個並可記錄警告。

## Migration Plan

1. 合併後，新 folder 進料一律需含原始檔；web 上傳路徑不變。
2. 既有缺原始檔的 folder 文件：重灌一次（資料夾補上 PDF）即可下載。
3. 回滾：移除 download 端點與 ⬇ 按鈕、放寬進料驗證即可；無資料遷移。
