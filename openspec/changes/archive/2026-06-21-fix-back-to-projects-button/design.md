## Context

前端是 hash 路由的兩視圖 SPA：列表頁（`#/`）與專案內頁（`#/projects/<id>`）。標題列有返回鈕 `#back-btn`。CSS `header .back-btn { display: none; }`（預設隱藏）。`showDetail()` 用 `backBtn.style.display = ''` 想顯示、`showProjects()` 用 `= 'none'` 隱藏。

問題：`element.style.display = ''` 是「移除行內 display 宣告、回退到樣式表」，而樣式表是 `display: none`，所以進入內頁後按鈕仍隱藏。

## Goals / Non-Goals

**Goals:**
- 進入專案內頁時返回鈕確實顯示、回到列表時隱藏
- 修正最小、不動路由與其他 UI

**Non-Goals:**
- 不改 hash 路由或視圖切換邏輯
- 不在內頁新增「專案下拉切換」之類的新功能（另議）

## Decisions

### 1. 顯示時設明確 display 值，而非空字串

**決定**：`showDetail()` 改為 `backBtn.style.display = 'inline-block';`（顯示），`showProjects()` 維持 `= 'none'`（隱藏）。

**理由**：問題本質是「`''` 會回退到 CSS 的 `display:none`」。給明確值即可覆蓋 CSS 規則。`inline-block` 符合按鈕在 flex 標題列中的呈現。改動一行、風險最低。

**替代方案（不採用）**：移除 CSS 的 `display:none`、改用 `.hidden` class 切換。較一致但動到 CSS 與兩處邏輯，超出最小修正；保留為日後整理選項。

## Risks / Trade-offs

- **極小**：僅影響返回鈕的顯示值。若日後有人又把 CSS 預設改回 `display:none` 並用 `''` 顯示，會重現同類問題——根因是「`''` ≠ 顯示」，已於 proposal/design 記錄避免再犯。
