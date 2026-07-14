const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TRANSFER_LIST, parseTarget, buildRsyncArgs, checkDocsLayout, expectedDim } = require('../scripts/lib/migrate-core');

describe('parseTarget', () => {
  it('合法 user@host 解析成功', () => {
    assert.deepEqual(parseTarget('jay@172.24.1.11'), { user: 'jay', host: '172.24.1.11', target: 'jay@172.24.1.11' });
  });

  it('非法格式回 null', () => {
    for (const bad of ['', 'no-at-sign', 'a@b@c', 'user@', '@host', 'user@host; rm -rf /']) {
      assert.equal(parseTarget(bad), null, `"${bad}" 應該不合法`);
    }
  });
});

describe('buildRsyncArgs', () => {
  const item = TRANSFER_LIST[1]; // public/documents/

  it('來源必定帶結尾斜線（巢狀坑的根治點）', () => {
    const args = buildRsyncArgs('u@h', '/data/work/jay-robot', item);
    const src = args[args.length - 2];
    assert.equal(src, 'u@h:/data/work/jay-robot/public/documents/');
    assert.ok(src.endsWith('/'), '來源沒有結尾斜線會巢狀');
  });

  it('遠端路徑本身帶多餘斜線也只補一個', () => {
    const args = buildRsyncArgs('u@h', '/remote/path/', item);
    assert.equal(args[args.length - 2], 'u@h:/remote/path/public/documents/');
  });

  it('dry-run 加 -n；netlist 項帶 *.py 排除', () => {
    const netlist = TRANSFER_LIST.find(i => i.srcRel.startsWith('tools/netlist'));
    const args = buildRsyncArgs('u@h', '/p', netlist, { dryRun: true });
    assert.ok(args.includes('-n'));
    assert.ok(args.includes('--exclude=*.py'), 'netparse.py 是版控程式碼，不能被來源機蓋掉');
  });

  it('搬運清單不含 .env、uploads、incoming', () => {
    const rels = TRANSFER_LIST.map(i => i.srcRel);
    assert.deepEqual(rels, ['data/', 'public/documents/', 'tools/netlist/']);
  });
});

describe('checkDocsLayout', () => {
  const tmps = [];
  afterEach(() => { for (const p of tmps.splice(0)) fs.rmSync(p, { recursive: true, force: true }); });

  function makeTree(children) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
    tmps.push(root);
    for (const c of children) fs.mkdirSync(path.join(root, c), { recursive: true });
    return root;
  }

  it('第一層是 projectId 目錄 → 通過', () => {
    const root = makeTree(['f9260d48-7801-42b3-8f52-853f1ee1b563', '429aba8a-c1b1-443d-93b2-77ce4e99255b']);
    assert.equal(checkDocsLayout(root).ok, true);
  });

  it('含巢狀 documents/ → 報錯並附 mv 修復指令', () => {
    const root = makeTree(['documents/f9260d48-7801-42b3-8f52-853f1ee1b563']);
    const r = checkDocsLayout(root);
    assert.equal(r.ok, false);
    assert.match(r.error, /巢狀/);
    assert.match(r.fix, /^mv /);
  });

  it('目錄不存在 → 視為通過（沒有文件的新機器）', () => {
    assert.equal(checkDocsLayout('/nonexistent/docs').ok, true);
  });
});

describe('expectedDim', () => {
  it('gemini（含預設）→ 3072', () => {
    assert.equal(expectedDim({}), 3072);
    assert.equal(expectedDim({ LLM_ADAPTER: 'gemini' }), 3072);
  });

  it('ollama + bge-m3（含預設）→ 1024', () => {
    assert.equal(expectedDim({ LLM_ADAPTER: 'ollama' }), 1024);
    assert.equal(expectedDim({ LLM_ADAPTER: 'ollama', OLLAMA_EMBED_MODEL: 'bge-m3:latest' }), 1024);
  });

  it('未知模型／adapter → null（跳過檢查）', () => {
    assert.equal(expectedDim({ LLM_ADAPTER: 'ollama', OLLAMA_EMBED_MODEL: 'nomic-embed-text' }), null);
    assert.equal(expectedDim({ LLM_ADAPTER: 'mock' }), null);
  });
});
