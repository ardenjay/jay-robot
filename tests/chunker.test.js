require('dotenv').config();
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseAndChunk } = require('../src/services/ingestion');

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
});
