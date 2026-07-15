## Context

`chunks_fts` 是單欄位 FTS5 表（`content_seg`），寫入時把 `doc_id + title + content` 接成一個字串塞進去（`ftsText()`），`_keywordSearch()` 用 `ORDER BY rank`（FTS5 預設 bm25，單欄位無加權）取排名。這個設計原本是為了讓「答案只在文件名裡、內文沒提到」的查詢（如「100T 有幾個 CAN」）也能被關鍵字檢索命中，因為 FTS5 BM25 天生就沒有欄位區分——混在一起是當時最簡單的做法。

副作用（用真實 EAR-100T 資料實測到）：BM25 依「該 chunk 總長度」正規化分數。同一份文件的所有 chunk 都被貼上一樣的 doc_id 文字，但每個 chunk 的 title+content 長度不同——內容越短的 chunk，doc_id 占它總字數的比例越高，查詢命中 doc_id 時分數被灌得越多；內容長、真正相關的 chunk 反而因為 doc_id 只占一小部分而加分有限。

## Goals / Non-Goals

**Goals:**
- 文件名匹配（doc_id 命中）與正文匹配（title+content 命中）分開計分，不互相污染
- 保留「100T 有幾個 CAN」這類「答案只在文件名」的既有能力（不能修好新 bug 卻讓舊案例退化）
- 沿用既有的 `PRAGMA user_version` 版本戳機制觸發重建，不引入新的遷移機制

**Non-Goals:**
- 不處理「同一份文件內、doc_id 之外的其他排名問題」（例如語意上相近但實際不相關的兩個章節撞在一起，那是 rerank 要解的範疇，這次不做）
- 不改變 `hybridSearch` 的向量搜尋部分、RRF 融合邏輯本身
- 不改變 `buildFtsQuery`/`segmentForFts` 的分詞規則

## Decisions

**FTS5 多欄位 + 原生欄位加權，取代單欄位混合字串**：`chunks_fts` 拆成 `content_seg`（title+content）與 `doc_seg`（doc_id）兩個獨立索引欄位，`_keywordSearch` 排序改用 `ORDER BY bm25(chunks_fts, 1.0, 0.3)`——第一個權重對應 `content_seg`、第二個對應 `doc_seg`（權重順序對應 schema 宣告順序，`chunk_id`/`doc_id`/`project_id` 為 `UNINDEXED` 不佔權重位）。查詢端（`buildFtsQuery` 產生的 MATCH 字串）不用改：FTS5 的無欄位限定詞預設會同時比對所有已索引欄位，兩欄拆分對查詢語法透明。

- 考慮過「LLM rerank 候選結果」：更根本，但需要額外模型呼叫、延遲更高、且本機 Ollama 沒有現成的 cross-encoder rerank 模型，範圍明顯更大，另開 change 處理。
- 考慮過「doc_id 只在 vector 搜不到結果時才 fallback 用」：邏輯上更複雜（要維護兩套路徑），且無法用 RRF 現有融合機制優雅表達，pass。
- 考慮過「把 doc_id 匹配當成獨立的第三路 RRF 輸入」：效果類似欄位加權，但要多維護一組 RRF rank 計算，FTS5 原生欄位加權更省事、且是資料庫層級已驗證過的機制。

**權重值 0.3 是起手值，非最終定案**：需要用 `evals/answer-cases.local.json` 的 33 題（尤其「100T有幾個CAN」與這次新增的 2 題失敗案例）反覆調整驗證——太高等於沒修，太低可能讓「100T有幾個CAN」退化。tasks.md 會把「調參到兩者都過」列為明確任務，而非憑感覺選一個數字就結案。

**FTS_VERSION bump**：沿用 v3→v4 的既有機制（見 `sqlite.js` 的版本戳註解），bump 到 v5，啟動時 `user_version` 落後就整表重建，既有資料自動受益，不需要手動重灌文件或跑額外 migration script。

## Risks / Trade-offs

- **[Risk] 調完權重讓「100T有幾個CAN」退化（doc_seg 權重被壓太低）** → Mitigation：tasks.md 明確要求兩類案例（doc-name-only 命中 vs 同文件內容區分）都要跑過 eval 才算完成，不能只驗其中一種。
- **[Risk] 0.3 這個值是針對目前 33 題資料量調的，之後資料量變大、chunk 長度分布變了可能又需要重調** → Mitigation：接受這是經驗值而非理論值，之後真的再出現類似案例，重新用 eval 集調參即可，不追求一次性的理論最優解（YAGNI）。
- **[Risk] 兩欄位拆分後，`add`/`_rebuildFts`/`renameDocument` 三處都要同步改，容易漏改一處造成兩表不同步** → Mitigation：既有的「chunks 與 FTS 筆數不符即重建」保護機制還在，就算漏改也會在下次啟動時被 backfill 檢查抓到；另外 tasks.md 會列出三處逐一確認。
- **[已發生的風險] doc_seg 加權是全域的，調高權重「救」某些原本靠 doc_id 意外撈到的案例，可能同時弄丟其他真正靠 doc_id 才撈得到的案例**（實測：把權重從 0.3 調到 0.6，並沒有救回「出貨包裝清單」那題，反而讓「電源輸入範圍」退回錯誤答案）→ Mitigation：拿真實 33 題全部跑過，取「整體最好」而非「單題最好」的值；「出貨包裝清單」那題的失敗根因其實是 keyword 與內容語言不匹配（中文查詢 vs 英文表格內容），不是 doc_id 加權能解的問題，改記為獨立的 knownFail，不在本次 change 範圍內硬解。
- **[已發現的額外 bug] FTS5 虛表不支援 `ALTER TABLE` 加欄位，`CREATE VIRTUAL TABLE IF NOT EXISTS` 在既有 DB 上會沿用舊表結構**——版本落後但只靠 IF NOT EXISTS 沒有先砍表，會導致新欄位寫入直接報錯、進而讓整個 FTS 被錯誤地判定「不可用」而退回純向量模式（且不會有明顯錯誤訊息，只有一行 warning）。這是這次調參驗證時在真實 DB 上才發現的，unit test 因為都用全新建立的 DB，測不到這個遷移路徑；已修正為版本落後時先 `DROP TABLE IF EXISTS` 再 `CREATE`，並補了對應的回歸測試。

## Migration Plan

1. schema 加 `doc_seg` 欄位，`ftsText()`/寫入邏輯拆成兩欄
2. `_keywordSearch` 排序公式改用欄位加權
3. `FTS_VERSION` bump，啟動觸發整表重建（無需手動介入）
4. 用 `node scripts/eval-answers.js --case "100T有幾個"` 與新兩題失敗案例反覆調參，直到全部通過
5. 跑完整 `npm test` 與 `node scripts/eval-answers.js` 33 題確認沒有引入新的退化

Rollback：`FTS_VERSION` 若要退回，改回舊版本號並還原 `ftsText`/`_keywordSearch` 即可，資料本身（`chunks` 表）完全不受影響，FTS 只是衍生索引。

## Open Questions

- 0.3 這個權重值是否要做成可透過環境變數調整（例如 `FTS_DOCID_WEIGHT`），還是先寫死、之後真的需要再抽出來？傾向先寫死（YAGNI），等真的遇到需要調的場景再抽。
