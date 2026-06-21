## Context

上傳路由 (`src/routes/upload.js`) 目前對副檔名分流處理：`.md` / `.markdown` 直接 ingest、`.pdf` 經 MinerU 轉換後 ingest，其餘一律 400。MinerU 專長於 PDF 的版面還原與 OCR，但無法處理 Word、Excel、PowerPoint、HTML 等格式。markitdown（Microsoft 開源）可將這些常見文件格式轉為 Markdown，補上這塊空缺。

markitdown 文件宣告支援的格式包含：PDF、PowerPoint、Word、Excel、Images、Audio、HTML、CSV/JSON/XML、ZIP、EPub、YouTube URL 等。本變更只採用其中對 NPDS 文件 RAG 有實際價值且純文字導向的格式。

## Goals / Non-Goals

**Goals:**
- 上傳路由接受 markitdown 支援的文件格式（`.docx`、`.pptx`、`.xlsx`、`.xls`、`.html`、`.htm`、`.csv`、`.json`、`.xml`、`.epub`），自動轉換後走現有 ingest 流程
- 沿用既有 SSE 進度串流與錯誤回報機制
- 與 MinerU（PDF）共存，副檔名決定使用哪個轉換器

**Non-Goals:**
- 不改用 markitdown 處理 PDF（PDF 維持 MinerU，版面/OCR 品質較佳）
- 不支援圖片 OCR（`.png`/`.jpg`）與音訊轉錄（`.mp3`/`.wav`）—— 需額外模型或 API 金鑰，留待未來
- 不支援 ZIP 解包、YouTube URL 抓取
- 不快取轉換結果

## Decisions

### 1. 副檔名分流：markitdown 與 MinerU 共存

**決定**：在 upload route 以副檔名決定轉換路徑——`.pdf` → MinerU、markitdown 支援清單 → markitdown、`.md`/`.markdown` → 直接 ingest、其餘 → 400。

**理由**：兩個工具各有所長，PDF 已由 MinerU 處理良好，無須變動。以副檔名白名單分流最直接，不需偵測檔案內容。

---

### 2. 使用獨立 conda 環境 `markitdown`，以 `conda run -n` 呼叫

**決定**：建立獨立 conda 環境 `markitdown`（`pip install 'markitdown[all]'`），shell 指令為 `conda run -n markitdown markitdown "<檔案>" -o "<輸出.md>"`。

**理由**：沿用 MinerU 既有模式（`conda run -n mineru ...`），保持一致。獨立環境避免 markitdown 與 mineru（torch 等）的相依衝突。`conda run -n <env>` 在 Node `child_process` 的非互動式 shell 中可正確生效，無須 activate。

---

### 3. markitdown 以 `-o` 直接輸出單一 .md，不需 glob

**決定**：以 `fs.mkdtempSync()` 建臨時目錄，markitdown 用 `-o "<tmpDir>/out.md"` 輸出單一檔案，ingest 後刪除臨時目錄與原始上傳檔。

**理由**：markitdown 輸出單一 Markdown 檔（不像 MinerU 產生目錄結構），路徑可預測，無須遞迴搜尋。

---

### 4. 抽出共用的「轉換器 → ingest」流程

**決定**：upload route 內把「副檔名 → 選擇轉換函式 → 取得 .md 路徑 → ingest → 清理」整理成清楚分支；`convertWithMarkitdown(filePath, onLog)` 與既有 `convertPdfToMarkdown` 並列。

**理由**：兩個轉換器介面對齊（回傳 `.md` 路徑），讓 route 主流程維持單一 ingest 呼叫點，減少重複。

---

### 5. 前端 accept 與提示同步更新

**決定**：上傳表單的 `<input accept>` 與說明文字加入新副檔名。

**理由**：避免使用者選到後端會拒絕的檔案，與後端白名單保持一致。

## Risks / Trade-offs

- **markitdown 未安裝** → 若伺服器沒有 `markitdown` conda 環境，呼叫會失敗並回傳 500。需在部署文件說明環境需求（與 MinerU 相同情境）。
- **轉換品質參差** → Excel/HTML 等格式轉 Markdown 後結構可能與原文有落差，連帶影響 RAG 回答品質。屬 markitdown 本身限制，acceptable。
- **格式清單取捨** → 暫不納入圖片/音訊，若日後有需求再擴充白名單與環境相依（`markitdown[all]` 已含相關 extra，主要差在模型/金鑰）。
- **副檔名白名單需兩端同步** → 後端與前端各維護一份清單，未來新增格式須同時更新。可考慮由後端提供清單給前端，但目前格式少，暫以常數維護。
