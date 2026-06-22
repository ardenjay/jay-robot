## Why

進入某個專案後，標題列的「← 專案列表」返回鈕**從未顯示**，使用者無法從專案內頁回到列表去新建或切換專案（只能手動改網址 `#/`）。

根因：CSS 把按鈕預設為 `display: none`，但 JS 進入內頁時用 `backBtn.style.display = ''` 想顯示它——`''` 只是清掉行內樣式、回退到 CSS 規則，而 CSS 規則正是 `display: none`，所以按鈕永遠隱藏。

## What Changes

- 進入專案內頁時，返回鈕以明確的 display 值顯示（如 `inline-block`），回到列表時隱藏
- 修正後使用者可在內頁點「← 專案列表」回到列表，進行新建 / 切換專案
- 不改路由邏輯、不改其他 UI

## Capabilities

### New Capabilities

無

### Modified Capabilities

- `chat-ui`：新增「在專案列表與專案內頁間導覽」的明確行為——內頁顯示返回鈕、點擊回到列表

## Impact

- `public/index.html`：`showDetail()` 將 `backBtn.style.display` 設為明確值（如 `'inline-block'`）而非 `''`；或改用 CSS class 切換顯示
- 無 API、資料庫、後端變更
