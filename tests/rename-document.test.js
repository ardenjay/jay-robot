const os = require('os');
const fs = require('fs');
const path = require('path');

// cwd 切到 temp 再 require：vector 單例與 DOCS_ROOT(public/documents)都落在 throwaway 目錄。
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rename-doc-'));
process.chdir(workDir);

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const projectsRouter = require('../src/routes/projects');
const vectorStore = require('../src/adapters/vector');

const DOCS = path.join(workDir, 'public', 'documents');
let server;
let base;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectsRouter);
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
});

const vec = () => [1, 0, 0];
async function seedDoc(projectId, docId, { persistFile, persistDir } = {}) {
  await vectorStore.add([{ docId, title: 't', text: '內文', embedding: vec(), projectId, phase: 'C1' }]);
  const p = path.join(DOCS, projectId, docId);
  if (persistFile) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'DATA'); }
  if (persistDir) { fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'a.md'), '# x'); }
}

const rename = (proj, docId, newDocId) =>
  fetch(`${base}/api/projects/${encodeURIComponent(proj)}/documents/${encodeURIComponent(docId)}/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newDocId }),
  });

describe('PATCH /:id/documents/:docId/rename', () => {
  afterEach(() => { delete process.env.READ_ONLY; });

  it('檔案型:DB 與持久化檔案一起改名', async () => {
    await seedDoc('p1', 'old.pdf', { persistFile: true });
    const res = await rename('p1', 'old.pdf', 'new name.pdf');
    assert.equal(res.status, 200, await res.clone().text());
    const docs = await vectorStore.listDocuments('p1');
    assert.ok(docs.some(d => d.docId === 'new name.pdf'));
    assert.ok(!docs.some(d => d.docId === 'old.pdf'));
    assert.ok(fs.existsSync(path.join(DOCS, 'p1', 'new name.pdf')));
    assert.ok(!fs.existsSync(path.join(DOCS, 'p1', 'old.pdf')));
  });

  it('目錄型:整個資料夾跟著改名', async () => {
    await seedDoc('p2', 'C208 Old', { persistDir: true });
    const res = await rename('p2', 'C208 Old', 'C208 New');
    assert.equal(res.status, 200);
    assert.ok(fs.existsSync(path.join(DOCS, 'p2', 'C208 New', 'a.md')));
    assert.ok(!fs.existsSync(path.join(DOCS, 'p2', 'C208 Old')));
  });

  it('無持久化來源 → 仍 200,僅更新 DB', async () => {
    await seedDoc('p3', 'db-only.md');
    const res = await rename('p3', 'db-only.md', 'renamed.md');
    assert.equal(res.status, 200);
    assert.ok((await vectorStore.listDocuments('p3')).some(d => d.docId === 'renamed.md'));
  });

  it('撞名 → 409;文件不存在 → 404;非法名稱 → 400;同名 no-op 200', async () => {
    await seedDoc('p4', 'a.md');
    await seedDoc('p4', 'b.md');
    assert.equal((await rename('p4', 'a.md', 'b.md')).status, 409);
    assert.equal((await rename('p4', 'nope.md', 'x.md')).status, 404);
    for (const bad of ['', 'x/y.md', 'x\\y.md', '..', 'a..b']) {
      assert.equal((await rename('p4', 'a.md', bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await rename('p4', 'a.md', 'a.md')).status, 200);
  });

  it('自癒:DB 已是新名、磁碟還在舊名 → 重試只補搬移', async () => {
    await seedDoc('p5', 'final.md');
    // 模擬前次搬移失敗的殘局:磁碟上還是舊名
    const stale = path.join(DOCS, 'p5', 'stale.md');
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, 'DATA');
    const res = await rename('p5', 'stale.md', 'final.md');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).healed, true);
    assert.ok(fs.existsSync(path.join(DOCS, 'p5', 'final.md')));
    assert.ok(!fs.existsSync(stale));
  });

  it('READ_ONLY=true → 403', async () => {
    await seedDoc('p6', 'ro.md');
    process.env.READ_ONLY = 'true';
    assert.equal((await rename('p6', 'ro.md', 'x.md')).status, 403);
  });
});
