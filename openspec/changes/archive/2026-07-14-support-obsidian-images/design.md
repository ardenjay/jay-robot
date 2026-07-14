## Context

連結改寫集中在 [imageLinks.js](../../../src/services/imageLinks.js) 的 `rewriteImageLinks(markdown, projectId, docId)`——純字串函式，只認 `![](images/...)`，兩個呼叫端：進料（[ingestion.js](../../../src/services/ingestion.js) `chunkFolderMarkdown`）與來源檢視器（[docView.js](../../../src/services/docView.js) `resolveDocView`）。

Obsidian 文件的差異：圖語法 `![[name.jpg]]`（可帶 `|alt`）；圖在「筆記同名附件子資料夾」（任意名稱、含空格），不在 `images/`。要解析 wiki-link 必須知道「檔名 → 資料夾內實際相對路徑」，這是檔案系統資訊，純字串函式做不到。

## Goals / Non-Goals

**Goals:** wiki-link（含 `|alt`）改寫為標準絕對路徑；圖檔可在任意子資料夾；找不到保留原樣；進料與檢視器兩處同時生效；標準語法行為不變。

**Non-Goals:** 不支援 Obsidian 其他語法（`[[內部連結]]`、embed 非圖片檔）；不改持久化（整夾複製已涵蓋子資料夾）；不自動重灌舊資料。

## Decisions

### 決策 1：以「檔案索引」參數擴充 rewriteImageLinks，維持可測性
`rewriteImageLinks(markdown, projectId, docId, fileIndex?)`：`fileIndex` 為 `Map<檔名, 相對子路徑>`（如 `"fig.jpg" → "Thor Carrier Board/fig.jpg"`）。另提供 `buildFileIndex(folderPath)`：遞迴掃描資料夾建索引（略過 `.md`）。wiki-link 規則：`![[name]]` / `![[name|alt]]` → 查 `fileIndex`，命中 → `![](<base>/<編碼後子路徑>)`；未命中 → 原樣保留。未傳 `fileIndex` 時 wiki-link 一律保留（純字串呼叫不受影響）。

- **為何**：改寫需要 fs 資訊，但把 fs 掃描與字串改寫分離（`buildFileIndex` + 純改寫），單元測試可直接餵假索引，不需真檔案。
- **替代方案**：函式內直接收 folderPath 自己掃 → 每次呼叫重掃、難測；由呼叫端建索引一次傳入較乾淨。

### 決策 2：兩個呼叫端各自建索引
- 進料：`chunkFolderMarkdown` 對**來源資料夾**建索引（一次，供所有 md 共用）。
- 檢視器：`resolveDocView` 對**持久化資料夾**建索引後改寫——因此舊資料（chunk 內仍是 wiki-link）在檢視器**不重灌也能**看到圖；chunks 要變標準連結才需重灌。

### 決策 3：URL 編碼逐段處理
子路徑以 `/` 分段、各段 `encodeURIComponent` 再組回，空格資料夾名（`Thor Carrier Board`）與檔名正確編碼且保留路徑結構。

### 決策 4：同名檔取第一個命中
索引建立時若不同子資料夾有同名檔，取遞迴掃描的第一個（穩定排序）。Obsidian 附件同名情況罕見，不做消歧。

## Risks / Trade-offs

- **[同名檔取錯]** → 罕見；索引以排序後的掃描順序決定，行為可預期。
- **[wiki-link 指向非圖片檔]** → 一樣改寫成 `![]()`；瀏覽器對非圖片顯示破圖，屬來源文件自身問題，不特別攔。
- **[大資料夾掃描成本]** → 每次進料/檢視一次遞迴掃描，檔案數量級小（數十～數百），可忽略。

## Migration Plan

1. 合併後新進料的 Obsidian 文件直接可用。
2. 舊資料（如 C208）：檢視器立即可顯示圖（讀檔時改寫）；chunks 內 wiki-link 需重灌該資料夾才會變成標準連結（供答案內嵌圖使用）。
3. 回滾：還原 imageLinks 擴充即可，無資料變更。
