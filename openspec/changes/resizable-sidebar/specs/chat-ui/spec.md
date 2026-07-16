## ADDED Requirements

### Requirement: Sidebar width is user-resizable
專案詳情頁側欄與聊天區之間 SHALL 提供拖拉把手,即時調整側欄寬度(下限 200px、上限視窗寬一半);寬度 SHALL 記憶於 localStorage,重新載入後套用。

#### Scenario: 拖拉調寬
- **WHEN** 使用者拖動側欄右緣把手
- **THEN** 側欄寬度即時跟隨,長檔名得以完整顯示

#### Scenario: 寬度記憶
- **WHEN** 調整寬度後重新整理頁面
- **THEN** 側欄維持調整後的寬度
