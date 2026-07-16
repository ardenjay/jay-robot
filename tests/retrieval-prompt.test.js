const os = require('os');
const fs = require('fs');
const path = require('path');

// retrieval 在 require 時會載入 llm / vector 單例：llm 用 mock 免 API key，
// cwd 切到 temp 目錄讓 vector 單例落在 throwaway DB，不碰真實 data/rag.db。
process.env.LLM_ADAPTER = 'mock';
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'retrieval-prompt-')));

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { answer, shouldForceDocSearch, boostRowsByFirstCell } = require('../src/services/retrieval');

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

  it('用了 netlist 但全部 miss、從未查文件 → 強制代跑一次 search_documents,模型依文件重答', async () => {
    // 測試環境 netlist fixture 不可用(測試檔已 chdir 到 temp),netlist 呼叫一律回 ok:false→miss;
    // 藉此觸發「用了 netlist 全 miss」路徑,不需真實 netlist。
    let round = 0;
    const searchCalls = [];
    const adapter = {
      embed: async () => [0.5],
      chatWithTools: async (contents) => {
        round++;
        if (round === 1) return { functionCalls: [{ name: 'netlist_net', args: { netname: 'TSMC CN34' } }], text: null };
        const hasForcedDoc = contents.some(c => c.role === 'function'
          && c.parts.some(p => p.functionResponse && p.functionResponse.name === 'search_documents'));
        return { functionCalls: [], text: hasForcedDoc ? '依文件作答:i2c control' : '查無此 net' };
      },
    };
    const store = {
      listProjects: async () => [{ id: 'p1', name: 'P', context: '' }],
      listDocuments: async () => [],
      isEmpty: () => false,
      search: async (...a) => { searchCalls.push(a); return [{ docId: 'C430 TSMC.md', title: 't', text: 'CN34 i2c control' }]; },
    };
    const events = [];
    for await (const e of answer('TSMC CN34 這條線做什麼', 'p1', adapter, store)) events.push(e);
    assert.equal(searchCalls.length, 1, 'netlist 全 miss 應強制代跑一次文件檢索');
    const toolEvents = events.filter(e => e.type === 'tool');
    assert.deepEqual(toolEvents.map(t => t.name), ['netlist_net', 'search_documents']);
    assert.equal(events.find(e => e.type === 'token').value, '依文件作答:i2c control');
    assert.deepEqual(events.find(e => e.type === 'sources').value.map(s => s.docId), ['C430 TSMC.md']);
  });
});

describe('shouldForceDocSearch 決策分支', () => {
  const base = { hasDocs: true, usedDocSearch: false, forcedSearch: false, usedAnyTool: false, netlistCalls: 0, netlistMisses: 0 };

  it('零工具就作答 → 強制', () => {
    assert.equal(shouldForceDocSearch({ ...base }), true);
  });
  it('用了 netlist 且全部 miss → 強制', () => {
    assert.equal(shouldForceDocSearch({ ...base, usedAnyTool: true, netlistCalls: 2, netlistMisses: 2 }), true);
  });
  it('netlist 有一次命中(非全 miss) → 不強制', () => {
    assert.equal(shouldForceDocSearch({ ...base, usedAnyTool: true, netlistCalls: 2, netlistMisses: 1 }), false);
  });
  it('已成功查過文件 → 不強制', () => {
    assert.equal(shouldForceDocSearch({ ...base, usedAnyTool: true, usedDocSearch: true, netlistCalls: 1, netlistMisses: 1 }), false);
  });
  it('已強制過一次 → 不再強制', () => {
    assert.equal(shouldForceDocSearch({ ...base, forcedSearch: true }), false);
  });
  it('專案無文件 → 不強制', () => {
    assert.equal(shouldForceDocSearch({ ...base, hasDocs: false }), false);
  });
  it('用了 netlist 但一次也沒 miss(全命中) → 不強制', () => {
    assert.equal(shouldForceDocSearch({ ...base, usedAnyTool: true, netlistCalls: 1, netlistMisses: 0 }), false);
  });
  it('netlist 有命中但最終放棄(givingUp)且未查文件 → 強制', () => {
    assert.equal(shouldForceDocSearch({ ...base, usedAnyTool: true, netlistCalls: 2, netlistMisses: 1, givingUp: true }), true);
  });
  it('放棄但已查過文件 → 不強制(避免迴圈)', () => {
    assert.equal(shouldForceDocSearch({ ...base, usedAnyTool: true, usedDocSearch: true, givingUp: true }), false);
  });
  it('放棄但已強制過 → 不再強制', () => {
    assert.equal(shouldForceDocSearch({ ...base, forcedSearch: true, givingUp: true }), false);
  });
});

describe('專案背景作為檢索結果首個 chunk', () => {
  function run(context) {
    let round = 0;
    const capture = {};
    const adapter = {
      embed: async () => [0.5],
      chatWithTools: async (contents) => {
        round++;
        capture.contents = contents;
        if (round === 1) return { functionCalls: [{ name: 'search_documents', args: { query: 'SoC' } }], text: null };
        return { functionCalls: [], text: '答案' };
      },
    };
    const store = {
      listProjects: async () => [{ id: 'p1', name: 'P', context }],
      listDocuments: async () => [],
      isEmpty: () => false,
      search: async () => [{ docId: 'C208', title: 't', text: 'Host SoC' }],
    };
    return { adapter, store, capture };
  }

  it('context 非空 → 工具結果首個 chunk 為背景(docId null),真實 chunks 照舊,sources 不含背景', async () => {
    const { adapter, store, capture } = run('SoC = Jetson T5000');
    const events = [];
    for await (const e of answer('用哪顆 SoC', 'p1', adapter, store)) events.push(e);

    const fnResp = capture.contents.find(c => c.role === 'function').parts[0].functionResponse.response;
    assert.equal(fnResp.chunk_count, 2);
    assert.equal(fnResp.chunks[0].title, '專案背景(使用者提供,可信事實)');
    assert.equal(fnResp.chunks[0].text, 'SoC = Jetson T5000');
    assert.equal(fnResp.chunks[0].docId, null);
    assert.equal(fnResp.chunks[1].docId, 'C208');
    assert.deepEqual(events.find(e => e.type === 'sources').value.map(s => s.docId), ['C208'], '背景不列入來源');
  });

  it('context 為空 → 工具結果不含背景 chunk', async () => {
    const { adapter, store, capture } = run('');
    for await (const _ of answer('用哪顆 SoC', 'p1', adapter, store)) {}
    const fnResp = capture.contents.find(c => c.role === 'function').parts[0].functionResponse.response;
    assert.equal(fnResp.chunk_count, 1);
    assert.equal(fnResp.chunks[0].docId, 'C208');
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
    assert.deepEqual(calls[0], ['hybrid', '查 U42', [0.1, 0.2], 25, 'p1'], 'rerank 池應大於 TOP_K');
  });

  it('store 無 hybridSearch（舊注入物件）→ fallback 用 search', async () => {
    const calls = [];
    const store = {
      ...baseStore({ id: 'p1', name: 'P', context: '' }),
      search: async (vector, topK, projectId) => { calls.push(['search', vector, topK, projectId]); return []; },
    };
    for await (const _ of answer('U42 是什麼', 'p1', makeToolAdapter(), store)) {}
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['search', [0.1, 0.2], 25, 'p1'], 'rerank 池應大於 TOP_K');
  });

  it('中文查詢 + adapter 有 generate → 原查詢與英文查詢各檢索一次,聯集去重', async () => {
    const hybridCalls = [];
    let round = 0;
    const store = {
      ...baseStore({ id: 'p1', name: 'P', context: '' }),
      hybridSearch: async (queryText) => {
        hybridCalls.push(queryText);
        // 兩個 variant 各回一個 chunk,其中 id=9 在兩邊都出現(測去重)
        if (queryText === 'U42 是什麼零件') return [{ id: 1, docId: 'A', title: 'a', text: 'x' }, { id: 9, docId: 'C', title: 'c', text: 'z' }];
        return [{ id: 9, docId: 'C', title: 'c', text: 'z' }, { id: 2, docId: 'B', title: 'b', text: 'y' }];
      },
    };
    let fnResp;
    const adapter = {
      embed: async () => [0.1, 0.2],
      generate: async () => 'what part is U42', // 英文翻譯
      chatWithTools: async (contents) => {
        round++;
        if (round === 1) return { functionCalls: [{ name: 'search_documents', args: { query: 'U42 是什麼零件' } }], text: null };
        const fn = contents.find(c => c.role === 'function');
        if (fn) fnResp = fn.parts[0].functionResponse.response;
        return { functionCalls: [], text: 'ok' };
      },
    };
    for await (const _ of answer('U42 是什麼零件', 'p1', adapter, store)) {}
    assert.deepEqual(hybridCalls, ['U42 是什麼零件', 'what part is U42'], '原查詢與英文查詢各檢索一次');
    // 聯集去重:id 1,9,2（9 只出現一次）
    assert.deepEqual(fnResp.chunks.map(c => c.docId), ['A', 'C', 'B'], 'round-robin 合併且 id=9 去重一次');
  });
});

describe('sidecar 表格列有界注入', () => {
  // 共用 mock：hybrid 回 2 個主池 chunk；searchTableRows 由各測試指定
  function makeStore(rows) {
    return {
      listProjects: async () => [{ id: 'p1', name: 'P', context: '' }],
      isEmpty: () => false,
      listDocuments: async () => [],
      hybridSearch: async () => [
        { id: 1, docId: 'A', title: 'a', text: '主池甲', distance: 0.3 },
        { id: 2, docId: 'B', title: 'b', text: '主池乙', distance: 0.4 },
      ],
      searchTableRows: async () => rows,
    };
  }
  function makeAdapter(capture) {
    let round = 0;
    return {
      embed: async () => [0.1, 0.2],
      generate: async () => 'en query',
      chatWithTools: async (contents) => {
        round++;
        if (round === 1) return { functionCalls: [{ name: 'search_documents', args: { query: 'pin1 是什麼' } }], text: null };
        const fn = contents.find(c => c.role === 'function');
        if (fn) capture.resp = fn.parts[0].functionResponse.response;
        return { functionCalls: [], text: 'ok' };
      },
    };
  }

  it('過門檻的列被「附加」進池:主池候選一個不少,列限量 ≤2', async () => {
    const rows = [
      { id: 'tr1', docId: 'D', title: 't1', text: 'Pin | 1 | VIN', firstCell: '1', similarity: 0.72 },
      { id: 'tr2', docId: 'D', title: 't2', text: 'Pin | 2 | GND', firstCell: '2', similarity: 0.70 },
      { id: 'tr3', docId: 'D', title: 't3', text: 'Pin | 3 | CAN', firstCell: '3', similarity: 0.68 },
    ];
    const capture = {};
    for await (const _ of answer('pin1 是什麼', 'p1', makeAdapter(capture), makeStore(rows))) {}
    const texts = capture.resp.chunks.map(c => c.text);
    assert.ok(texts.includes('主池甲') && texts.includes('主池乙'), '主池候選仍在(附加不替換)');
    const injected = texts.filter(t => t.startsWith('Pin |'));
    assert.equal(injected.length, 2, '注入上限 2');
    assert.ok(injected.includes('Pin | 1 | VIN'), '字面加成:firstCell=1 吻合查詢 pin1 優先注入');
  });

  it('全部列低於門檻 → 一列都不注入,行為與現狀相同', async () => {
    const rows = [
      { id: 'tr1', docId: 'D', title: 't1', text: 'Pin | 1 | VIN', firstCell: '1', similarity: 0.55 },
    ];
    const capture = {};
    for await (const _ of answer('pin1 是什麼', 'p1', makeAdapter(capture), makeStore(rows))) {}
    assert.deepEqual(capture.resp.chunks.map(c => c.text), ['主池甲', '主池乙'], '無注入');
  });

  it('store 不支援 searchTableRows(舊注入物件)→ 零行為差異', async () => {
    const store = makeStore([]);
    delete store.searchTableRows;
    const capture = {};
    for await (const _ of answer('pin1 是什麼', 'p1', makeAdapter(capture), store)) {}
    assert.deepEqual(capture.resp.chunks.map(c => c.text), ['主池甲', '主池乙']);
  });
});

describe('boostRowsByFirstCell 字面加成', () => {
  it('查詢數字與列首格全等者優先;不增列、只重排', () => {
    const rows = [
      { firstCell: '13', similarity: 0.70, text: 'pin13' },
      { firstCell: '3', similarity: 0.65, text: 'pin3' },
    ];
    const out = boostRowsByFirstCell('接頭的 pin3、pin4 是什麼?', rows);
    assert.equal(out[0].text, 'pin3', '首格=3 全等命中,勝過 cos 較高的 13(數字須全等,13≠3)');
    assert.equal(out.length, 2);
  });

  it('字母 token 用包含比對(IP ⊂ IP-rating)', () => {
    const rows = [
      { firstCell: 'Powerconsumption', similarity: 0.70, text: 'power' },
      { firstCell: 'IP-rating', similarity: 0.66, text: 'ip' },
    ];
    const out = boostRowsByFirstCell('MTi-680G 的 IP 防護等級是多少?', rows);
    assert.equal(out[0].text, 'ip');
  });

  it('無吻合時維持 cos 排序', () => {
    const rows = [
      { firstCell: 'Height', similarity: 0.66, text: 'h' },
      { firstCell: 'Weight', similarity: 0.70, text: 'w' },
    ];
    const out = boostRowsByFirstCell('重量是多少克?', rows);
    assert.equal(out[0].text, 'w');
  });
});
