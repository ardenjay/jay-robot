const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const SqliteVectorAdapter = require('../src/adapters/vector/sqlite');

function tmpDb() {
  return path.join(os.tmpdir(), `rag-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function makeVec(seed, dims = 16) {
  return Array.from({ length: dims }, (_, i) => (i === seed % dims ? 1.0 : 0.0));
}

describe('vector adapter', () => {
  const dbs = [];

  afterEach(() => {
    for (const p of dbs.splice(0)) {
      try { fs.unlinkSync(p); } catch {}
    }
  });

  it('add 兩個不同向量，search 回傳最相似的那個', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const adapter = new SqliteVectorAdapter(dbPath);
    await adapter._ready;

    const vecA = makeVec(0);
    const vecB = makeVec(1);
    await adapter.add([
      { docId: 'doc.md', title: 'A', text: 'chunk A', embedding: vecA },
      { docId: 'doc.md', title: 'B', text: 'chunk B', embedding: vecB },
    ]);

    const results = await adapter.search(vecA, 2);
    assert.equal(results[0].title, 'A', '最相似的應該是 A');
  });

  it('clear 後 isEmpty 為 true，search 回傳空陣列', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const adapter = new SqliteVectorAdapter(dbPath);
    await adapter._ready;

    await adapter.add([
      { docId: 'doc.md', title: 'A', text: 'chunk A', embedding: makeVec(0) },
    ]);
    assert.equal(adapter.isEmpty(), false);

    await adapter.clear('doc.md');
    assert.equal(adapter.isEmpty(), true);

    const results = await adapter.search(makeVec(0), 5);
    assert.equal(results.length, 0);
  });

  it('clear 再 add 同一 docId，search 只回傳新 chunks', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const adapter = new SqliteVectorAdapter(dbPath);
    await adapter._ready;

    await adapter.add([
      { docId: 'doc.md', title: '舊標題', text: '舊內容', embedding: makeVec(0) },
    ]);
    await adapter.clear('doc.md');
    await adapter.add([
      { docId: 'doc.md', title: '新標題', text: '新內容', embedding: makeVec(0) },
    ]);

    const results = await adapter.search(makeVec(0), 5);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, '新標題');
  });
});
