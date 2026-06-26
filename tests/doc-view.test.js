const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { resolveDocView, resolveDownload } = require('../src/services/docView');

// 純函式測試：以 temp docsRoot 驗證來源檢視分流，不碰真實 public/ 或 data/rag.db。
describe('resolveDocView', () => {
  const cleanup = [];
  afterEach(() => { for (const p of cleanup.splice(0)) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} } });

  function newRoot() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'docview-')); cleanup.push(d); return d; }

  it('目錄型 docId（folder 進料）→ 回合併的 markdown', () => {
    const root = newRoot();
    const dir = path.join(root, 'p1', 'C560'); fs.mkdirSync(dir, { recursive: true });
    // 持久化 md 原檔內是相對圖連結（mineru 原樣）
    fs.writeFileSync(path.join(dir, 'overview.md'), '# 總覽\n\n![](images/fig1.jpg)');
    fs.writeFileSync(path.join(dir, 'detail.md'), '# 細節');

    const { status, body } = resolveDocView(root, 'p1', 'C560');
    assert.equal(status, 200);
    assert.equal(body.type, 'markdown');
    assert.ok(body.markdown.includes('# 總覽'));
    assert.ok(body.markdown.includes('# 細節'), '應合併多個 md');
    assert.ok(body.markdown.includes('](/documents/p1/C560/images/fig1.jpg)'), '相對圖連結應改寫為絕對');
    assert.ok(!body.markdown.includes('](images/fig1.jpg)'), '不應殘留相對連結');
  });

  it('檔案型 docId（web 原始檔）→ 回 file + url', () => {
    const root = newRoot();
    fs.mkdirSync(path.join(root, 'p1'), { recursive: true });
    fs.writeFileSync(path.join(root, 'p1', 'C560.pdf'), 'PDFDATA');

    const { status, body } = resolveDocView(root, 'p1', 'C560.pdf');
    assert.equal(status, 200);
    assert.equal(body.type, 'file');
    assert.equal(body.url, '/documents/p1/C560.pdf');
  });

  it('不存在 → 404', () => {
    const root = newRoot();
    fs.mkdirSync(path.join(root, 'p1'), { recursive: true });
    const { status } = resolveDocView(root, 'p1', 'nope');
    assert.equal(status, 404);
  });

  it('路徑穿越 → 400', () => {
    const root = newRoot();
    fs.mkdirSync(path.join(root, 'p1'), { recursive: true });
    const { status } = resolveDocView(root, 'p1', '..');
    assert.equal(status, 400);
  });
});

describe('resolveDownload', () => {
  const cleanup = [];
  afterEach(() => { for (const p of cleanup.splice(0)) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} } });
  function newRoot() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-')); cleanup.push(d); return d; }

  it('檔案型 docId → 回該檔', () => {
    const root = newRoot();
    fs.mkdirSync(path.join(root, 'p1'), { recursive: true });
    fs.writeFileSync(path.join(root, 'p1', 'C560.pdf'), 'PDF');
    const r = resolveDownload(root, 'p1', 'C560.pdf');
    assert.equal(r.filename, 'C560.pdf');
    assert.ok(r.filePath.endsWith(path.join('p1', 'C560.pdf')));
  });

  it('目錄型 docId → 回目錄內的 PDF', () => {
    const root = newRoot();
    const dir = path.join(root, 'p1', 'C204'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'doc.md'), '# x');
    fs.writeFileSync(path.join(dir, 'MT1603P.pdf'), 'PDF');
    const r = resolveDownload(root, 'p1', 'C204');
    assert.equal(r.filename, 'MT1603P.pdf');
  });

  it('目錄內無 PDF → null', () => {
    const root = newRoot();
    const dir = path.join(root, 'p1', 'C204'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'doc.md'), '# x');
    assert.equal(resolveDownload(root, 'p1', 'C204'), null);
  });

  it('不存在 / 路徑穿越 → null', () => {
    const root = newRoot();
    fs.mkdirSync(path.join(root, 'p1'), { recursive: true });
    assert.equal(resolveDownload(root, 'p1', 'nope'), null);
    assert.equal(resolveDownload(root, 'p1', '..'), null);
  });
});
