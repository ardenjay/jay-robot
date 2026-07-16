## Context

`#view-detail` 為 flex 容器,`.detail-sidebar` 固定 `width: 280px`,右側 `.chat-area` 撐滿。檔名截斷靠 title tooltip 補救,體驗差。

## Goals / Non-Goals

**Goals:** 拖拉調寬、記憶寬度、重整保留。
**Non-Goals:** 不做收合/展開按鈕;不做響應式斷點調整(現有行為不變)。

## Decisions

1. **原生 mousedown/mousemove 拖拉,不用套件**:在側欄與聊天區之間插入 4px 把手 div(`cursor: col-resize`),mousedown 後監聽 document mousemove 設定 `sidebar.style.width`,mouseup 解除;拖動中加 `user-select: none` 防選字。
2. **界限 200px–視窗 50%**:太窄按鈕擠壞、太寬聊天區不可用。
3. **localStorage key `sidebarWidth`**:載入時套用;僅存數字。

## Risks / Trade-offs

- [iframe/選字干擾拖動] → 拖動中對 body 加 user-select:none;本頁無 iframe。
