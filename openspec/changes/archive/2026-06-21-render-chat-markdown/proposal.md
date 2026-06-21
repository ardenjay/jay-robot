## Why

LLM 回答是 Markdown 格式（含 `**粗體**`、`*` 項目符號、標題等），但前端聊天泡泡是用 `bubble.textContent += token` 累加純文字，從未解析 Markdown。結果使用者看到的是 `**A、Features...**`、`*   MICRO USB` 這種帶原始符號的生文字，閱讀體驗差。

`marked` 已是專案相依（伺服器端 ingest 使用），但前端完全沒用到。只要在瀏覽器端把回答以 Markdown 渲染即可解決。

## What Changes

- 聊天「助手」回答以 **Markdown 渲染**顯示（粗體、項目清單、標題、程式碼等），取代目前的純文字
- 前端載入本機提供的 `marked` 瀏覽器版（從 `node_modules/marked/marked.min.js` 複製到 `public/vendor/`，不依賴外部 CDN）
- 串流期間逐步渲染：每收到 token 就以累積的 Markdown 重新渲染泡泡內容
- 使用者輸入的問題泡泡維持純文字（不渲染），來源連結區塊行為不變

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `chat-ui`：對話串流顯示從「純文字」改為「Markdown 渲染」；新增以 marked 在瀏覽器端解析回答的行為

## Impact

- `public/index.html`：助手泡泡的 token 處理改為累積原始 Markdown 並以 `marked.parse()` 渲染；新增 `<script>` 載入 marked
- 新增 `public/vendor/marked.min.js`（由 `node_modules/marked` 複製）
- `src/app.js` 已 `express.static('public')`，`/vendor/marked.min.js` 可直接被服務，無需新路由
- 無 API 介面變更、無資料庫異動
