## 1. 修正返回鈕顯示

- [x] 1.1 在 `public/index.html` 的 `showDetail()` 將 `backBtn.style.display` 由 `''` 改為明確值 `'inline-block'`
- [x] 1.2 確認 `showProjects()` 仍以 `'none'` 隱藏返回鈕

## 2. 驗收

- [x] 2.1 啟動 `npm start`，進入某專案，確認標題列出現「← 專案列表」按鈕
- [x] 2.2 點擊返回鈕，確認回到專案列表頁（可見建立專案表單與專案卡片）
- [x] 2.3 在列表頁確認返回鈕不顯示
- [x] 2.4 執行 `npm test`，確認現有測試全部通過
