# [REJECTED 2026-07-16] Split large spec/pin tables into per-row chunks at ingestion

> **否決**:完整 461 題回歸證實淨負——(1) 750 個碎列 chunk 與正文同池無界競爭,灌爆候選池,5 題原本會過的題(音訊介面/GMSL 3.3V/Time Sync GPS/Thor 載板 pin 數/GMSL2 serializer)真退化;(2) dilution 目標題在全池競爭下仍 fail(單獨跑 6 題低競爭的轉綠是假象)。程式碼在 `git stash`(rejected: split-large-tables-into-rows),DB 已還原。後繼設計:sidecar table_rows 獨立索引 + 有界注入(不與正文同池),見 change `sidecar-table-row-index`。

## Why

實測 recurring bug（見 spec-table-recall-dilution memory）：密集規格表被整張塞進一個 chunk，單一屬性查詢召回被稀釋、撈不到。實測失敗：MTi §6.2「重量 8.9 gram」「MTi-680G IP68」「高度」、pin 表「pin2」、Thor QSFP28 pin1——target chunk 在候選池外，模型答「未提及」或抓錯值。

三數診斷確認是**召回**（target 池外），非 rerank/生成。前面試過的 rerank 修法（多視窗）只治「chunk 在池內但答案不可見」，治不了「根本沒進池」。

原型驗證（把 §6.2 HTML 表按列切、各自 embedding）：
- 「重量」查詢 對 整表 cos 0.578 → 對「Weight 8.9 gram」單列 cos **0.747**
- 「高度」查詢 0.610 → 單列 **0.755**

相似度大幅提升，足以把 target 從池外拉進池頂。

## What Changes

- `parseAndChunk`：遇到「列數較多的表格」(HTML `<table>` 或 markdown `| |`,body 列數 > `MIN_TABLE_ROWS`)時,SHALL 把表格拆成**每列一個 chunk**,每列 chunk = 章節標題路徑 + 表頭列(欄名脈絡) + 該列各儲存格。小表(列數 ≤ 門檻)維持整塊不變。
- 僅影響**新 ingestion**;既有入庫 chunk 不變。需 reindex 受影響文件(有原始 md 者:MTi、Thor 等)才生效。
- 純結構化拆分,不改 embedding/rerank/檢索邏輯。

## Impact

- Affected specs: `document-ingestion`
- Affected code: `src/services/ingestion.js`（`parseAndChunk` 及新增 table 拆列 helper）
- **高風險**:reindex 會讓受影響文件所有 chunk 重排,全部相關題的檢索改變。SHALL 以完整回歸對比 before/after,確認 dilution 題轉綠且無淨退化,才收斂;rag.db 有備份可回退。
