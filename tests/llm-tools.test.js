const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const GeminiAdapter = require('../src/adapters/llm/gemini');

// 用 stub client 驗證 chatWithTools 行為，不打真實 API。
function adapterWithStub(stubResponse, capture) {
  const a = new GeminiAdapter('fake-key');
  a.client = {
    getGenerativeModel(opts) {
      if (capture) capture.opts = opts;
      return {
        async generateContent({ contents }) {
          if (capture) capture.contents = contents;
          return { response: stubResponse };
        },
      };
    },
  };
  return a;
}

describe('GeminiAdapter.chatWithTools', () => {
  it('passes tool declarations to the model and parses a function call', async () => {
    const capture = {};
    const a = adapterWithStub({
      functionCalls: () => [{ name: 'netlist_part', args: { refdes: 'U42' } }],
      text: () => { throw new Error('should not read text on a function call'); },
    }, capture);

    const tools = [{ name: 'netlist_part', description: 'x', parameters: { type: 'object', properties: {} } }];
    const out = await a.chatWithTools([{ role: 'user', parts: [{ text: 'U42?' }] }], tools);

    // tools 有被包成 functionDeclarations 傳進去
    assert.ok(capture.opts.tools, 'tools 應傳入 model');
    assert.deepEqual(capture.opts.tools[0].functionDeclarations, tools);
    // 解析出 function call
    assert.equal(out.text, null);
    assert.equal(out.functionCalls.length, 1);
    assert.deepEqual(out.functionCalls[0], { name: 'netlist_part', args: { refdes: 'U42' } });
  });

  it('returns final text when the model requests no tools', async () => {
    const a = adapterWithStub({
      functionCalls: () => [],
      text: () => '最終答案',
    });
    const out = await a.chatWithTools([{ role: 'user', parts: [{ text: 'hi' }] }], []);
    assert.equal(out.functionCalls.length, 0);
    assert.equal(out.text, '最終答案');
  });

  it('supports a follow-up round after feeding tool results back', async () => {
    // 第二輪：contents 含 functionResponse，模型回最終文字
    const capture = {};
    const a = adapterWithStub({ functionCalls: () => [], text: () => 'done' }, capture);
    const contents = [
      { role: 'user', parts: [{ text: 'U42?' }] },
      { role: 'model', parts: [{ functionCall: { name: 'netlist_part', args: { refdes: 'U42' } } }] },
      { role: 'function', parts: [{ functionResponse: { name: 'netlist_part', response: { found: true } } }] },
    ];
    const out = await a.chatWithTools(contents, []);
    assert.equal(out.text, 'done');
    assert.equal(capture.contents.length, 3, '回填後的 contents 應原樣帶入');
  });
});
