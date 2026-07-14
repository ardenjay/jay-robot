const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const OllamaAdapter = require('../src/adapters/llm/ollama');
const { toOllamaMessages, toOllamaTools } = OllamaAdapter;

// 假 fetch：記錄請求並回傳預先給定的回應
function fakeFetch(response) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return response;
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(data) {
  return { ok: true, json: async () => data };
}

// 把多行 NDJSON 字串包成 fetch streaming response（模擬 chunk 邊界切在行中間）
function ndjsonResponse(lines, splitAt) {
  const raw = lines.map(l => JSON.stringify(l)).join('\n') + '\n';
  const pieces = splitAt ? [raw.slice(0, splitAt), raw.slice(splitAt)] : [raw];
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (i < pieces.length) return { done: false, value: encoder.encode(pieces[i++]) };
            return { done: true, value: undefined };
          },
        };
      },
    },
  };
}

function makeAdapter(fetchImpl) {
  return new OllamaAdapter({ baseUrl: 'http://test:11434', genModel: 'gen-m', embedModel: 'emb-m', fetch: fetchImpl });
}

describe('OllamaAdapter embedding', () => {
  it('embedBatch 以單一請求送出 input 陣列，回傳同序向量', async () => {
    const fetch = fakeFetch(jsonResponse({ embeddings: [[1, 0], [0, 1]] }));
    const adapter = makeAdapter(fetch);
    const vecs = await adapter.embedBatch(['甲', '乙']);
    assert.equal(fetch.calls.length, 1);
    assert.equal(fetch.calls[0].url, 'http://test:11434/api/embed');
    assert.deepEqual(fetch.calls[0].body, { model: 'emb-m', input: ['甲', '乙'] });
    assert.deepEqual(vecs, [[1, 0], [0, 1]]);
  });

  it('embed 回傳單一向量；空陣列不發請求', async () => {
    const fetch = fakeFetch(jsonResponse({ embeddings: [[0.5, 0.5]] }));
    const adapter = makeAdapter(fetch);
    assert.deepEqual(await adapter.embed('文字'), [0.5, 0.5]);
    assert.deepEqual(await adapter.embedBatch([]), []);
    assert.equal(fetch.calls.length, 1, '空批次不應發出請求');
  });
});

describe('Gemini↔Ollama 格式轉換', () => {
  it('system role 對映為 system message（qwen3 template 原生支援）', () => {
    const contents = [
      { role: 'system', parts: [{ text: '你是助手' }] },
      { role: 'user', parts: [{ text: '問題' }] },
    ];
    assert.deepEqual(toOllamaMessages(contents), [
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '問題' },
    ]);
  });

  it('user／model+functionCall／function+functionResponse 三種 role 轉換正確', () => {
    const contents = [
      { role: 'user', parts: [{ text: '問題' }] },
      { role: 'model', parts: [{ functionCall: { name: 'search_documents', args: { query: 'U42' } } }] },
      { role: 'function', parts: [{ functionResponse: { name: 'search_documents', response: { chunk_count: 1 } } }] },
    ];
    const messages = toOllamaMessages(contents);
    assert.deepEqual(messages, [
      { role: 'user', content: '問題' },
      { role: 'assistant', content: '', tool_calls: [{ function: { name: 'search_documents', arguments: { query: 'U42' } } }] },
      { role: 'tool', content: JSON.stringify({ chunk_count: 1 }) },
    ]);
  });

  it('工具宣告轉成 {type:function, function} 形狀', () => {
    const decl = { name: 't', description: 'd', parameters: { type: 'object', properties: {} } };
    assert.deepEqual(toOllamaTools([decl]), [{ type: 'function', function: decl }]);
  });
});

describe('OllamaAdapter chatWithTools', () => {
  const contents = [{ role: 'user', parts: [{ text: '問題' }] }];
  const tools = [{ name: 't', description: 'd', parameters: {} }];

  it('有 tool_calls 時回傳 functionCalls（物件 arguments）', async () => {
    const fetch = fakeFetch(jsonResponse({
      message: { content: '', tool_calls: [{ function: { name: 't', arguments: { a: 1 } } }] },
    }));
    const r = await makeAdapter(fetch).chatWithTools(contents, tools);
    assert.deepEqual(r, { functionCalls: [{ name: 't', args: { a: 1 } }], text: null });
    assert.equal(fetch.calls[0].body.think, false, 'thinking 模型應關閉 think');
    assert.ok(fetch.calls[0].body.options.num_ctx >= 8192, 'num_ctx 必須拉高，Ollama 預設 4096 會截斷 system prompt');
    assert.deepEqual(fetch.calls[0].body.tools, toOllamaTools(tools));
  });

  it('字串 arguments 做 JSON.parse，壞 JSON 容錯為空物件', async () => {
    const fetch = fakeFetch(jsonResponse({
      message: {
        tool_calls: [
          { function: { name: 'a', arguments: '{"q":"x"}' } },
          { function: { name: 'b', arguments: '{壞掉' } },
        ],
      },
    }));
    const r = await makeAdapter(fetch).chatWithTools(contents, tools);
    assert.deepEqual(r.functionCalls, [{ name: 'a', args: { q: 'x' } }, { name: 'b', args: {} }]);
  });

  it('無 tool_calls 時回傳最終文字', async () => {
    const fetch = fakeFetch(jsonResponse({ message: { content: '答案' } }));
    const r = await makeAdapter(fetch).chatWithTools(contents, tools);
    assert.deepEqual(r, { functionCalls: [], text: '答案' });
  });
});

describe('OllamaAdapter 串流與錯誤', () => {
  it('stream 解析 NDJSON 逐段 yield，忽略 thinking、done 即停', async () => {
    const fetch = fakeFetch(ndjsonResponse([
      { message: { content: '你', thinking: '思考中' }, done: false },
      { message: { content: '好' }, done: false },
      { message: { content: '' }, done: true },
    ], 25)); // 故意把 chunk 邊界切在 JSON 行中間
    const tokens = [];
    for await (const t of makeAdapter(fetch).stream('嗨')) tokens.push(t);
    assert.deepEqual(tokens, ['你', '好']);
  });

  it('連線被拒時錯誤訊息含 URL 與 ollama serve 指引', async () => {
    const fetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(
      () => makeAdapter(fetch).generate('嗨'),
      /無法連線 Ollama（http:\/\/test:11434）.*ollama serve/,
    );
  });

  it('model not found 時錯誤訊息提示 ollama pull', async () => {
    const fetch = fakeFetch({ ok: false, status: 404, text: async () => JSON.stringify({ error: 'model "gen-m" not found' }) });
    await assert.rejects(() => makeAdapter(fetch).generate('嗨'), /404.*not found.*ollama pull gen-m/);
  });
});
