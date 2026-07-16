## 1. Schema 與 adapter

- [x] 1.1 sqlite adapter：`DB_VERSION=6` + 遷移階梯（step ≤5 收編既有 FTS 重建、step 6 建 table_rows/doc_ingest_meta），逐步蓋 user_version；「筆數不符重建 FTS」防護保留在階梯外
- [x] 1.2 `doc_ingest_meta` 讀寫：`getDocSidecarVersion`/`stampDocSidecarVersion`；`clearTableRowsOnly(docId, projectId)`（不動 chunks 的窄版清理）
- [x] 1.3 `renameDocument` 同步改 meta；`clear` 同步刪 meta

## 2. Ingestion 蓋戳 + 回填服務

- [x] 2.1 `SIDECAR_VERSION = 1` 常數；`embedAndStore` 完成後蓋戳（含 0 列情況）
- [x] 2.2 `backfillTableRows(store, adapter)`：掃版本落後文件 → 找 public/documents 的 .md（資料夾/單檔兩種佈局）→ extractTableRows → embed → 清舊列 → 寫入 → 逐文件蓋戳；非 .md 跳過+log；embed 失敗 abort 本輪+log，錯誤不外拋
- [x] 2.3 app 啟動點 fire-and-forget 呼叫（try/catch 包死）

## 3. 測試與驗證

- [x] 3.1 單測：階梯（v5 DB 只跑 step6、全新 DB 跑全程、已達版即 no-op、步驟冪等）、進料蓋戳（含 0 列）、回填冪等（第二次跑 no-op）、非 .md 跳過不蓋戳、embed 失敗不蓋戳不拋錯、回填後 chunks/FTS 位元不變
- [x] 3.2 本機實測：把 doc_ingest_meta 清空模擬正式機舊 DB → 重啟 → 背景回填 603 列、蓋戳齊全；再重啟 → no-op
- [x] 3.3 `--smoke` eval 全過；commit（敏感檔檢查）
