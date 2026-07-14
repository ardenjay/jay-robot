const os = require('os');
const fs = require('fs');
const path = require('path');

// 先把 cwd 切到 temp 目錄再 require router：vector 單例 adapter 以 require 當下的
// process.cwd() 決定 DB 路徑，如此真 router + 真 adapter 都落在 throwaway DB，
// 不碰真實 data/rag.db。（node --test 每個測試檔是獨立行程，不影響其他測試。）
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-ctx-'));
process.chdir(workDir);

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const projectsRouter = require('../src/routes/projects');

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

async function createProject(name) {
  const res = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

async function patchContext(id, body) {
  return fetch(`${base}/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/projects/:id（專案背景說明）', () => {
  afterEach(() => { delete process.env.READ_ONLY; });

  it('更新成功後 GET 帶回 context', async () => {
    const p = await createProject('100T');
    const res = await patchContext(p.id, { context: '100T = EAR-100T7 邊緣運算 Box PC' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });

    const list = await (await fetch(`${base}/api/projects`)).json();
    const got = list.find(x => x.id === p.id);
    assert.equal(got.context, '100T = EAR-100T7 邊緣運算 Box PC');
  });

  it('空字串 = 清除背景', async () => {
    const p = await createProject('P2');
    await patchContext(p.id, { context: '有內容' });
    const res = await patchContext(p.id, { context: '' });
    assert.equal(res.status, 200);
    const list = await (await fetch(`${base}/api/projects`)).json();
    assert.equal(list.find(x => x.id === p.id).context, '');
  });

  it('context 非字串 → 400', async () => {
    const p = await createProject('P3');
    for (const bad of [{}, { context: 123 }, { context: null }]) {
      const res = await patchContext(p.id, bad);
      assert.equal(res.status, 400);
    }
  });

  it('context 超過 4000 字 → 400', async () => {
    const p = await createProject('P4');
    const res = await patchContext(p.id, { context: 'x'.repeat(4001) });
    assert.equal(res.status, 400);
  });

  it('不存在的專案 → 404', async () => {
    const res = await patchContext('no-such-id', { context: 'x' });
    assert.equal(res.status, 404);
  });

  it('READ_ONLY=true → 403 且資料不變', async () => {
    const p = await createProject('P5');
    await patchContext(p.id, { context: '原值' });

    process.env.READ_ONLY = 'true';
    const res = await patchContext(p.id, { context: '不該寫入' });
    assert.equal(res.status, 403);
    delete process.env.READ_ONLY;

    const list = await (await fetch(`${base}/api/projects`)).json();
    assert.equal(list.find(x => x.id === p.id).context, '原值');
  });
});
