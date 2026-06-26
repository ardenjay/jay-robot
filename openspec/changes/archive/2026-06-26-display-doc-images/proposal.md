## Why

`ingest-prebuilt-folder` 已把文件圖片持久化，且 chunk 內的圖片連結改寫為絕對路徑（`/documents/<proj>/<docId>/images/...`）。但目前 UI 完全不顯示圖：答案只有文字，來源也只是連到原始檔。使用者希望「看得到圖」——尤其電路圖、波形這類關鍵圖。

## What Changes

兩個方向都做：

- **(A) 答案氣泡直接顯示圖**
  - 前端答案已用 marked 渲染；補上圖片樣式（`max-width:100%`、`height:auto`、區塊顯示），避免大圖溢出版面。
  - 在 retrieval 的 system instruction 加引導：當某檢索到的 chunk 內含圖片 markdown（已是絕對路徑）且該圖有助於說明時，LLM 可在答案中帶出該圖片連結；**僅能使用檢索內容中既有的圖片連結，不得自行杜撰路徑**。
- **(B) 來源檢視器**
  - 答案下方的「來源」可點開檢視該 docId 的文件內容（含圖）。
  - 新增唯讀端點回傳該 docId 的可檢視內容：對 folder 進料、有持久化 `.md` 的文件，回傳合併後的 Markdown（圖以絕對路徑解析）供前端用 marked 渲染於 modal；對只有原始檔（如 web 上傳的 PDF）的文件，回傳原始檔 URL，維持現行「新分頁開啟原檔」行為作為 fallback。

不改進料邏輯。

## Capabilities

### New Capabilities
<!-- 無 -->

### Modified Capabilities
- `chat-ui`: 答案氣泡內的圖片以受限樣式呈現；來源可點開檢視器，folder 文件渲染 md+圖、原始檔文件 fallback 開原檔。
- `rag-query`: system instruction 新增「可在答案中帶出檢索內容裡既有的相關圖片連結（不得杜撰）」的引導。

## Impact

- **修改前端** `public/index.html`：img 樣式、來源點擊改為開檢視器 modal（依端點回傳型別分流：渲染 md 或開原檔）。
- **修改後端** `src/services/retrieval.js`：`buildSystemInstruction` 加入圖片引導文字。
- **新增後端** 唯讀端點（如 `GET /api/projects/:projectId/documents/:docId/view`）：回傳 `{ type:'markdown', markdown }` 或 `{ type:'file', url }`。為 GET 讀取路由，不受唯讀模式阻擋。
- **無 breaking change**：沒有圖的答案、只有原始檔的來源，行為與現況一致。
