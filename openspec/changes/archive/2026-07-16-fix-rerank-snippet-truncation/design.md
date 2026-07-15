# Design: query-aware rerank snippet

## Context

`rerankChunks` 目前對每個候選取 `text.slice(0, 400)` 當片段餵給重排器。chunker 上限 1500 字，規格表類 chunk 常整表塞滿，關鍵答案（TPM 2.0、連接器編號等）可能在 400 字之後 → 重排器看不到 → 誤踢。

## Decisions

### query-aware snippet：head + 命中視窗

```
snippet(query, text):
  若 text 長度 <= HEAD → 回整段
  head = text[0:HEAD]
  terms = 把 query 依空白/標點切成 >=2 字的詞
  hit = 這些 terms 在 text 中最早出現的位置
  若 hit < 0 或 hit < HEAD → 回 head（命中在前段或沒命中）
  否則 → 回 head + " … " + text[hit-A : hit+B]（附後段命中視窗）
```

- `HEAD` 取 ~300、視窗 A≈60 / B≈180，片段上限約 540 字（比原本 400 略增，僅長 chunk 後段命中時才增）。
- terms 用空白/標點切詞即可涵蓋主要失效類型：英文規格詞（TPM、J69…）埋在中英混排大表裡；純中文查詢多半 head 或融合已能處理。
- 只附「最早一個」命中視窗，控制長度；多關鍵字通常聚在同段。

### 為何不直接加大 SNIPPET_LEN 或整段灌入

25 個候選整段（各 1500）灌進 rerank prompt ≈ 大量 token，num_ctx 16384 會吃緊、也稀釋重排判斷。query-aware 只在需要時附一小段，兼顧「答案可見」與「prompt 精簡」。

## Risks / Trade-offs

- 切詞用空白/標點：純無空白中文查詢可能切不出有效詞 → 退回 head，行為等同現況（不會更差）。
- 視窗可能切在字中間：無妨，重排器只需看到關鍵字附近語意即可。
- 片段略增：僅長 chunk 後段命中時，且只加一段視窗，整體可控。

## Migration

無資料/schema 遷移。
