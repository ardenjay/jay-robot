require('dotenv').config();
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseAndChunk, extractTableRows } = require('../src/services/ingestion');

describe('chunker', () => {
  it('多標題文件產生正確 chunk 數量,title 為完整章節路徑', () => {
    const md = `# 第一章\n\n內容一。\n\n## 第二節\n\n內容二。\n\n### 小節\n\n內容三。`;
    const chunks = parseAndChunk(md, 'test.md');
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].title, '第一章');
    assert.equal(chunks[1].title, '第一章 › 第二節');
    assert.equal(chunks[2].title, '第一章 › 第二節 › 小節');
  });

  it('同層標題切換 → 截斷堆疊;回到上層 → 路徑跟著縮短', () => {
    const md = `# 介面\n\n## 通訊\n\n### CAN\n\nCAN 內容。\n\n### UART\n\nUART 內容。\n\n## 電源\n\n電源內容。`;
    const chunks = parseAndChunk(md, 'x.md');
    assert.deepEqual(chunks.map(c => c.title), [
      '介面 › 通訊 › CAN',
      '介面 › 通訊 › UART',
      '介面 › 電源',
    ]);
  });

  it('跳層標題(H1 直接到 H3)按實際深度入棧,不補洞', () => {
    const md = `# 規格\n\n### 電氣特性\n\n內容。\n\n## 機構\n\n內容。`;
    const chunks = parseAndChunk(md, 'x.md');
    assert.deepEqual(chunks.map(c => c.title), ['規格 › 電氣特性', '規格 › 機構']);
  });

  it('標題前的引言段落 → title 為檔名', () => {
    const md = `引言文字。\n\n# 第一章\n\n內容。`;
    const chunks = parseAndChunk(md, 'intro.md');
    assert.equal(chunks[0].title, 'intro.md');
    assert.equal(chunks[1].title, '第一章');
  });

  it('超長內容切割後各子塊沿用同一路徑 title', () => {
    const longPara = 'B'.repeat(900);
    const md = `# 章\n\n## 節\n\n${longPara}\n\n${longPara}`;
    const chunks = parseAndChunk(md, 'x.md');
    assert.ok(chunks.length > 1);
    for (const c of chunks) assert.equal(c.title, '章 › 節');
  });

  it('無標題文件產生單一 chunk，title 為 filename', () => {
    const md = `這是純文字段落。\n\n第二段。`;
    const chunks = parseAndChunk(md, 'plain.md');
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].title, 'plain.md');
  });

  it('超過 1500 字的 chunk 被切割，每個不超過 1500 字', () => {
    const longPara = 'A'.repeat(600);
    const md = `# 長文章\n\n${longPara}\n\n${longPara}\n\n${longPara}`;
    const chunks = parseAndChunk(md, 'long.md');
    assert.ok(chunks.length > 1, '應該被切成多個 chunk');
    for (const chunk of chunks) {
      assert.ok(chunk.text.length <= 1500, `chunk 長度 ${chunk.text.length} 超過 1500`);
    }
  });

  it('整行粗體充當標題(無 # 標題)→ 每個粗體段各自成 chunk,title 為粗體文字', () => {
    // FAQ 式文件：用 **Q1: ...** 當段落標題,無 # 標題
    const md = `**Q1: 第一個問題?**\n\n第一個答案。\n\n**Q2：第二個問題?**\n\n第二個答案。`;
    const chunks = parseAndChunk(md, 'faq.md');
    assert.equal(chunks.length, 2, '兩個粗體標題應切成兩個 chunk');
    assert.equal(chunks[0].title, 'Q1: 第一個問題?');
    assert.ok(chunks[0].text.includes('第一個答案') && !chunks[0].text.includes('第二個答案'), '各 chunk 不應混入他題');
    assert.equal(chunks[1].title, 'Q2：第二個問題?');
  });

  it('行內部分粗體(非整段粗體)不觸發切塊', () => {
    const md = `# 章\n\n本板用 **MAX96712** 做轉換,還有 **PoC** 供電。`;
    const chunks = parseAndChunk(md, 'x.md');
    assert.equal(chunks.length, 1, '行內粗體不應切塊');
    assert.equal(chunks[0].title, '章');
  });

  it('粗體標題附加於現有 # 章節路徑之下,不覆蓋它', () => {
    const md = `# 介面\n\n## FAQ\n\n**Q1: 問題?**\n\n答案內容。`;
    const chunks = parseAndChunk(md, 'x.md');
    const last = chunks[chunks.length - 1];
    assert.equal(last.title, '介面 › FAQ › Q1: 問題?');
  });
});

describe('sidecar 表格列抽取 (extractTableRows)', () => {
  const bigTable = `<table>`
    + `<tr><td></td><td>Min</td><td>Max</td><td>Unit</td></tr>`
    + `<tr><td>Weight</td><td></td><td>8.9</td><td>gram</td></tr>`
    + `<tr><td>Height</td><td></td><td>13.0</td><td>mm</td></tr>`
    + `<tr><td>IP-rating</td><td></td><td>IP68</td><td></td></tr>`
    + `<tr><td>Width</td><td></td><td>31.5</td><td>mm</td></tr>`
    + `</table>`;

  it('大表 → 每 body 列一筆,含表頭欄名脈絡與 firstCell', () => {
    const rows = extractTableRows(`# 規格\n\n${bigTable}`, 'spec.md');
    assert.equal(rows.length, 4);
    const weight = rows.find(r => r.text.includes('Weight'));
    assert.ok(weight.text.includes('8.9') && weight.text.includes('gram'));
    assert.ok(weight.text.includes('Min') && weight.text.includes('Max'), '列帶表頭欄名');
    assert.equal(weight.firstCell, 'Weight');
    assert.equal(weight.title, '規格');
    assert.ok(!weight.text.includes('Height'), '各列不互相混入');
  });

  it('表格前的 caption 段落(Table N: ...)併進 title —— 實體標籤', () => {
    const md = `# 6.2 System specifications\n\nTable 25: System specifications of MTi-680G\n\n${bigTable}`;
    const rows = extractTableRows(md, 'x.md');
    assert.ok(rows[0].title.includes('Table 25: System specifications of MTi-680G'), rows[0].title);
    assert.ok(rows[0].title.includes('6.2 System specifications'), '章節路徑仍在');
  });

  it('markdown pipe 表也抽列,pin 表 firstCell = pin 編號', () => {
    const md = `# 腳位\n\n| Pin | Name |\n| --- | --- |\n| 1 | VIN |\n| 2 | GND |\n| 3 | CAN_H |\n| 4 | CAN_L |`;
    const rows = extractTableRows(md, 'pin.md');
    assert.equal(rows.length, 4);
    assert.equal(rows[0].firstCell, '1');
    assert.ok(rows[0].text.includes('VIN'));
  });

  it('小表(body ≤ 門檻)不產列', () => {
    const md = `# 公司\n\n<table><tr><td>Name</td><td>Xsens</td></tr><tr><td>Country</td><td>NL</td></tr></table>`;
    assert.equal(extractTableRows(md, 'co.md').length, 0);
  });

  it('主 chunk 切塊行為不受影響:大表仍整張留在段落 chunk 內', () => {
    const chunks = parseAndChunk(`# 規格\n\n${bigTable}`, 'spec.md');
    assert.equal(chunks.length, 1, '大表不拆主 chunk');
    assert.ok(chunks[0].text.includes('Weight') && chunks[0].text.includes('Width'), '整表都在');
  });
});
