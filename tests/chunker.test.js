require('dotenv').config();
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseAndChunk } = require('../src/services/ingestion');

describe('chunker', () => {
  it('多標題文件產生正確 chunk 數量與 title', () => {
    const md = `# 第一章\n\n內容一。\n\n## 第二節\n\n內容二。\n\n### 小節\n\n內容三。`;
    const chunks = parseAndChunk(md, 'test.md');
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].title, '第一章');
    assert.equal(chunks[1].title, '第二節');
    assert.equal(chunks[2].title, '小節');
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
