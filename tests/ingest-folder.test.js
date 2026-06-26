require('dotenv').config();
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const SqliteVectorAdapter = require('../src/adapters/vector/sqlite');
const { ingestFolder, phaseFromFolderName, rewriteImageLinks } = require('../src/services/ingestion');

const mockLLM = {
  async embed() { return new Array(3072).fill(0); },
  async embedBatch(texts) { return texts.map(() => new Array(3072).fill(0)); },
};

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ingfold-'));
  return d;
}

// 建一個「mineru 風格」的來源資料夾：多 md + images/
function makeSourceFolder(name, { withImages = true } = {}) {
  const root = tmpDir();
  const folder = path.join(root, name);
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'overview.md'),
    `# 總覽\n\n這是總覽，含圖 ![圖一](images/fig1.jpg)。\n\n外部圖 ![x](http://e.com/a.png) 與絕對圖 ![y](/already/abs.png) 不該被改。`);
  fs.writeFileSync(path.join(folder, 'detail.md'), `# 細節\n\n細節內容。`);
  if (withImages) {
    fs.mkdirSync(path.join(folder, 'images'));
    fs.writeFileSync(path.join(folder, 'images', 'fig1.jpg'), 'JPEGDATA');
  }
  return { root, folder };
}

function readChunks(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare('SELECT doc_id, title, content, phase FROM chunks').all();
  db.close();
  return rows;
}

describe('ingestFolder', () => {
  const cleanup = [];
  afterEach(() => { for (const p of cleanup.splice(0)) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} } });

  function setup(name, opts) {
    const dbPath = path.join(tmpDir(), 'rag.db'); cleanup.push(path.dirname(dbPath));
    const docsRoot = tmpDir(); cleanup.push(docsRoot);
    const { root, folder } = makeSourceFolder(name, opts); cleanup.push(root);
    const store = new SqliteVectorAdapter(dbPath);
    return { dbPath, docsRoot, folder, store };
  }

  it('多 md 全歸同一 docId，title 標示來源 md 檔名', async () => {
    const { dbPath, docsRoot, folder, store } = setup('C560');
    const r = await ingestFolder(folder, { projectId: 'p1', docsRoot, phase: 'C5' }, mockLLM, store);

    assert.equal(r.docId, 'C560');
    assert.equal(r.mdCount, 2);
    assert.ok(r.chunkCount >= 2);

    const rows = readChunks(dbPath);
    assert.ok(rows.every(c => c.doc_id === 'C560'), '所有 chunk 應歸 docId C560');
    assert.ok(rows.some(c => c.title.startsWith('overview.md')), 'title 應含來源 overview.md');
    assert.ok(rows.some(c => c.title.startsWith('detail.md')), 'title 應含來源 detail.md');
    assert.ok(rows.every(c => c.phase === 'C5'));
  });

  it('相對圖片連結改寫為絕對路徑，外部/絕對連結不動', async () => {
    const { dbPath, docsRoot, folder, store } = setup('C560');
    await ingestFolder(folder, { projectId: 'p1', docsRoot, phase: 'C5' }, mockLLM, store);

    const all = readChunks(dbPath).map(c => c.content).join('\n');
    assert.ok(all.includes('](/documents/p1/C560/images/fig1.jpg)'), '相對 images/ 連結應改成絕對');
    assert.ok(!all.includes('](images/fig1.jpg)'), '不應再有未改寫的相對連結');
    assert.ok(all.includes('](http://e.com/a.png)'), '外部 URL 不動');
    assert.ok(all.includes('](/already/abs.png)'), '已是絕對路徑不動');
  });

  it('images 複製到 docsRoot/<proj>/<docId>/images/，md 原檔也留', async () => {
    const { docsRoot, folder, store } = setup('C560');
    const r = await ingestFolder(folder, { projectId: 'p1', docsRoot, phase: 'C5' }, mockLLM, store);

    assert.equal(r.imageCount, 1);
    assert.ok(fs.existsSync(path.join(docsRoot, 'p1', 'C560', 'images', 'fig1.jpg')));
    assert.ok(fs.existsSync(path.join(docsRoot, 'p1', 'C560', 'overview.md')));
  });

  it('重複進料同一 docId：整夾替換（舊圖被清掉）', async () => {
    const { docsRoot, folder, store } = setup('C560');
    await ingestFolder(folder, { projectId: 'p1', docsRoot, phase: 'C5' }, mockLLM, store);
    // 偷塞一個舊圖，模擬上一次殘留
    fs.writeFileSync(path.join(docsRoot, 'p1', 'C560', 'images', 'stale.jpg'), 'OLD');
    await ingestFolder(folder, { projectId: 'p1', docsRoot, phase: 'C5' }, mockLLM, store);
    assert.ok(!fs.existsSync(path.join(docsRoot, 'p1', 'C560', 'images', 'stale.jpg')), '殘留舊圖應被整夾替換清掉');
    assert.ok(fs.existsSync(path.join(docsRoot, 'p1', 'C560', 'images', 'fig1.jpg')));
  });

  it('無 images/ 的資料夾仍正常進料', async () => {
    const { docsRoot, folder, store } = setup('C560', { withImages: false });
    const r = await ingestFolder(folder, { projectId: 'p1', docsRoot, phase: 'C5' }, mockLLM, store);
    assert.equal(r.imageCount, 0);
    assert.ok(r.chunkCount >= 2);
  });
});

describe('phaseFromFolderName', () => {
  it('從 NPDS 代碼推 phase', () => {
    assert.equal(phaseFromFolderName('C560'), 'C5');
    assert.equal(phaseFromFolderName('C3081_xxx'), 'C3');
    assert.equal(phaseFromFolderName('C455 EAR-100T'), 'C4');
  });
  it('無代碼回 null', () => {
    assert.equal(phaseFromFolderName('EAR-100T_DS'), null);
    assert.equal(phaseFromFolderName('random_folder'), null);
  });
});

describe('rewriteImageLinks', () => {
  it('只改相對 images/ 連結', () => {
    const out = rewriteImageLinks('![a](images/x.jpg) ![b](http://e/y.png) ![c](/abs/z.png)', 'p1', 'D1');
    assert.ok(out.includes('![a](/documents/p1/D1/images/x.jpg)'));
    assert.ok(out.includes('![b](http://e/y.png)'));
    assert.ok(out.includes('![c](/abs/z.png)'));
  });

  it('docId 含空格 → 路徑 URL 編碼（避免破壞 markdown）', () => {
    const out = rewriteImageLinks('![](images/fig1.jpg)', '100T', 'C204 MTi 600');
    assert.ok(out.includes('![](/documents/100T/C204%20MTi%20600/images/fig1.jpg)'), out);
    assert.ok(!/images\/fig1\.jpg\) /.test(out), '連結內不應殘留原始空格');
  });
});
