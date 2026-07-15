const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { fixLatin1Mojibake } = require('../src/services/uploadName');

// 模擬 multer 1.x 的誤解碼：UTF-8 位元組被當 latin1 讀出
const mojibake = s => Buffer.from(s, 'utf8').toString('latin1');

describe('fixLatin1Mojibake', () => {
  it('純 ASCII 檔名逐字不變', () => {
    for (const name of ['report_v2.pdf', 'C315-PO_166pcs.PDF', 'a b (1).md']) {
      assert.equal(fixLatin1Mojibake(name), name);
    }
  });

  it('中文檔名 mojibake 還原', () => {
    const orig = 'Jetson T5000 vs T4000 規格比較.md';
    assert.equal(fixLatin1Mojibake(mojibake(orig)), orig);
  });

  it('全形符號(＿)還原', () => {
    const orig = 'C315 Sensing＿PO_166pcs.pdf';
    assert.equal(fixLatin1Mojibake(mojibake(orig)), orig);
  });

  it('已是正確 UTF-8 的中文不被二次轉換', () => {
    const orig = '已經是正確的檔名.md';
    assert.equal(fixLatin1Mojibake(orig), orig);
  });

  it('混合中英數還原', () => {
    const orig = '100T 產品規格 v2 (final).xlsx';
    assert.equal(fixLatin1Mojibake(mojibake(orig)), orig);
  });

  it('真 latin1 西歐檔名(還原會產生 U+FFFD)保留原樣', () => {
    assert.equal(fixLatin1Mojibake('café.pdf'), 'café.pdf');
  });

  it('空值/非字串安全通過', () => {
    assert.equal(fixLatin1Mojibake(''), '');
    assert.equal(fixLatin1Mojibake(undefined), undefined);
  });
});
