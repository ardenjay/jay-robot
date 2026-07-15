const os = require('os');
const fs = require('fs');
const path = require('path');

// retrieval 在 require 時會載入 llm / vector 單例：llm 用 mock 免 API key，
// cwd 切到 temp 目錄讓 vector 單例落在 throwaway DB，不碰真實 data/rag.db。
process.env.LLM_ADAPTER = 'mock';
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'retrieval-prompt-')));

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { answer } = require('../src/services/retrieval');

// 以假 adapter / 假 store 擷取送給 LLM 的 contents，驗證 system instruction 的注入內容。
// 不打真實 API、不碰真實 DB。
function makeStore(project) {
  return {
    listProjects: async () => [project],
    listDocuments: async () => [],
    isEmpty: () => false,
    search: async () => [],
  };
}

function makeAdapter(capture) {
  return {
    chatWithTools: async (contents) => {
      capture.contents = contents;
      return { functionCalls: [], text: 'ok' };
    },
    embed: async () => [0],
  };
}

async function capturedPrompt(project) {
  const capture = {};
  const gen = answer('100T 有幾個 CAN', project.id, makeAdapter(capture), makeStore(project));
  for await (const _ of gen) {} // 消耗到結束
  return capture.contents[0].parts[0].text;
}

describe('retrieval system prompt 注入專案名稱與背景', () => {
  it('contents[0] 為 system 元素（含指令）、contents[1] 為僅含問題的 user 元素', async () => {
    const capture = {};
    const project = { id: 'p1', name: 'TESTPROJ', context: '' };
    for await (const _ of answer('100T 有幾個 CAN', project.id, makeAdapter(capture), makeStore(project))) {}
    assert.equal(capture.contents[0].role, 'system');
    assert.ok(capture.contents[0].parts[0].text.includes('目前專案名稱'), 'system 元素應含完整指令');
    assert.equal(capture.contents[1].role, 'user');
    assert.equal(capture.contents[1].parts[0].text, '100T 有幾個 CAN', 'user 元素應只含問題，不與指令串接');
  });

  it('專案名稱固定注入;context 為空時不含背景區塊', async () => {
    const sys = await capturedPrompt({ id: 'p1', name: 'TESTPROJ', context: '' });
    assert.ok(sys.includes('目前專案名稱:「TESTPROJ」'), sys.slice(0, 200));
    assert.ok(!sys.includes('專案背景(使用者提供)'), 'context 空白不應有背景區塊');
  });

  it('context 非空時含「專案背景(使用者提供)」區塊與內容,置於 NPDS 目錄之前', async () => {
    const sys = await capturedPrompt({ id: 'p1', name: 'TESTPROJ', context: '100T = EAR-100T7 邊緣運算 Box PC' });
    assert.ok(sys.includes('## 專案背景(使用者提供)'));
    assert.ok(sys.includes('100T = EAR-100T7 邊緣運算 Box PC'));
    assert.ok(
      sys.indexOf('## 專案背景(使用者提供)') < sys.indexOf('## NPDS 文件目錄'),
      '背景區塊應在 NPDS 目錄之前',
    );
  });

  it('context 只有空白 → 視同空,不注入背景區塊', async () => {
    const sys = await capturedPrompt({ id: 'p1', name: 'TESTPROJ', context: '   \n  ' });
    assert.ok(!sys.includes('專案背景(使用者提供)'));
  });
});

describe('強制首輪檢索（模型零工具就作答時的程式層防護）', () => {
  it('模型未呼叫任何工具就作答 → 系統代跑一次檢索,模型依結果重答', async () => {
    let round = 0;
    const searchCalls = [];
    const adapter = {
      embed: async () => [0.5],
      chatWithTools: async (contents) => {
        round++;
        if (round === 1) return { functionCalls: [], text: '請提供更詳細的資訊' };
        // 第二輪:歷史應含被強制塞入的工具回合
        const hasForced = contents.some(c => c.role === 'function');
        return { functionCalls: [], text: hasForced ? '依檢索結果作答' : '沒收到檢索結果' };
      },
    };
    const store = {
      listProjects: async () => [{ id: 'p1', name: 'P', context: '' }],
      listDocuments: async () => [],
      isEmpty: () => false,
      search: async (...a) => { searchCalls.push(a); return [{ docId: 'PO.md', title: 't', text: '單價 13702' }]; },
    };

    const events = [];
    for await (const e of answer('sensing camera 多少錢', 'p1', adapter, store)) events.push(e);

    assert.equal(searchCalls.length, 1, '應代跑恰好一次檢索');
    const toolEvents = events.filter(e => e.type === 'tool');
    assert.equal(toolEvents.length, 1);
    assert.equal(toolEvents[0].name, 'search_documents');
    assert.equal(toolEvents[0].args.query, 'sensing camera 多少錢', '強制檢索應以原問題為查詢');
    assert.equal(events.find(e => e.type === 'token').value, '依檢索結果作答');
    const sources = events.find(e => e.type === 'sources').value;
    assert.deepEqual(sources.map(s => s.docId), ['PO.md'], '強制檢索的來源應列入');
  });

  it('只強制一次:模型第二輪仍不用工具 → 直接作答,不無限迴圈', async () => {
    let rounds = 0;
    const adapter = {
      embed: async () => [0.5],
      chatWithTools: async () => { rounds++; return { functionCalls: [], text: '就是不查' }; },
    };
    const store = {
      listProjects: async () => [{ id: 'p1', name: 'P', context: '' }],
      listDocuments: async () => [],
      isEmpty: () => false,
      search: async () => [],
    };
    const events = [];
    for await (const e of answer('hi', 'p1', adapter, store)) events.push(e);
    assert.equal(rounds, 2, '強制一次後就收工');
    assert.equal(events.find(e => e.type === 'token').value, '就是不查');
  });

  it('模型已自行呼叫過工具 → 最終作答不再強制', async () => {
    let round = 0;
    const searchCalls = [];
    const adapter = {
      embed: async () => [0.5],
      chatWithTools: async () => {
        round++;
        if (round === 1) return { functionCalls: [{ name: 'search_documents', args: { query: 'q' } }], text: null };
        return { functionCalls: [], text: '答案' };
      },
    };
    const store = {
      listProjects: async () => [{ id: 'p1', name: 'P', context: '' }],
      listDocuments: async () => [],
      isEmpty: () => false,
      search: async (...a) => { searchCalls.push(a); return []; },
    };
    const events = [];
    for await (const e of answer('q', 'p1', adapter, store)) events.push(e);
    assert.equal(searchCalls.length, 1, '只有模型自己那次檢索,無強制追加');
    assert.equal(events.filter(e => e.type === 'tool').length, 1);
  });
});

describe('search_documents 檢索路徑（hybrid / fallback）', () => {
  // 第一輪要求 search_documents，第二輪收工，藉此觸發 runSearchDocuments
  function makeToolAdapter() {
    let round = 0;
    return {
      embed: async () => [0.1, 0.2],
      chatWithTools: async () => {
        round++;
        if (round === 1) return { functionCalls: [{ name: 'search_documents', args: { query: '查 U42' } }], text: null };
        return { functionCalls: [], text: 'ok' };
      },
    };
  }

  const baseStore = project => ({
    listProjects: async () => [project],
    listDocuments: async () => [],
    isEmpty: () => false,
  });

  it('store 有 hybridSearch → 以原始查詢文字 + 向量呼叫，不走 search', async () => {
    const calls = [];
    const store = {
      ...baseStore({ id: 'p1', name: 'P', context: '' }),
      search: async () => { calls.push(['search']); return []; },
      hybridSearch: async (queryText, vector, topK, projectId) => {
        calls.push(['hybrid', queryText, vector, topK, projectId]);
        return [];
      },
    };
    for await (const _ of answer('U42 是什麼', 'p1', makeToolAdapter(), store)) {}
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['hybrid', '查 U42', [0.1, 0.2], 5, 'p1']);
  });

  it('store 無 hybridSearch（舊注入物件）→ fallback 用 search', async () => {
    const calls = [];
    const store = {
      ...baseStore({ id: 'p1', name: 'P', context: '' }),
      search: async (vector, topK, projectId) => { calls.push(['search', vector, topK, projectId]); return []; },
    };
    for await (const _ of answer('U42 是什麼', 'p1', makeToolAdapter(), store)) {}
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['search', [0.1, 0.2], 5, 'p1']);
  });
});
