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

  it('sidecar table_rows: add/search/clear，id 帶 tr 前綴不與 chunks 相撞', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const adapter = new SqliteVectorAdapter(dbPath);
    await adapter._ready;

    await adapter.addTableRows([
      { docId: 'doc.md', title: '規格 › Table 25', text: 'Weight | 98 | gram', firstCell: 'Weight', embedding: makeVec(0), projectId: 'p1' },
      { docId: 'doc.md', title: '規格 › Table 25', text: 'Height | 36.8 | mm', firstCell: 'Height', embedding: makeVec(1), projectId: 'p1' },
    ]);

    const hits = await adapter.searchTableRows(makeVec(0), 2, 'p1');
    assert.equal(hits.length, 2);
    assert.ok(hits[0].text.includes('Weight'), '最相似列排前');
    assert.ok(String(hits[0].id).startsWith('tr'), 'id 有 tr 前綴');
    assert.equal(hits[0].firstCell, 'Weight');
    assert.ok(hits[0].similarity > hits[1].similarity);

    // clear 同步清列
    await adapter.clear('doc.md', 'p1');
    assert.equal((await adapter.searchTableRows(makeVec(0), 5, 'p1')).length, 0);
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

  it('FTS 索引含 title：關鍵字只出現在章節路徑也能命中', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const adapter = new SqliteVectorAdapter(dbPath);
    await adapter.add([
      { docId: 'UM.md', title: '介面 › I/O 規格', text: '本機提供多種周邊介面。', embedding: makeVec(0), projectId: 'p1' },
      { docId: 'UM.md', title: '機構', text: '外殼尺寸與散熱設計。', embedding: makeVec(1), projectId: 'p1' },
    ]);
    // 查詢向量取正交向量,讓向量腿沒有偏好;關鍵字「規格」只在 title 出現
    const hits = await adapter.hybridSearch('I/O 規格', makeVec(5), 2, 'p1');
    assert.equal(hits[0].title, '介面 › I/O 規格', '標題詞應被關鍵字腿命中並排前');
  });

  it('FTS 索引含文件名:關鍵字只出現在 docId 也能命中', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const adapter = new SqliteVectorAdapter(dbPath);
    await adapter.add([
      { docId: 'C455 EAR-100T_UM.docx', title: 'Features', text: 'Supports 2 x CAN bus', embedding: makeVec(0), projectId: 'p1' },
      { docId: 'MTi 600', title: 'CAN output', text: 'CAN CAN CAN 的協定細節。', embedding: makeVec(1), projectId: 'p1' },
    ]);
    // 「100t」只在第一筆的 docId;若文件名不進索引,CAN 高密度的第二筆會壓過答案
    const hits = await adapter.hybridSearch('100T 有幾個 CAN', makeVec(5), 2, 'p1');
    assert.equal(hits[0].docId, 'C455 EAR-100T_UM.docx', '文件名帶 100T 的 chunk 應排前');
  });

  it('同文件內,doc_id 命中不應蓋過內容真正相關的 chunk（BM25 欄位加權）', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const adapter = new SqliteVectorAdapter(dbPath);
    // 補幾筆不相關的 filler chunks(長度接近真實語料的平均值),避免只有 2 筆 chunk 時
    // avgdl 被兩個極端值主導、長度正規化效應被人為放大,失真地重現/掩蓋真正的問題
    const filler = Array.from({ length: 8 }, (_, i) => ({
      docId: `OTHER_DOC_${i}.md`,
      title: `Section ${i}`,
      text: `Unrelated hardware spec number ${i}: connector pinout, voltage rails, and mechanical tolerances for a completely different subsystem.`,
      embedding: makeVec(2 + i),
      projectId: 'p1',
    }));
    await adapter.add([
      ...filler,
      // 內容空洞、幾乎沒有真正資訊的 chunk（模擬封面/安裝須知）
      { docId: 'EAR-100T_DS.pdf', title: 'Cover', text: '。', embedding: makeVec(0), projectId: 'p1' },
      // 內容長、真正含答案的 chunk
      {
        docId: 'EAR-100T_DS.pdf',
        title: 'Features',
        text: 'Up to 2070 FP4 TFLOPS of AI compute and 128 GB of memory. 支援多種周邊介面與擴充能力，適用於邊緣運算場景。',
        embedding: makeVec(1),
        projectId: 'p1',
      },
    ]);
    // 查詢向量取正交向量(索引 12,跟所有候選的 0~9 都不撞)讓向量腿對所有候選一視同仁；
    // topK 開夠大(10,candidate window = topK*4)確保 Cover/Features 都進候選池,不被
    // window 截斷排除,只看關鍵字腿本身的排序表現
    const hits = await adapter.hybridSearch('EAR-100T 的 AI 運算效能大概多少', makeVec(12), 10, 'p1');
    assert.equal(hits[0].title, 'Features', '內容真正相關且較長的 chunk 不應被內容空洞的同文件 chunk 壓過');
  });

  it('user_version 落後 → 開啟時 FTS 一次性重建(舊 chunks 的 title 納入索引)', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    // 建一個「舊索引」DB:FTS 只有內文、user_version 歸零
    const a1 = new SqliteVectorAdapter(dbPath);
    await a1.add([{ docId: 'UM.md', title: 'I/O 規格', text: '周邊介面清單。', embedding: makeVec(0), projectId: 'p1' }]);
    a1.db.prepare('DELETE FROM chunks_fts').run();
    a1.db.prepare('INSERT INTO chunks_fts (content_seg, chunk_id, doc_id, project_id) SELECT lower(content), id, doc_id, project_id FROM chunks').run();
    a1.db.pragma('user_version = 0');
    a1.db.close();

    const a2 = new SqliteVectorAdapter(dbPath);
    assert.equal(a2.db.pragma('user_version', { simple: true }) >= 2, true, '重建後應寫回版本戳');
    const hits = await a2.hybridSearch('規格', makeVec(5), 1, 'p1');
    assert.equal(hits.length, 1, '重建後標題詞應可命中');
    assert.equal(hits[0].title, 'I/O 規格');
  });

  it('chunks_fts 為真正的舊 schema(無 doc_seg 欄位)→ 開啟時砍表重建,不炸也不退回純向量', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    // 模擬 v4 以前的實體 schema：chunks_fts 只有 content_seg 一個索引欄位(無 doc_seg)。
    // FTS5 虛表不支援 ALTER TABLE 加欄位，若只靠 IF NOT EXISTS 會沿用這個舊表結構。
    const Database = require('better-sqlite3');
    const raw = new Database(dbPath);
    raw.exec(`
      CREATE TABLE chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT NOT NULL, title TEXT, content TEXT NOT NULL,
        embedding TEXT NOT NULL, project_id TEXT DEFAULT 'default', phase TEXT DEFAULT ''
      );
      CREATE VIRTUAL TABLE chunks_fts USING fts5(
        content_seg, chunk_id UNINDEXED, doc_id UNINDEXED, project_id UNINDEXED
      );
    `);
    raw.prepare('INSERT INTO chunks (doc_id, title, content, embedding, project_id) VALUES (?, ?, ?, ?, ?)')
      .run('C455 EAR-100T_UM.docx', 'Features', 'Supports 2 x CAN bus', JSON.stringify(makeVec(0)), 'p1');
    raw.exec("INSERT INTO chunks_fts (content_seg, chunk_id, doc_id, project_id) SELECT lower(title || ' ' || content), id, doc_id, project_id FROM chunks");
    raw.pragma('user_version = 0');
    raw.close();

    const adapter = new SqliteVectorAdapter(dbPath);
    assert.equal(adapter.ftsEnabled, true, '砍表重建成功,不應退回純向量模式');
    const hits = await adapter.hybridSearch('100T 有幾個 CAN', makeVec(5), 1, 'p1');
    assert.equal(hits.length, 1, '重建後仍可靠文件名關鍵字命中');
    assert.equal(hits[0].docId, 'C455 EAR-100T_UM.docx');
  });

  it('renameDocument:chunks 與 FTS 一體更新,新檔名詞可搜、舊檔名詞不再命中', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const adapter = new SqliteVectorAdapter(dbPath);
    await adapter.add([
      { docId: 'OLDNAME.pdf', title: 'Features', text: '內文沒有檔名詞。', embedding: makeVec(0), projectId: 'p1' },
      { docId: 'OLDNAME.pdf', title: 'Spec', text: '另一段內文。', embedding: makeVec(1), projectId: 'p1' },
    ]);

    const n = await adapter.renameDocument('p1', 'OLDNAME.pdf', 'THORDOC.pdf');
    assert.equal(n, 2);

    const docs = await adapter.listDocuments('p1');
    assert.deepEqual(docs.map(d => d.docId), ['THORDOC.pdf'], 'DISTINCT 後只剩新名');

    // 關鍵字腿:新檔名詞命中、舊檔名詞歸零(索引文本已重建)
    assert.equal(adapter._keywordSearch('THORDOC', 10, 'p1').length, 2, '新檔名詞應命中');
    assert.equal(adapter._keywordSearch('OLDNAME', 10, 'p1').length, 0, '舊檔名詞不應再命中');
  });

  it('renameDocument:專案無此文件 → 回 0 不變更', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const adapter = new SqliteVectorAdapter(dbPath);
    assert.equal(await adapter.renameDocument('p1', 'nope', 'x'), 0);
  });

  it('舊版 projects 表（無 context 欄）→ 開啟時自動遷移且資料保留', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    // 直接以舊 schema 建 DB，模擬升級前的資料檔
    const Database = require('better-sqlite3');
    const old = new Database(dbPath);
    old.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`);
    old.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run('p1', '100T', '2026-01-01');
    old.close();

    const adapter = new SqliteVectorAdapter(dbPath);
    const projects = await adapter.listProjects();
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, '100T', '既有專案應保留');
    assert.equal(projects[0].context, '', '遷移後 context 預設空字串');
  });

  it('updateProjectContext 後 listProjects 帶回新值；不存在的 id 回 false', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const adapter = new SqliteVectorAdapter(dbPath);
    const p = await adapter.createProject('p1', '100T');
    assert.equal(p.context, '');

    assert.equal(await adapter.updateProjectContext('p1', '100T = EAR-100T7'), true);
    const projects = await adapter.listProjects();
    assert.equal(projects[0].context, '100T = EAR-100T7');

    assert.equal(await adapter.updateProjectContext('nope', 'x'), false);
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

describe('hybrid search（FTS5 + RRF）', () => {
  const dbs = [];

  afterEach(() => {
    for (const p of dbs.splice(0)) {
      try { fs.unlinkSync(p); } catch {}
    }
  });

  function newAdapter() {
    const dbPath = tmpDb(); dbs.push(dbPath);
    return new SqliteVectorAdapter(dbPath);
  }

  // 干擾 chunks 與查詢向量同向（向量排名壓過目標），目標 chunk 向量正交但含關鍵字
  async function seedKeywordScenario(adapter) {
    const chunks = [];
    for (let i = 0; i < 8; i++) {
      chunks.push({ docId: 'noise.md', title: `雜訊${i}`, text: `一般的電源說明文字 ${i}`, embedding: makeVec(0) });
    }
    chunks.push({ docId: 'target.md', title: '目標', text: 'U42 是主控 MCU，負責電源時序', embedding: makeVec(7) });
    await adapter.add(chunks);
  }

  it('關鍵字精確命中：向量排名靠後的 chunk 仍進 top-K', async () => {
    const adapter = newAdapter();
    await seedKeywordScenario(adapter);

    const vecOnly = await adapter.search(makeVec(0), 3);
    assert.ok(!vecOnly.some(r => r.docId === 'target.md'), '前置條件：純向量 top-3 不含目標');

    const hybrid = await adapter.hybridSearch('U42 的腳位', makeVec(0), 3);
    assert.ok(hybrid.some(r => r.docId === 'target.md'), 'hybrid top-3 必須撈回含 U42 的 chunk');
  });

  it('中英混合查詢命中含英數 token 的 chunk', async () => {
    const adapter = newAdapter();
    await adapter.add([
      { docId: 'a.md', title: 'A', text: '本板使用 DDR5-4800 記憶體模組', embedding: makeVec(0) },
      { docId: 'b.md', title: 'B', text: '無關內容', embedding: makeVec(1) },
    ]);
    const hits = adapter._keywordSearch('DDR5-4800 的速度', 10);
    assert.equal(hits.length, 1, '應只命中含 DDR5-4800 的 chunk');
  });

  it('FTS 零命中時結果等同純向量搜尋', async () => {
    const adapter = newAdapter();
    await seedKeywordScenario(adapter);
    const hybrid = await adapter.hybridSearch('xyzzy plugh', makeVec(0), 3);
    const vec = await adapter.search(makeVec(0), 3);
    assert.deepEqual(hybrid.map(r => r.id), vec.map(r => r.id));
  });

  it('add 後 keyword 可命中，clear 後同查詢不再命中（FTS 同步）', async () => {
    const adapter = newAdapter();
    await adapter.add([{ docId: 'd.md', title: 'T', text: '含 U99 的內容', embedding: makeVec(0), projectId: 'p1' }]);
    assert.equal(adapter._keywordSearch('U99', 10, 'p1').length, 1);
    await adapter.clear('d.md', 'p1');
    assert.equal(adapter._keywordSearch('U99', 10, 'p1').length, 0);
  });

  it('舊 DB（無 FTS 表）初始化自動 backfill，keyword 可命中舊資料', async () => {
    const dbPath = tmpDb(); dbs.push(dbPath);
    const a1 = new SqliteVectorAdapter(dbPath);
    await a1.add([{ docId: 'old.md', title: '舊', text: '舊資料含 C560 代碼', embedding: makeVec(0) }]);
    a1.db.exec('DROP TABLE chunks_fts'); // 模擬舊版 DB 沒有 FTS 表
    a1.db.close();

    const a2 = new SqliteVectorAdapter(dbPath);
    assert.equal(a2._keywordSearch('C560', 10).length, 1, 'backfill 後舊資料應可被 keyword 命中');
    a2.db.close();
  });
});
