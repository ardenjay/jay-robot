const os = require('os');
const fs = require('fs');
const path = require('path');

// cwd 切到 temp + mock LLM 再 require router：vector/llm 單例、uploads/、public/documents
// 全部落在 throwaway 目錄，不碰真實 data/rag.db。（node --test 每檔獨立行程。）
process.env.LLM_ADAPTER = 'mock';
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-upload-test-'));
process.chdir(workDir);

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const uploadRouter = require('../src/routes/upload');
const vectorStore = require('../src/adapters/vector');

let server;
let base;

before(async () => {
  const app = express();
  app.use('/api/upload', uploadRouter);
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
});

// 建 multipart：entries = [[相對路徑, 內容]...]；opts 可帶 phase / overwrite / 省略欄位
function buildForm(entries, opts = {}) {
  const fd = new FormData();
  for (const [rel, content] of entries) {
    fd.append('files', new Blob([content]), path.basename(rel));
    if (!opts.skipPaths) fd.append('paths', rel);
  }
  fd.append('project_id', opts.projectId || 'proj-test');
  if (opts.phase) fd.append('phase', opts.phase);
  if (opts.overwrite) fd.append('overwrite', 'true');
  return fd;
}

const post = fd => fetch(`${base}/api/upload/folder`, { method: 'POST', body: fd });

const GOOD = [
  ['C208 Test/note.md', '# 總覽\n\n內容,含 wiki 圖 ![[圖.jpg]]'],
  ['C208 Test/doc.pdf', 'PDFDATA'],
  ['C208 Test/附件/圖.jpg', 'JPG'],
];

describe('POST /api/upload/folder', () => {
  afterEach(() => { delete process.env.READ_ONLY; });

  it('成功進料:phase 由資料夾名推得,子資料夾圖保留,chunks 進 DB', async () => {
    const res = await post(buildForm(GOOD));
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    const body = await res.json();
    assert.equal(body.docId, 'C208 Test');
    assert.equal(body.mdCount, 1);
    assert.ok(body.chunkCount >= 1);

    // 持久化:整夾含子資料夾複製到 public/documents
    const persisted = path.join(workDir, 'public', 'documents', 'proj-test', 'C208 Test');
    assert.ok(fs.existsSync(path.join(persisted, 'doc.pdf')));
    assert.ok(fs.existsSync(path.join(persisted, '附件', '圖.jpg')));

    // DB 有該 docId(phase C2)
    const docs = await vectorStore.listDocuments('proj-test');
    const d = docs.find(x => x.docId === 'C208 Test');
    assert.ok(d);
    assert.equal(d.phase, 'C2');
  });

  it('同名 docId 未帶 overwrite → 409;帶 overwrite → 整夾替換成功', async () => {
    const r1 = await post(buildForm(GOOD));
    assert.equal(r1.status, 409);
    assert.equal((await r1.json()).docId, 'C208 Test');

    const r2 = await post(buildForm(GOOD, { overwrite: true }));
    assert.equal(r2.status, 200);
  });

  it('缺頂層 PDF → 400', async () => {
    const res = await post(buildForm([['NoPdf/note.md', '# x']], { phase: 'C1' }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /PDF/);
  });

  it('白名單外檔案 → 400 並列出檔名', async () => {
    const res = await post(buildForm([
      ['C209 X/note.md', '# x'],
      ['C209 X/doc.pdf', 'PDF'],
      ['C209 X/.DS_Store', 'junk'],
    ]));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /\.DS_Store/);
  });

  it('路徑穿越 → 400', async () => {
    for (const bad of ['../evil.md', '/abs/evil.md', 'a/../../evil.md']) {
      const res = await post(buildForm([[bad, 'x']], { phase: 'C1' }));
      assert.equal(res.status, 400, bad);
    }
  });

  it('phase 無法解析(資料夾名無 NPDS 代碼且未選)→ 400', async () => {
    const res = await post(buildForm([['MyDocs/note.md', '# x'], ['MyDocs/doc.pdf', 'PDF']]));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /階段/);
  });

  it('paths 與 files 數量不一致 → 400', async () => {
    const res = await post(buildForm([['A1/note.md', '# x']], { skipPaths: true, phase: 'C1' }));
    assert.equal(res.status, 400);
  });

  it('READ_ONLY=true → 403', async () => {
    process.env.READ_ONLY = 'true';
    const res = await post(buildForm(GOOD, { overwrite: true }));
    assert.equal(res.status, 403);
  });
});
