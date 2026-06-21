## 1. 提供 marked 瀏覽器版

- [x] 1.1 建立 `public/vendor/` 目錄，將 `node_modules/marked/marked.min.js` 複製為 `public/vendor/marked.min.js`
- [x] 1.2 在 `public/index.html` 加入 `<script src="/vendor/marked.min.js"></script>`（於使用前載入）

## 2. 助手回答以 Markdown 渲染

- [x] 2.1 助手泡泡建立時，為其維護一個累積原始 Markdown 的變數（初始空字串）
- [x] 2.2 token 事件處理改為：`raw += event.value; bubble.innerHTML = marked.parse(raw)`，取代 `bubble.textContent += event.value`
- [x] 2.3 確認使用者問題泡泡與錯誤訊息維持 `textContent`（不渲染 Markdown）
- [x] 2.4 確認來源連結區塊（`sourcesEl`）渲染不受影響

## 3. 驗收

- [x] 3.1 啟動 `npm start`，確認 `/vendor/marked.min.js` 可被存取（HTTP 200）且 `window.marked` 存在
- [x] 3.2 送出問題，確認回答中的 `**粗體**`、`*` 清單、標題正確渲染為格式，無原始符號殘留
- [x] 3.3 確認串流期間逐步成形、完成後格式正確
- [x] 3.4 送出含 Markdown 符號的問題，確認問題泡泡仍為純文字
- [x] 3.5 確認來源連結區塊照常顯示、可點擊
- [x] 3.6 執行 `npm test`，確認現有測試全部通過
