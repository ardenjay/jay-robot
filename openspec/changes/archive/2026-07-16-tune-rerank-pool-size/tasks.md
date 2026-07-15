## 1. 調整常數

- [x] 1.1 `retrieval.js` 的 `RERANK_POOL_K` 由 15 改為 25，並更新註解說明理由（向量 #13 被 RRF 拖到融合後 #19–22、需池夠大才涵蓋）
- [x] 1.2 更新 `tests/retrieval-prompt.test.js` 兩處斷言（hybridSearch / search 呼叫的候選池大小 15 → 25）；`npm test` 全綠

## 2. 真實資料驗證

- [x] 2.1 實測「EAR-100T 主板的電源輸入接頭是哪個 CN 編號?」在 pool=15/20/25/30 的候選涵蓋與 rerank 結果，確認 25 能穩定把 CN1 chunk 撈進 top-5
- [x] 2.2 跑完整 33 題確認無新退化；「CN 編號」轉綠後移除該案例 knownFail 標記
