const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rerankChunks } = require('../src/services/rerank');

function chunk(i) {
  return { docId: `d${i}`, title: `t${i}`, text: `內容 ${i}` };
}

describe('rerankChunks', () => {
  it('候選數 <= topK → 原樣回傳，不呼叫 LLM', async () => {
    const chunks = [chunk(0), chunk(1), chunk(2)];
    let called = false;
    const adapter = { generate: async () => { called = true; return '[]'; } };
    const result = await rerankChunks(adapter, 'q', chunks, 5);
    assert.deepEqual(result, chunks);
    assert.equal(called, false, '候選數不超過 topK 時不需要呼叫 LLM');
  });

  it('LLM 回傳合法 JSON 陣列 → 依索引重排並截斷至 topK', async () => {
    const chunks = [chunk(0), chunk(1), chunk(2), chunk(3), chunk(4), chunk(5)];
    const adapter = { generate: async () => '這是結果：[3, 0, 5] 謝謝' };
    const result = await rerankChunks(adapter, 'q', chunks, 3);
    assert.deepEqual(result.map(c => c.docId), ['d3', 'd0', 'd5']);
  });

  it('LLM 回傳不足 topK 個索引 → 依原順序遞補未選中的候選', async () => {
    const chunks = [chunk(0), chunk(1), chunk(2), chunk(3), chunk(4), chunk(5)];
    const adapter = { generate: async () => '[4]' };
    const result = await rerankChunks(adapter, 'q', chunks, 3);
    assert.deepEqual(result.map(c => c.docId), ['d4', 'd0', 'd1'], '第一個是模型選的,其餘依原順序遞補');
  });

  it('LLM 回傳無法解析的文字 → 退回原排序的前 topK 筆', async () => {
    const chunks = [chunk(0), chunk(1), chunk(2), chunk(3), chunk(4), chunk(5)];
    const adapter = { generate: async () => '我覺得都很相關,不知道怎麼排' };
    const result = await rerankChunks(adapter, 'q', chunks, 3);
    assert.deepEqual(result.map(c => c.docId), ['d0', 'd1', 'd2']);
  });

  it('LLM 呼叫拋出錯誤 → 不中斷,退回原排序的前 topK 筆', async () => {
    const chunks = [chunk(0), chunk(1), chunk(2), chunk(3), chunk(4), chunk(5)];
    const adapter = { generate: async () => { throw new Error('連線失敗'); } };
    const result = await rerankChunks(adapter, 'q', chunks, 3);
    assert.deepEqual(result.map(c => c.docId), ['d0', 'd1', 'd2']);
  });

  it('LLM 回傳重複索引 → 不重複計入,依序遞補其餘', async () => {
    const chunks = [chunk(0), chunk(1), chunk(2), chunk(3)];
    const adapter = { generate: async () => '[2, 2, 2]' };
    const result = await rerankChunks(adapter, 'q', chunks, 3);
    assert.deepEqual(result.map(c => c.docId), ['d2', 'd0', 'd1']);
  });
});
