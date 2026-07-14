require('dotenv').config();
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const SqliteVectorAdapter = require('../src/adapters/vector/sqlite');
const { ingestFolder, phaseFromFolderName, rewriteImageLinks } = require('../src/services/ingestion');
const { buildFileIndex } = require('../src/services/imageLinks');

const mockLLM = {
  async embed() { return new Array(3072).fill(0); },
  async embedBatch(texts) { return texts.map(() => new Array(3072).fill(0)); },
};

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ingfold-'));
  return d;
}

// 建一個「mineru 風格」的來源資料夾：原始 PDF + 多 md + images/
function makeSourceFolder(name, { withImages = true, withPdf = true } = {}) {
  const root = tmpDir();
  const folder = path.join(root, name);
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'overview.md'),
    `# 總覽\n\n這是總覽，含圖 ![圖一](images/fig1.jpg)。\n\n外部圖 ![x](http://e.com/a.png) 與絕對圖 ![y](/already/abs.png) 不該被改。`);
  fs.writeFileSync(path.join(folder, 'detail.md'), `# 細節\n\n細節內容。`);
  if (withPdf) fs.writeFileSync(path.join(folder, 'source.pdf'), 'PDFDATA');
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

  it('原始 PDF 一併被持久化（供下載）', async () => {
    const { docsRoot, folder, store } = setup('C560');
    await ingestFolder(folder, { projectId: 'p1', docsRoot, phase: 'C5' }, mockLLM, store);
    assert.ok(fs.existsSync(path.join(docsRoot, 'p1', 'C560', 'source.pdf')), 'PDF 應被複製到持久位置');
  });

  it('缺 PDF → 拒絕進料', async () => {
    const { docsRoot, folder, store } = setup('C560', { withPdf: false });
    await assert.rejects(
      () => ingestFolder(folder, { projectId: 'p1', docsRoot, phase: 'C5' }, mockLLM, store),
      /PDF/,
    );
  });

  it('多於一個 PDF → 拒絕進料', async () => {
    const { docsRoot, folder, store } = setup('C560');
    fs.writeFileSync(path.join(folder, 'extra.pdf'), 'PDF2');
    await assert.rejects(
      () => ingestFolder(folder, { projectId: 'p1', docsRoot, phase: 'C5' }, mockLLM, store),
      /恰好一個/,
    );
  });

  it('Obsidian 風格資料夾（wiki-link + 筆記同名附件夾）→ chunk 內為標準絕對連結', async () => {
    const dbPath = path.join(tmpDir(), 'rag.db'); cleanup.push(path.dirname(dbPath));
    const docsRoot = tmpDir(); cleanup.push(docsRoot);
    const root = tmpDir(); cleanup.push(root);
    const folder = path.join(root, 'C208'); fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'spec.pdf'), 'PDF');
    fs.writeFileSync(path.join(folder, 'Thor Carrier Board.md'),
      '# 方塊圖\n\n![[Thor CB Fig1-1 Block Diagram.jpg]]\n\n說明文字。');
    fs.mkdirSync(path.join(folder, 'Thor Carrier Board'));
    fs.writeFileSync(path.join(folder, 'Thor Carrier Board', 'Thor CB Fig1-1 Block Diagram.jpg'), 'JPG');

    const store = new SqliteVectorAdapter(dbPath);
    await ingestFolder(folder, { projectId: 'p1', docsRoot, phase: 'C2' }, mockLLM, store);

    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const all = db.prepare('SELECT content FROM chunks').all().map(r => r.content).join('\n');
    db.close();
    assert.ok(all.includes('![](/documents/p1/C208/Thor%20Carrier%20Board/Thor%20CB%20Fig1-1%20Block%20Diagram.jpg)'), all);
    assert.ok(!all.includes('![['), 'chunk 不應殘留 wiki-link');
  });
});

describe('buildFileIndex', () => {
  const cleanup = [];
  afterEach(() => { for (const p of cleanup.splice(0)) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} } });

  it('遞迴子資料夾、略過 md、同名取第一', () => {
    const root = tmpDir(); cleanup.push(root);
    fs.writeFileSync(path.join(root, 'note.md'), '# x');
    fs.writeFileSync(path.join(root, 'top.pdf'), 'PDF');
    fs.mkdirSync(path.join(root, 'a sub'));
    fs.writeFileSync(path.join(root, 'a sub', 'fig.jpg'), '1');
    fs.mkdirSync(path.join(root, 'z sub'));
    fs.writeFileSync(path.join(root, 'z sub', 'fig.jpg'), '2');

    const idx = buildFileIndex(root);
    assert.equal(idx.get('top.pdf'), 'top.pdf');
    assert.equal(idx.get('fig.jpg'), 'a sub/fig.jpg', '同名檔取排序後第一個');
    assert.ok(!idx.has('note.md'), '略過 md');
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

  it('Obsidian wiki-link → 以 fileIndex 解析子路徑並逐段編碼', () => {
    const idx = new Map([['Thor CB Fig1-1 Block Diagram.jpg', 'Thor Carrier Board/Thor CB Fig1-1 Block Diagram.jpg']]);
    const out = rewriteImageLinks('前文 ![[Thor CB Fig1-1 Block Diagram.jpg]] 後文', 'p1', 'C208', idx);
    assert.ok(out.includes('![](/documents/p1/C208/Thor%20Carrier%20Board/Thor%20CB%20Fig1-1%20Block%20Diagram.jpg)'), out);
    assert.ok(!out.includes('![['), '不應殘留 wiki-link');
  });

  it('wiki-link 含 |alt → alt 保留、路徑正確', () => {
    const idx = new Map([['fig.jpg', 'attach/fig.jpg']]);
    const out = rewriteImageLinks('![[fig.jpg|方塊圖]]', 'p1', 'D1', idx);
    assert.equal(out, '![方塊圖](/documents/p1/D1/attach/fig.jpg)');
  });

  it('wiki-link 未命中 / 未傳 fileIndex → 保留原樣不杜撰', () => {
    const idx = new Map();
    assert.equal(rewriteImageLinks('![[missing.jpg]]', 'p1', 'D1', idx), '![[missing.jpg]]');
    assert.equal(rewriteImageLinks('![[any.jpg]]', 'p1', 'D1'), '![[any.jpg]]');
  });

  it('標準語法與 wiki-link 混用 → 各自改寫互不影響', () => {
    const idx = new Map([['b.jpg', 'sub/b.jpg']]);
    const out = rewriteImageLinks('![](images/a.jpg) 與 ![[b.jpg]]', 'p1', 'D1', idx);
    assert.ok(out.includes('![](/documents/p1/D1/images/a.jpg)'));
    assert.ok(out.includes('![](/documents/p1/D1/sub/b.jpg)'));
  });
});
