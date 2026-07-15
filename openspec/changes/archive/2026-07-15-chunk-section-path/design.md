## Context

切塊在 `parseAndChunk`(marked lexer 逐 token,heading 即切點,`currentTitle` 只存最後一個 heading 文字);embedding 輸入為 `c.text`(`embedAndStore`);FTS5 `chunks_fts.content_seg` 只索引 `segmentForFts(content)`,初始化時以「chunks 與 fts 筆數不符」觸發整表重建。folder 進料把來源 md 檔名前綴進 title(`mdName › 標題`)。

## Goals / Non-Goals

**Goals:**
- chunk title = 完整章節路徑,LLM 與檢索都獲得脈絡。
- 標題參與向量與關鍵字比對。
- 舊資料在 FTS 面向零成本受益(重建時把既有 title 一併索引)。

**Non-Goals:**
- 不改 chunk 切割邊界與 1500 字上限。
- 不改 hybrid RRF 融合邏輯與 TOP_K。
- 不自動重灌舊文件(embedding 含 title 需使用者重灌才生效)。

## Decisions

1. **heading 堆疊依 `token.depth`**:遇 depth=n 的標題,截斷堆疊至 n-1 層再壓入;title = 堆疊 join(' › ')。跳層(H1 直接到 H3)按實際 depth 放,不補洞。無任何標題前維持檔名(現行為)。
2. **檢索文本 = `title\n text`,但儲存的 `content` 欄位維持純內文**:embedding 與 FTS 都用組合文本;`chunks.content` 不混入 title,避免 LLM 看到重複標題、來源檢視/答案引用格式不變。
3. **FTS 重建觸發改用 `PRAGMA user_version` 版本戳**:現行「筆數不符才重建」偵測不到「索引內容定義變了」;bump user_version(0→2),啟動時低於目標版本即 `_rebuildFts()` 並寫回。筆數不符檢查保留。
4. **舊 title 照樣索引**:重建讀 `title, content` 組合,不分新舊格式——舊資料的平面 title(如「I/O 規格」)進 FTS 就已能救「標題詞命中」場景,重灌只是再補上向量面與完整路徑。

## Risks / Trade-offs

- [title 進 embedding 改變向量分佈,新舊 chunk 混用時相似度不完全可比] → 影響輕微(title 短);重灌常用文件即收斂。
- [長路徑吃掉 chunk 顯示寬度] → title 只在工具結果與來源檢視顯示,可接受。
- [user_version 被其他用途佔用] → 目前專案未使用 user_version,首用即定義所有權。
