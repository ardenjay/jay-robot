# Persist converted markdown alongside uploaded originals

## Why

單檔上傳的 .docx/.xlsx/.pdf 走 markitdown/MinerU 轉成 md 後進料，但轉出的 md 用完即丟、只持久化轉檔前的原檔。後果（build server 實際發生）：啟動回填（startup-table-rows-backfill）只吃 md、刻意不重跑轉檔，這批文件永遠落在「跳過（需重新上傳才回填）」，每次啟動重掃＋log；日後 SIDECAR_VERSION 再 bump，它們也永遠追不上。

## What Changes

- **上傳路徑**：轉檔類單檔上傳（mdPath ≠ 原檔）在持久化原檔之外，SHALL 把轉出的 md 一併存為 `public/documents/<project>/<docId>.md`（sibling；原檔仍以 docId 原名保存、供下載）。
- **回填來源規則**（backfillTableRows 單檔佈局）擴充：base 非目錄時，依序認 (1) base 本身是 .md；(2) `base + '.md'` sibling 存在 → 用它。都沒有才跳過。
- 歷史文件（md 未被持久化的那 7 份）不溯及——重新上傳一次即補齊（上傳路徑本來就會抽列＋蓋戳）。

## Impact

- Affected specs: `document-ingestion`
- Affected code: `src/routes/upload.js`（+2 行 copy）、`src/services/ingestion.js`（回填來源規則 +1 分支）
- 風險低：純加法。sibling `.md` 檔名帶原副檔名（如 `UM.docx.md`），與既有任何 docId 無碰撞可能。
