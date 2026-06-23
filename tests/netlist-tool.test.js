const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hasNetlist,
  netlistDir,
  queryPart,
  queryTrace,
  runNetlistTool,
  NETLIST_TOOL_DECLARATIONS,
} = require('../src/services/netlist');

// 唯讀地對 tools/netlist/100T 測試；不觸碰 data/rag.db。
describe('netlist tool service', () => {
  it('resolves a project that has a netlist folder', () => {
    assert.equal(hasNetlist('100T'), true, '100T 應有 netlist');
    assert.ok(netlistDir('100T'), 'netlistDir(100T) 應回傳路徑');
  });

  it('returns no netlist for an unknown project', () => {
    assert.equal(hasNetlist('no-such-board'), false);
    assert.equal(netlistDir('no-such-board'), null);
  });

  it('part U42 returns structured pins with correct ground-truth net', async () => {
    const r = await queryPart('100T', 'U42');
    assert.equal(r.ok, true);
    assert.equal(r.result.found, true);
    const pin4 = r.result.pins.find(p => p.pin === '4');
    assert.equal(pin4.net, 'RTL5G1_LANWAKEB', 'U42.4 net 真值');
  });

  it('unknown refdes is a graceful not-found, not a throw', async () => {
    const r = await queryPart('100T', 'U99999');
    assert.equal(r.ok, true, '執行成功');
    assert.equal(r.result.found, false, 'found:false 而非錯誤');
  });

  it('querying a project without netlist returns ok:false', async () => {
    const r = await queryPart('no-such-board', 'U42');
    assert.equal(r.ok, false);
    assert.match(r.error, /netlist/);
  });

  it('trace returns structured paths', async () => {
    const r = await queryTrace('100T', 'U42.4', true);
    assert.equal(r.ok, true);
    assert.equal(r.result.found, true);
    assert.ok(Array.isArray(r.result.paths));
  });

  it('runNetlistTool dispatches by tool name', async () => {
    const r = await runNetlistTool('100T', 'netlist_part', { refdes: 'U42' });
    assert.equal(r.ok, true);
    assert.equal(r.result.refdes, 'U42');
  });

  it('exposes tool declarations for the LLM', () => {
    const names = NETLIST_TOOL_DECLARATIONS.map(d => d.name);
    assert.ok(names.includes('netlist_part'));
    assert.ok(names.includes('netlist_trace'));
  });
});
