const os = require('os');
const fs = require('fs');
const path = require('path');

// ingestion 在 require 時載入 llm / vector 單例：llm 用 mock 免 API key，
// cwd 切到 temp 讓 vector 單例落在 throwaway DB，不碰真實 data/rag.db。
process.env.LLM_ADAPTER = 'mock';
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-test-')));

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const SqliteVectorAdapter = require('../src/adapters/vector/sqlite');
const { backfillTableRows, ingestFile, SIDECAR_VERSION } = require('../src/services/ingestion');

function tmpDb() {
  return path.join(os.tmpdir(), `rag-bf-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}
function makeVec(seed, dims = 8) {
  return Array.from({ length: dims }, (_, i) => (i === seed % dims ? 1.0 : 0.0));
}
// 假 LLM adapter：embedBatch 回傳固定向量
const okAdapter = { embedBatch: async (texts) => texts.map((_, i) => makeVec(i)) };

const BIG_TABLE_MD = `# 規格\n\nTable 24: System specifications\n\n<table>`
  + `<tr><td></td><td>Min</td><td>Max</td><td>Unit</td></tr>`
  + `<tr><td>Weight</td><td></td><td>8.9</td><td>gram</td></tr>`
  + `<tr><td>Height</td><td></td><td>13.0</td><td>mm</td></tr>`
  + `<tr><td>IP-rating</td><td></td><td>IP68</td><td></td></tr>`
  + `<tr><td>Width</td><td></td><td>31.5</td><td>mm</td></tr>`
  + `</table>`;

describe('DB 版本階梯', () => {
  const dbs = [];
  afterEach(() => { for (const p of dbs.splice(0)) { try { fs.unlinkSync(p); } catch {} } });

  it('全新 DB 啟動後 user_version = 6；重開 no-op 仍為 6', () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const a = new SqliteVectorAdapter(dbPath);
    assert.equal(a.db.pragma('user_version', { simple: true }), 6);
    const b = new SqliteVectorAdapter(dbPath); // 已達版:不重跑任何步驟
    assert.equal(b.db.pragma('user_version', { simple: true }), 6);
  });

  it('v5 舊 DB(如正式機)啟動後升到 6,doc_ingest_meta 就位且 FTS 內容保留', () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const a = new SqliteVectorAdapter(dbPath);
    a.db.exec('DROP TABLE doc_ingest_meta'); // 模擬 v5 時代的 DB
    a.db.pragma('user_version = 5');
    const b = new SqliteVectorAdapter(dbPath);
    assert.equal(b.db.pragma('user_version', { simple: true }), 6);
    assert.doesNotThrow(() => b.getDocSidecarVersion('x.md', 'p1'));
  });
});

describe('per-doc sidecar 版本戳', () => {
  const dbs = [];
  afterEach(() => { for (const p of dbs.splice(0)) { try { fs.unlinkSync(p); } catch {} } });

  it('stamp/get、掃描落後文件、clear 刪戳、rename 帶戳', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const a = new SqliteVectorAdapter(dbPath);
    await a.add([
      { docId: 'a.md', title: 't', text: 'x', embedding: makeVec(0), projectId: 'p1' },
      { docId: 'b.md', title: 't', text: 'y', embedding: makeVec(1), projectId: 'p1' },
    ]);
    assert.equal(a.getDocSidecarVersion('a.md', 'p1'), 0);
    a.stampDocSidecarVersion('a.md', 'p1', 1);
    assert.equal(a.getDocSidecarVersion('a.md', 'p1'), 1);
    // 只有 b.md 落後
    assert.deepEqual(a.listDocsForSidecarBackfill(1).map(d => d.docId), ['b.md']);
    // rename 帶戳
    await a.renameDocument('p1', 'a.md', 'a2.md');
    assert.equal(a.getDocSidecarVersion('a2.md', 'p1'), 1);
    // clear 刪戳
    await a.clear('a2.md', 'p1');
    assert.equal(a.getDocSidecarVersion('a2.md', 'p1'), 0);
  });

  it('clearTableRowsOnly 只清列不動 chunks', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const a = new SqliteVectorAdapter(dbPath);
    await a.add([{ docId: 'a.md', title: 't', text: 'x', embedding: makeVec(0), projectId: 'p1' }]);
    await a.addTableRows([{ docId: 'a.md', title: 't', text: 'r', firstCell: 'r', embedding: makeVec(1), projectId: 'p1' }]);
    a.clearTableRowsOnly('a.md', 'p1');
    assert.equal((await a.searchTableRows(makeVec(1), 5, 'p1')).length, 0);
    assert.equal((await a.search(makeVec(0), 5, 'p1')).length, 1, 'chunks 不受影響');
  });

  it('ingestFile 進料完成蓋戳(含 0 sidecar 列的文件)', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const a = new SqliteVectorAdapter(dbPath);
    const mdPath = path.join(os.tmpdir(), `bf-plain-${Date.now()}.md`);
    fs.writeFileSync(mdPath, '# 章\n\n純文字,沒有表格。');
    try {
      await ingestFile(mdPath, 'plain.md', 'p1', 'C2', okAdapter, a);
      assert.equal(a.getDocSidecarVersion('plain.md', 'p1'), SIDECAR_VERSION, '0 列也要蓋戳');
      assert.deepEqual(a.listDocsForSidecarBackfill(SIDECAR_VERSION), [], '不會被回填重掃');
    } finally { fs.unlinkSync(mdPath); }
  });
});

describe('backfillTableRows 啟動回填', () => {
  const dbs = [];
  const tmps = [];
  afterEach(() => {
    for (const p of dbs.splice(0)) { try { fs.unlinkSync(p); } catch {} }
    for (const p of tmps.splice(0)) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
  });

  // 建一個含 chunks(未蓋戳)的 DB + docsRoot 佈局
  async function setup({ folderLayout = true, docId = 'C204 MTi', md = BIG_TABLE_MD } = {}) {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const store = new SqliteVectorAdapter(dbPath);
    await store.add([{ docId, title: 't', text: 'chunk 原文', embedding: makeVec(0), projectId: 'p1' }]);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-root-')); tmps.push(root);
    if (folderLayout) {
      const dir = path.join(root, 'p1', docId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'spec.md'), md);
    } else {
      fs.mkdirSync(path.join(root, 'p1'), { recursive: true });
      fs.writeFileSync(path.join(root, 'p1', docId), md);
    }
    return { store, root, docId };
  }

  it('資料夾佈局:回填填列+蓋戳;第二次跑 no-op;chunks/FTS 位元不變', async () => {
    const { store, root, docId } = await setup();
    const chunksBefore = store.db.prepare('SELECT * FROM chunks').all();
    const r1 = await backfillTableRows(store, okAdapter, root);
    assert.equal(r1.done, 1);
    const rows = await store.searchTableRows(makeVec(0), 10, 'p1');
    assert.equal(rows.length, 4, '4 個 body 列');
    assert.ok(rows.some(r => r.text.includes('8.9')));
    assert.ok(rows[0].title.startsWith('spec.md'), 'title 帶 md 檔名前綴:' + rows[0].title);
    assert.equal(store.getDocSidecarVersion(docId, 'p1'), SIDECAR_VERSION);
    assert.deepEqual(store.db.prepare('SELECT * FROM chunks').all(), chunksBefore, 'chunks 不變');
    const r2 = await backfillTableRows(store, okAdapter, root);
    assert.deepEqual(r2, { done: 0, skipped: 0 }, '冪等:第二次 no-op');
  });

  it('單檔佈局(.md)也回填', async () => {
    const { store, root, docId } = await setup({ folderLayout: false, docId: 'spec.md' });
    const r = await backfillTableRows(store, okAdapter, root);
    assert.equal(r.done, 1);
    assert.equal((await store.searchTableRows(makeVec(0), 10, 'p1')).length, 4);
  });

  it('轉檔類單檔(.docx)有 sibling md → 以 sibling 回填並蓋戳', async () => {
    const { store, root, docId } = await setup({ folderLayout: false, docId: 'spec.docx', md: '原檔佔位(非md內容)' });
    // 模擬 upload 路徑持久化的轉檔 md sibling:<docId>.md
    fs.writeFileSync(path.join(root, 'p1', `${docId}.md`), BIG_TABLE_MD);
    const r = await backfillTableRows(store, okAdapter, root);
    assert.equal(r.done, 1);
    assert.equal(r.skipped, 0);
    assert.equal((await store.searchTableRows(makeVec(0), 10, 'p1')).length, 4);
    assert.equal(store.getDocSidecarVersion(docId, 'p1'), SIDECAR_VERSION);
  });

  it('非 .md 原始檔(單檔 .docx)跳過且不蓋戳', async () => {
    const { store, root, docId } = await setup({ folderLayout: false, docId: 'spec.docx' });
    const r = await backfillTableRows(store, okAdapter, root);
    assert.equal(r.done, 0);
    assert.equal(r.skipped, 1);
    assert.equal(store.getDocSidecarVersion(docId, 'p1'), 0, '不蓋戳(重新上傳後才處理)');
  });

  it('embed 失敗:不拋錯、不蓋戳,下次可續跑', async () => {
    const { store, root, docId } = await setup();
    const badAdapter = { embedBatch: async () => { throw new Error('Ollama down'); } };
    const r = await backfillTableRows(store, badAdapter, root); // 不應 throw
    assert.equal(r.done, 0);
    assert.equal(store.getDocSidecarVersion(docId, 'p1'), 0);
    // Ollama 恢復後續跑成功
    const r2 = await backfillTableRows(store, okAdapter, root);
    assert.equal(r2.done, 1);
  });
});
