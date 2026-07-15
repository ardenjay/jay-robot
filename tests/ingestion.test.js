require('dotenv').config();
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const SqliteVectorAdapter = require('../src/adapters/vector/sqlite');
const { ingestFile, parseAndChunk } = require('../src/services/ingestion');

function tmpPath(ext) {
  return path.join(os.tmpdir(), `rag-test-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
}

const mockLLM = {
  async embed() {
    return new Array(3072).fill(0);
  },
  async embedBatch(texts) {
    return texts.map(() => new Array(3072).fill(0));
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

  it('embedding 輸入含章節路徑 title,DB content 維持純內文', async () => {
    const dbPath = tmpPath('.db'); cleanup.push(dbPath);
    const mdPath = tmpPath('.md'); cleanup.push(mdPath);
    fs.writeFileSync(mdPath, `# 介面\n\n## 通訊\n\n規格表內容。`);

    const embedInputs = [];
    const capturingLLM = {
      async embedBatch(texts) { embedInputs.push(...texts); return texts.map(() => new Array(3072).fill(0)); },
    };
    const store = new SqliteVectorAdapter(dbPath);
    await ingestFile(mdPath, 'spec.md', 'proj-test', 'C1', capturingLLM, store);

    assert.equal(embedInputs.length, 1);
    assert.equal(embedInputs[0], '介面 › 通訊\n規格表內容。', 'embedding 輸入應為 title+換行+內文');
    const [chunk] = await store.search(new Array(3072).fill(0), 1, 'proj-test');
    assert.equal(chunk.text, '規格表內容。', 'content 欄位不應混入 title');
    assert.equal(chunk.title, '介面 › 通訊');
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
    assert.ok(titles.includes('新章節一 › 新章節二'), 'title 為完整章節路徑');
    assert.ok(!titles.includes('舊章節'), '舊章節不應存在');
  });

  it('docx alt-text 免責聲明被剝除，圖片語法保留', () => {
    const md = `# Pin Assignment\n\n![一張含有 文字, 數字, 字型的圖片  AI 產生的內容可能不正確。](data:image/png;base64,AAA)\n\n其他正文內容。`;
    const [chunk] = parseAndChunk(md, 'test.docx');
    assert.ok(!chunk.text.includes('AI 產生的內容可能不正確'), '免責聲明不應出現在 chunk 內容');
    assert.ok(chunk.text.includes('![一張含有 文字, 數字, 字型的圖片](data:image/png;base64,AAA)'), '圖片語法應保留');
    assert.ok(chunk.text.includes('其他正文內容。'), '其他正文不受影響');
  });

  it('同一 chunk 含多張圖片、免責聲明重複多次，全部移除', () => {
    const md = [
      '# Connectors',
      '![圖1  AI 產生的內容可能不正確。](data:image/png;base64,A)',
      '![圖2  AI 產生的內容可能不正確。](data:image/png;base64,B)',
      '![圖3  AI 產生的內容可能不正確。](data:image/png;base64,C)',
    ].join('\n\n');
    const [chunk] = parseAndChunk(md, 'test.docx');
    assert.equal((chunk.text.match(/AI 產生的內容可能不正確/g) || []).length, 0, '重複出現的免責聲明應全部移除');
    assert.ok(chunk.text.includes('圖1') && chunk.text.includes('圖2') && chunk.text.includes('圖3'), '其他描述文字保留');
  });

  it('alt-text 只有樣板文字、沒有其他描述時同樣正確移除', () => {
    const md = `# Cover\n\n![AI 產生的內容可能不正確。](data:image/png;base64,A)`;
    const [chunk] = parseAndChunk(md, 'test.docx');
    assert.ok(!chunk.text.includes('AI 產生的內容可能不正確'));
    assert.ok(chunk.text.includes('![](data:image/png;base64,A)'), '圖片語法本身應保留（alt 文字清空）');
  });
});
