## MODIFIED Requirements

### Requirement: Parse Markdown by headings
系統 SHALL 依 `#`、`##`、`###` 標題將 Markdown 文件切割成語意 chunks;每個 chunk 的 `title` SHALL 為其所屬的完整章節路徑(自最上層標題至最近標題,以「 › 」串接),切塊時依標題深度維護階層堆疊(遇同層或較淺標題即截斷堆疊)。

此外,系統 SHALL 把「整段內容皆為粗體」的段落(單行且整行以 `**...**` 包裹,如 `**Q1: ...**`、`**Power Supply**`)視為一個標題邊界:遇到時先 flush 前一 chunk,再以該粗體文字(去除 `**`)作為新章節標題壓入階層堆疊。此舉修正「文件用粗體充當段落標題、無 `#` 標題」時被整份視為無標題而按長度硬切、多主題混入單一 chunk 導致召回稀釋的問題。粗體標題 SHALL 視為比任何 `#` 標題更深的一層(不覆蓋既有 `#` 章節路徑,而是附加於其下)。僅含行內部分粗體(非整段粗體)的段落 SHALL NOT 觸發此切塊。

#### Scenario: Document with multiple headings
- **WHEN** Markdown 文件包含多個標題
- **THEN** 每個標題與其下方內容形成一個獨立 chunk

#### Scenario: Nested headings produce a section path
- **WHEN** 內容位於「# 介面 > ## 通訊 > ### CAN」之下
- **THEN** 該 chunk 的 `title` 為「介面 › 通訊 › CAN」

#### Scenario: Sibling heading truncates the stack
- **WHEN** 「### CAN」之後出現同層「### UART」,其後再出現上層「## 電源」
- **THEN** UART 段的 title 為「介面 › 通訊 › UART」,電源段的 title 為「介面 › 電源」

#### Scenario: Document without headings
- **WHEN** Markdown 文件沒有任何標題
- **THEN** 整份文件作為一個 chunk,`title` 為檔案名稱

#### Scenario: Bold-only line acts as a heading boundary
- **WHEN** Markdown 文件用整段粗體充當段落標題(如 FAQ 的 `**Q1: ...**`、`**Q2：...**`)而無 `#` 標題
- **THEN** 每個粗體標題與其下方內容形成一個獨立 chunk(而非整份按長度硬切成多主題混雜的 chunk),各 chunk 的 title 為該粗體文字

#### Scenario: Inline bold does not trigger splitting
- **WHEN** 某段落只含行內部分粗體(如「本板用 **MAX96712** 做轉換」),而非整段皆為粗體
- **THEN** 不因該行內粗體而切塊,該段落沿用當前章節路徑

#### Scenario: Chunk exceeds 1500 characters
- **WHEN** 單一 chunk 超過 1500 字
- **THEN** 系統以段落為單位進一步切割,確保每個 chunk 不超過 1500 字,各子塊沿用同一章節路徑 title
