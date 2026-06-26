## Context

`ingest-prebuilt-folder` 後，folder 進料的文件在 `public/documents/<proj>/<docId>/` 下有 `*.md` + `images/`，且 chunk 內圖片連結已是絕對路徑。web 上傳的文件則在 `public/documents/<proj>/<docId>`（docId = 檔名，如 `C560.pdf`）只有**原始檔**、無持久化 md。

答案泡泡已用 marked 渲染（[index.html](../../../public/index.html)）；來源目前是 `<a target="_blank">` 連到 `/documents/<proj>/<docId>`（[retrieval.js](../../../src/services/retrieval.js) 產生 `{docId,url}`）。本變更讓圖能在 UI 顯示，分「答案內嵌圖」與「來源檢視器」兩塊。

## Goals / Non-Goals

**Goals:** 答案含圖時能顯示且不溢版；來源可點開看文件含圖；兼容兩條進料路徑（folder=md+圖、web=原始檔）。

**Non-Goals:** 不把圖**餵給 LLM**做多模態判讀（那是另一階段）；不改進料邏輯；不對 web 上傳的 PDF 做線上轉檔渲染（維持開原檔）。

## Decisions

### 決策 1：答案內嵌圖 = marked 既有渲染 + img 樣式 + prompt 引導
marked 本就會把 `![]()` 渲成 `<img>`，連結已是絕對路徑即可正確載入。只需：(a) CSS 限制 `.message img { max-width:100%; height:auto; display:block; }`；(b) `buildSystemInstruction` 加一段：相關時可帶出檢索內容中**既有**的圖片連結，禁止杜撰。

- **為何**：最小改動即達成；圖是否出現由「檢索內容是否有圖 + 是否相關」自然決定，不需新管線。
- **安全**：明確禁止杜撰路徑，避免 LLM 生出壞連結。

### 決策 2：來源檢視器靠一個唯讀端點分流
新增 `GET /api/projects/:projectId/documents/:docId/view`：
- 解析 `dir = public/documents/<proj>/<docId>`。
- 若 `dir` 是**目錄**（folder 進料）：讀其中所有 `.md`、合併，回傳 `{ type:'markdown', markdown }`（圖已絕對路徑）。
- 否則（是檔案，如 PDF）：回傳 `{ type:'file', url:'/documents/<proj>/<docId>' }`。
- 找不到：404。

前端點來源 → 打此端點 → `markdown` 則開 modal 用 marked 渲染；`file` 則 `window.open(url)`（現行行為）。

- **為何**：兩條進料路徑持久化的東西不同，分流是必要的；用後端判斷「目錄 vs 檔案」最可靠（前端無從得知）。
- **唯讀**：GET 路由，不掛 `blockWhenReadOnly`，唯讀站台照樣可看。
- **替代方案**：前端直接猜 md 路徑 → 不知道 md 檔名、也分不出目錄/檔案，不可行。

### 決策 3：modal 用既有 marked，沿用答案的 img 樣式
檢視器內容與答案共用同一套圖片 CSS，行為一致。

## Risks / Trade-offs

- **[LLM 過度塞圖或不塞圖]** → prompt 用「相關時可帶出」的弱引導，不強制；先觀察實際行為，必要時再調 prompt（屬 rag-query，可再開小 change）。
- **[合併多 md 的檢視順序]** → 依檔名排序合併，與進料時一致；可接受。
- **[docId 含特殊字元的 URL]** → 端點路徑用既有 `encodeURIComponent(docId)` 慣例；建議 docId 維持 URL-safe（沿用先前約定）。
- **[web 上傳的 PDF 無法內嵌渲染]** → 刻意 fallback 開原檔，符合現況，不在本變更範圍硬做。

## Migration Plan

1. 純加值：新端點 + 前端檢視器 + img 樣式 + prompt 一句；無資料遷移。
2. 既有「來源開原檔」對 web 文件仍成立（fallback 分支）。
3. 回滾：移除端點與前端 modal、還原 prompt 那段即可。
