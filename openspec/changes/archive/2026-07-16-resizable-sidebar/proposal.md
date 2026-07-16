## Why

左側欄固定 280px,檔名稍長就被截斷(「C209 Jetson Thor Mo…」),文件多了看不出誰是誰。

## What Changes

- 側欄與聊天區之間加一條可拖拉的分隔把手:拖動即時調整側欄寬度(下限 200px、上限視窗一半),寬度記到 `localStorage`,重整後保留。
- 唯讀/管理模式皆可用(純顯示調整,非寫入操作)。

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `chat-ui`: 新增「側欄寬度可拖拉調整」需求(ADDED)。

## Impact

- `public/index.html`:CSS(把手樣式)+ 少量 JS(drag 事件、localStorage 記憶)。
- 無後端、無測試檔變動(`npm test` 維持全綠;前端以語法檢查 + 使用者驗收)。
