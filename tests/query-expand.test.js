const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { expandQuery, hasCJK } = require('../src/services/query-expand');

describe('hasCJK', () => {
  it('中文 → true', () => assert.equal(hasCJK('供電電壓'), true));
  it('純英文 → false', () => assert.equal(hasCJK('supply voltage VIN'), false));
  it('英數符號 → false', () => assert.equal(hasCJK('MTi-680G RTCM 38400'), false));
  it('中英混合 → true', () => assert.equal(hasCJK('MTi 600 供電'), true));
});

describe('expandQuery', () => {
  it('無 CJK → 單查詢，不呼叫 generate', async () => {
    let called = false;
    const adapter = { generate: async () => { called = true; return 'x'; } };
    const r = await expandQuery(adapter, 'supply voltage range');
    assert.deepEqual(r, ['supply voltage range']);
    assert.equal(called, false);
  });

  it('有 CJK → 回 [原查詢, 英文翻譯]', async () => {
    const adapter = { generate: async () => 'MTi 600 supply input voltage range' };
    const r = await expandQuery(adapter, 'MTi 600 供電輸入電壓範圍');
    assert.deepEqual(r, ['MTi 600 供電輸入電壓範圍', 'MTi 600 supply input voltage range']);
  });

  it('翻譯結果帶引號/空白 → 清乾淨', async () => {
    const adapter = { generate: async () => '  "supply voltage range"  \n' };
    const r = await expandQuery(adapter, '供電電壓範圍');
    assert.deepEqual(r, ['供電電壓範圍', 'supply voltage range']);
  });

  it('翻譯拋錯 → 退回單一原查詢', async () => {
    const adapter = { generate: async () => { throw new Error('連線失敗'); } };
    const r = await expandQuery(adapter, '供電電壓');
    assert.deepEqual(r, ['供電電壓']);
  });

  it('翻譯回空字串 → 退回單一原查詢', async () => {
    const adapter = { generate: async () => '   ' };
    const r = await expandQuery(adapter, '供電電壓');
    assert.deepEqual(r, ['供電電壓']);
  });

  it('翻譯回與原查詢相同（大小寫不計）→ 不重複，退回單一', async () => {
    const adapter = { generate: async () => 'ABC' };
    const r = await expandQuery(adapter, 'abc含中文');
    // 'abc含中文' 有 CJK,翻譯回 'ABC' 與原查詢不同 → 應為兩個
    assert.equal(r.length, 2);
    const adapter2 = { generate: async () => '供電' };
    const r2 = await expandQuery(adapter2, '供電');
    assert.deepEqual(r2, ['供電'], '翻譯等同原查詢時不重複');
  });
});
