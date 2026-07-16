const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rerankChunks, buildSnippet } = require('../src/services/rerank');

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

describe('buildSnippet（query-aware 片段）', () => {
  it('短 text → 原樣回傳', () => {
    assert.equal(buildSnippet('TPM 版本', '很短的內容'), '很短的內容');
  });

  it('長 text 且關鍵字只出現在後段（head 之後）→ 片段含該關鍵字命中視窗', () => {
    const text = 'A'.repeat(500) + ' Security TPM 2.0 詳細 ' + 'B'.repeat(500);
    const snip = buildSnippet('EAR-100T TPM 版本', text);
    assert.ok(snip.includes('TPM 2.0'), '後段關鍵字應被視窗帶出:\n' + snip);
    assert.ok(snip.includes('…'), '應含 head 與視窗的分隔符');
    assert.ok(snip.length < text.length, '仍應短於整段');
  });

  it('長 text 但關鍵字在前段(head 內)→ 只取 head，不另附視窗', () => {
    const text = 'TPM 2.0 開頭就有 ' + 'C'.repeat(600);
    const snip = buildSnippet('TPM 版本', text);
    assert.ok(!snip.includes('…'), '前段已含關鍵字,不需附視窗');
    assert.ok(snip.startsWith('TPM 2.0'));
  });

  it('通用詞在前段命中、答案關鍵字在後段 → 不被前段命中誤導,仍附後段視窗', () => {
    // 「EAR」在 head 內命中,但真正答案關鍵字「Dimension」在 head 之後——只看 head 之後的命中
    const text = 'EAR-100T7 系統 ' + 'D'.repeat(450) + ' Dimension 200 x 145 x 97 mm ' + 'E'.repeat(100);
    const snip = buildSnippet('EAR-100T Dimension 尺寸', text);
    assert.ok(snip.includes('200 x 145'), '後段的 Dimension 應被視窗帶出,不因 EAR 前段命中而漏掉:\n' + snip);
  });

  it('query 切不出有效詞 → 退回 head（不炸、不更差）', () => {
    const text = 'X'.repeat(600) + ' 答案在這 ' + 'Y'.repeat(200);
    const snip = buildSnippet('、。，', text);
    assert.equal(snip.length, 400, '無有效詞時等同取前 HEAD_LEN');
  });

  it('關鍵字完全沒出現在 text → 只取 head', () => {
    const text = 'Z'.repeat(700);
    const snip = buildSnippet('完全不相關的詞', text);
    assert.ok(!snip.includes('…'));
    assert.equal(snip.length, 400);
  });

  it('queries 傳陣列變體 → 用其中一個變體的詞在 head 之後開窗', () => {
    // 中文變體在英文內文找不到；英文變體才命中 head 之後的答案
    const text = 'H'.repeat(500) + ' Operating Temperature -20 ~ 60 °C ' + 'T'.repeat(100);
    const snip = buildSnippet(['工作溫度範圍', 'Operating temperature range'], text);
    assert.ok(snip.includes('…'), '應以英文變體開窗');
    assert.ok(snip.includes('-20 ~ 60'), '視窗應帶出答案');
  });

  it('命中比對大小寫不敏感 → 小寫查詢詞命中內文大寫詞', () => {
    const text = 'H'.repeat(500) + ' Operating Temperature -20 ~ 60 °C ' + 'T'.repeat(100);
    const snip = buildSnippet('operating temperature', text); // 小寫 vs 內文大寫
    assert.ok(snip.includes('…'));
    assert.ok(snip.includes('-20 ~ 60'));
  });

  it('單一字串仍相容：陣列與等價字串結果相同', () => {
    const text = 'A'.repeat(500) + ' TPM 2.0 安全模組 ' + 'B'.repeat(100);
    assert.equal(buildSnippet(['TPM 版本'], text), buildSnippet('TPM 版本', text));
  });
});
