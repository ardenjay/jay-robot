require('dotenv').config();
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const SqliteVectorAdapter = require('../src/adapters/vector/sqlite');
const { ingestFile } = require('../src/services/ingestion');

function tmpPath(ext) {
  return path.join(os.tmpdir(), `rag-test-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
}

const mockLLM = {
  async embed() {
    return new Array(3072).fill(0);
  },
};

describe('ingestion pipeline', () => {
  const cleanup = [];

  afterEach(() => {
    for (const p of cleanup.splice(0)) {
      try { fs.unlinkSync(p); } catch {}
    }
  });

  it('ingestFile 回傳正確 chunk 數量，DB 中有對應筆數', async () => {
    const dbPath = tmpPath('.db'); cleanup.push(dbPath);
    const mdPath = tmpPath('.md'); cleanup.push(mdPath);

    fs.writeFileSync(mdPath, `# 第一章\n\n內容一。\n\n## 第二節\n\n內容二。\n\n### 小節\n\n內容三。`);

    const store = new SqliteVectorAdapter(dbPath);
    await store._ready;

    const count = await ingestFile(mdPath, 'test.md', 'proj-test', 'C1', mockLLM, store);
    assert.equal(count, 3, 'ingestFile 應回傳 3');
    assert.equal(store.isEmpty('proj-test'), false);

    const results = await store.search(new Array(3072).fill(0), 10, 'proj-test');
    assert.equal(results.length, 3, 'DB 中應有 3 筆');
  });

  it('同一 docId 重新 ingest，DB 只保留最新的 chunks', async () => {
    const dbPath = tmpPath('.db'); cleanup.push(dbPath);
    const mdPath1 = tmpPath('.md'); cleanup.push(mdPath1);
    const mdPath2 = tmpPath('.md'); cleanup.push(mdPath2);

    fs.writeFileSync(mdPath1, `# 舊章節\n\n舊內容。`);
    fs.writeFileSync(mdPath2, `# 新章節一\n\n新內容一。\n\n## 新章節二\n\n新內容二。`);

    const store = new SqliteVectorAdapter(dbPath);
    await store._ready;

    await ingestFile(mdPath1, 'doc.md', 'proj-test', 'C1', mockLLM, store);
    await ingestFile(mdPath2, 'doc.md', 'proj-test', 'C1', mockLLM, store);

    const results = await store.search(new Array(3072).fill(0), 10, 'proj-test');
    assert.equal(results.length, 2, 'DB 應只有第二次的 2 個 chunks');
    const titles = results.map(r => r.title);
    assert.ok(titles.includes('新章節一'));
    assert.ok(titles.includes('新章節二'));
    assert.ok(!titles.includes('舊章節'), '舊章節不應存在');
  });
});
