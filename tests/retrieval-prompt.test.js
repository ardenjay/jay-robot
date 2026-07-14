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
