const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { blockWhenReadOnly } = require('../src/middleware/readOnly');
const configRouter = require('../src/routes/config');

// 用最小的 throwaway app 驗證唯讀阻擋契約：掛真正的 middleware + config router，
// 但寫入路由用「假 handler」（會回 { wrote: true }）——完全不碰真正的 routers / data/rag.db。
// READ_ONLY 由 middleware 在每次請求時讀取 process.env，所以同一個 app 可切換模式測試。
function buildApp() {
  const app = express();
  app.use(express.json());

  const wrote = (req, res) => res.json({ wrote: true });

  app.post('/api/upload', blockWhenReadOnly, wrote);
  app.post('/api/projects', blockWhenReadOnly, wrote);
  app.patch('/api/projects/:id', blockWhenReadOnly, wrote);
  app.delete('/api/projects/:id/documents/:docId', blockWhenReadOnly, wrote);
  app.patch('/api/projects/:id/documents/:docId/phase', blockWhenReadOnly, wrote);

  // 不掛 middleware 的讀取 / 問答路由
  app.post('/api/chat', (req, res) => res.json({ answer: 'ok' }));
  app.get('/api/projects', (req, res) => res.json([]));

  app.use('/api/config', configRouter);
  return app;
}

let server;
let base;
const ORIGINAL = process.env.READ_ONLY;

before(async () => {
  server = buildApp().listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  if (ORIGINAL === undefined) delete process.env.READ_ONLY;
  else process.env.READ_ONLY = ORIGINAL;
});

const WRITE_REQUESTS = [
  ['POST', '/api/upload'],
  ['POST', '/api/projects'],
  ['PATCH', '/api/projects/p1'],
  ['DELETE', '/api/projects/p1/documents/d1'],
  ['PATCH', '/api/projects/p1/documents/d1/phase'],
];

describe('read-only mode: blocks writes (READ_ONLY=true)', () => {
  beforeEach(() => { process.env.READ_ONLY = 'true'; });
  afterEach(() => { delete process.env.READ_ONLY; });

  for (const [method, path] of WRITE_REQUESTS) {
    it(`${method} ${path} → 403 且無寫入副作用`, async () => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'C2', name: 'x' }),
      });
      assert.equal(res.status, 403, `${method} ${path} 應回 403`);
      const body = await res.json();
      assert.ok(!body.wrote, '假 handler 不應執行（沒有 wrote:true，代表沒有寫入副作用）');
    });
  }
});

describe('read-only mode: reads & chat stay available (READ_ONLY=true)', () => {
  beforeEach(() => { process.env.READ_ONLY = 'true'; });
  afterEach(() => { delete process.env.READ_ONLY; });

  it('POST /api/chat 不被擋（非 403）', async () => {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'hi' }),
    });
    assert.notEqual(res.status, 403);
    assert.equal((await res.json()).answer, 'ok');
  });

  it('GET /api/projects 不被擋（非 403）', async () => {
    const res = await fetch(`${base}/api/projects`);
    assert.notEqual(res.status, 403);
  });
});

describe('read-only mode: writes allowed when disabled (READ_ONLY unset)', () => {
  beforeEach(() => { delete process.env.READ_ONLY; });

  for (const [method, path] of WRITE_REQUESTS) {
    it(`${method} ${path} → 不被擋，handler 正常執行`, async () => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'C2', name: 'x' }),
      });
      assert.notEqual(res.status, 403);
      assert.equal((await res.json()).wrote, true);
    });
  }
});

describe('GET /api/config reflects the mode', () => {
  it('READ_ONLY=true → { readOnly: true }', async () => {
    process.env.READ_ONLY = 'true';
    const res = await fetch(`${base}/api/config`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { readOnly: true });
    delete process.env.READ_ONLY;
  });

  it('READ_ONLY 未設定 → { readOnly: false }', async () => {
    delete process.env.READ_ONLY;
    const res = await fetch(`${base}/api/config`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { readOnly: false });
  });

  it('READ_ONLY=false（字串）→ { readOnly: false }（嚴格比對 true）', async () => {
    process.env.READ_ONLY = 'false';
    const res = await fetch(`${base}/api/config`);
    assert.deepEqual(await res.json(), { readOnly: false });
    delete process.env.READ_ONLY;
  });
});
