## Context

`parseAndChunk(markdownText, filename)`（`src/services/ingestion.js:13`）是切塊管線的共用入口，`ingestFile`（單檔上傳）、`ingestFolder`（資料夾匯入）都經過它。`.docx` 等格式經 `markitdown` 轉檔（`src/routes/upload.js` 的 `convertWithMarkitdown`），若原始 docx 圖片沒有作者手動寫的替代文字，Word 會自動產生一段包含固定免責聲明「AI 產生的內容可能不正確」的 alt-text，markitdown 忠實地把它保留在輸出的 `![alt文字](圖片)` 語法裡。

用真實資料驗證：`C455 EAR-100T_UM 20260515.docx` 這份文件受影響，全專案（EAR-100T 專案）268 個 chunk 裡有 9 個含此字串，共 18 次出現；PDF（走 MinerU）與手寫 `.md` 文件皆無此字串，證實是 markitdown 轉檔特有的問題。

## Goals / Non-Goals

**Goals:**
- 新上傳/重新 ingest 的文件，這句免責聲明不再進入 chunk 內容、不參與 FTS 索引與 embedding
- 只移除這句固定字串，不影響圖片語法本身、alt-text 裡其他描述文字、或任何其他正文

**Non-Goals:**
- 不處理既有已上傳文件（如目前的 C455 EAR-100T_UM）——這些文件的 chunks 已經 ingest 進 DB，這次不寫自動 migrate/re-ingest script，使用者需要的話自行重新上傳該文件即可套用新邏輯
- 不嘗試移除或改寫圖片 alt-text 裡的其他描述文字（如「一張含有 文字, 數字, 字型的圖片」這種通用但非本次問題根源的描述），只精準移除已確認造成問題的免責聲明子句
- 不特別偵測「這份文件是否為 markitdown 轉檔」——直接對所有進入 `parseAndChunk` 的文本套用同一清理規則（見 Decisions）

## Decisions

**清理邏輯放在 `parseAndChunk` 的最前面，而非上傳路由層**：`ingestFile`、`ingestFolder`、CLI 匯入（`scripts/` 若有直接呼叫）都收斂到這個函式，放這裡一次處理，不用在 `upload.js` 的 markitdown 分支和資料夾匯入路徑各自處理一次，也不會漏掉未來新增的上傳入口。

**不區分文件來源，統一過濾**：曾考慮「只在 markitdown 轉檔的文件套用」，但這句免責聲明字串極度特定（18 字的完整中文句子），正常正文或 PDF/MinerU 輸出幾乎不可能巧合出現這句話，統一套用邏輯更簡單、少一個「這份文件是不是 markitdown 來的」的判斷分支，也不用在 `ingestFile` 簽章多傳一個來源標記。

**只移除免責聲明子句，不移除整段 alt-text**：alt-text 裡「一張含有 XX 的圖片」這類描述雖然通用、資訊量低，但不是已驗證的問題來源；只移除確認造成關鍵字污染的那句話，維持改動最小化，不做沒有證據支持的額外清理。

**正規表示式**：`/\s*AI\s+產生的內容可能不正確[。.]?/g` —— 容許「AI」前面的空白（清掉污染後留下的雙空格）、「AI」與「產生」間的空白（觀察到的實際格式）、結尾可有可無的全形或半形句點。

## Risks / Trade-offs

- **[Risk] Word 或 markitdown 版本更新後，免責聲明字串措辭可能改變（如翻譯成別的語言、標點不同）** → Mitigation：這是已知會發生的情況，屆時再依新格式擴充規則；不預先猜測未見過的變體（YAGNI）。
- **[Risk] 既有已上傳文件不受益，使用者可能誤以為修完後舊文件也乾淨了** → Mitigation：proposal.md 明確排除既有文件的自動 migrate，回報時清楚告知使用者「這份文件目前受影響，需要重新上傳」。
- **[Risk] 正規表示式意外吃掉合法內文**（若某份文件剛好逐字寫到這句話當作真實敘述） → Mitigation：機率極低（這是 Word 系統生成的制式句子，不是常見中文表達），且範圍就是移除這句話本身，即使誤中影響也僅止於這一句，不會波及其他內容。

## Migration Plan

1. `parseAndChunk` 加清理步驟
2. 補單元測試：alt-text 含免責聲明 → 清理後不出現該字串，且圖片語法與其他描述文字保留
3. 用真實 EAR-100T 資料重新上傳 C455 EAR-100T_UM，確認新 ingest 的 chunk 不再含此字串，且原本失敗的 eval 案例（「EAR-100T 的 AI 運算效能大概多少?」）轉綠
4. `npm test` 全數通過

沒有 rollback 顧慮——純文字清理，不動資料庫 schema，效果只在下次 ingest 時生效。
