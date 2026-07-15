## Why

`.docx` 文件經 `markitdown` 轉成 Markdown 時，會把 Word 對未手動寫替代文字的圖片自動產生的 alt-text 原封不動搬進內文，這段 alt-text 固定帶一句免責聲明「AI 產生的內容可能不正確」。含多張圖的 chunk（如接腳表）因此重複出現這句話多次，任何查詢命中這句話裡的詞（例如「AI」）時，BM25 詞頻被這種純噪音灌高，蓋過真正相關但圖少/沒圖的 chunk。實測案例：「EAR-100T 的 AI 運算效能大概多少?」——含5張圖的接腳表 chunk（「AI」出現5次,純噪音）排名蓋過真正含答案的 Features chunk（「AI」只出現1次）。用真實 EAR-100T 資料檢查，全專案 268 個 chunk 有 9 個含此字串，共 18 次。

## What Changes

- 在 `parseAndChunk` 切塊之前，加一道文字清理，把這句固定的免責聲明字串（含前後可能的標點/空白）從 Markdown 內容中剝除，不影響圖片語法本身或其他正文
- 清理邏輯放在切塊管線的共用入口（`ingestFile`/`ingestFolder`/CLI 匯入皆會經過的 `parseAndChunk`），不特別區分來源是否為 markitdown 轉檔——這句免責聲明字串本身極度特定，不太可能出現在正常正文，統一過濾比按副檔名/來源判斷更簡單也更不會漏

## Capabilities

### New Capabilities
- （無——此為既有 `document-ingestion` capability 新增的一條需求，非全新 capability）

### Modified Capabilities
- `document-ingestion`：切塊前新增一條「過濾已知的自動生成樣板文字」需求（ADDED requirement，非修改既有的標題切塊需求）

## Impact

- `src/services/ingestion.js`：`parseAndChunk` 進入點新增樣板文字清理步驟
- `tests/ingestion.test.js`：新增案例驗證樣板文字被剝除、不影響其他正文與圖片語法
- 既有已上傳文件（如 C455 EAR-100T_UM）：清理邏輯只影響新上傳/重新 ingest 的文件，既有 chunks 需要使用者手動重新上傳該文件才會受益（不在此次自動 migrate 既有 DB 內容，範圍見 design.md）
