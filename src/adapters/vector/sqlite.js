const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const VectorAdapter = require('./base');

const DB_PATH = path.join(process.cwd(), 'data', 'rag.db');

// CJK 逐字切分、英數（含 - _）token 保留完整、lowercase。索引與查詢兩側共用，
// 讓 unicode61 tokenizer 得以處理中文（否則整句中文是一個 token，關鍵字永遠查不到）。
function segmentForFts(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[㐀-䶿一-鿿豈-﫿]/g, ch => ` ${ch} `)
    .replace(/\s+/g, ' ')
    .trim();
}

// 查詢字串 → FTS5 MATCH 語法，OR 串接、雙引號包裹（杜絕語法注入）。
// 連續 CJK 段組成「相鄰字 bigram 片語」（如 的腳位 → "的 腳" OR "腳 位"）：
// 單一常見字（的、是）不單獨成查詢 token，避免污染 BM25 排名把真正的關鍵字命中擠掉；
// bigram 片語同時保留中文詞的相鄰性。英數 token（U42、DDR5-4800）維持完整。
function buildFtsQuery(text) {
  const cjk = /[㐀-䶿一-鿿豈-﫿]/;
  const parts = segmentForFts(text).split(' ').filter(Boolean);
  const terms = [];
  let run = []; // 連續 CJK 單字的暫存
  const flushRun = () => {
    if (run.length === 1) terms.push(`"${run[0]}"`);
    else for (let i = 0; i < run.length - 1; i++) terms.push(`"${run[i]} ${run[i + 1]}"`);
    run = [];
  };
  for (const p of parts) {
    if (p.length === 1 && cjk.test(p)) { run.push(p); continue; }
    flushRun();
    terms.push(`"${p.replace(/"/g, '""')}"`);
  }
  flushRun();
  return terms.length ? terms.join(' OR ') : null;
}

const RRF_K = 60; // Reciprocal Rank Fusion 常數，文獻慣用值

function cosineSimilarity(a, b) {
  // 維度不符（如換了 embedding provider 沒重新 ingest）會算出無意義分數，直接視為不相似
  if (a.length !== b.length) return null;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class SqliteVectorAdapter extends VectorAdapter {
  constructor(dbPath) {
    super();
    this.dbPath = dbPath || DB_PATH;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    // 檔案型 SQLite：寫入直接進檔、有交易與檔案鎖；WAL 提供較佳並行與崩潰耐受。
    // 不再把整個 DB 載入記憶體後整檔覆寫，避免多實例交疊互蓋造成資料遺失。
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        context    TEXT NOT NULL DEFAULT ''
      );
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id     TEXT NOT NULL,
        title      TEXT,
        content    TEXT NOT NULL,
        embedding  TEXT NOT NULL,
        project_id TEXT DEFAULT 'default',
        phase      TEXT DEFAULT ''
      );
    `);
    // 對舊版（缺欄位）的 DB 檔做相容遷移；欄位已存在時 SQLite 會報錯，忽略即可
    try { this.db.exec(`ALTER TABLE chunks ADD COLUMN project_id TEXT DEFAULT 'default'`); } catch {}
    try { this.db.exec(`ALTER TABLE chunks ADD COLUMN phase TEXT DEFAULT ''`); } catch {}
    try { this.db.exec(`ALTER TABLE projects ADD COLUMN context TEXT NOT NULL DEFAULT ''`); } catch {}

    // 全文索引（keyword search 用）：FTS5 不可用時降級為純向量模式，不讓服務掛掉
    this.ftsEnabled = false;
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
          content_seg,
          chunk_id UNINDEXED, doc_id UNINDEXED, project_id UNINDEXED
        );
      `);
      this.ftsEnabled = true;
      // backfill：舊 DB（無 FTS）或先前寫入不同步（筆數不符）→ 整表重建
      const nChunks = this.db.prepare('SELECT COUNT(*) AS c FROM chunks').get().c;
      const nFts = this.db.prepare('SELECT COUNT(*) AS c FROM chunks_fts').get().c;
      if (nChunks !== nFts) this._rebuildFts();
    } catch (err) {
      console.warn(`[vector] FTS5 不可用，keyword 搜尋停用（hybridSearch 退回純向量）：${err.message}`);
    }

    // 維持與舊介面相容：呼叫端仍可 `await store._ready`
    this._ready = Promise.resolve();
  }

  // FTS 整表重建（初始化 backfill 用）：千級 chunks 成本毫秒~秒級
  _rebuildFts() {
    const rebuild = this.db.transaction(() => {
      this.db.prepare('DELETE FROM chunks_fts').run();
      const rows = this.db.prepare('SELECT id, doc_id, content, project_id FROM chunks').all();
      const ins = this.db.prepare('INSERT INTO chunks_fts (content_seg, chunk_id, doc_id, project_id) VALUES (?, ?, ?, ?)');
      for (const r of rows) ins.run(segmentForFts(r.content), r.id, r.doc_id, r.project_id);
    });
    rebuild();
  }

  async add(chunks) {
    const stmt = this.db.prepare(
      'INSERT INTO chunks (doc_id, title, content, embedding, project_id, phase) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insFts = this.ftsEnabled
      ? this.db.prepare('INSERT INTO chunks_fts (content_seg, chunk_id, doc_id, project_id) VALUES (?, ?, ?, ?)')
      : null;
    const insertMany = this.db.transaction(rows => {
      for (const chunk of rows) {
        const projectId = chunk.projectId || 'default';
        const r = stmt.run(
          chunk.docId,
          chunk.title || '',
          chunk.text,
          JSON.stringify(chunk.embedding),
          projectId,
          chunk.phase || ''
        );
        // FTS 與 chunks 同一交易寫入，維持兩表同步
        if (insFts) insFts.run(segmentForFts(chunk.text), r.lastInsertRowid, chunk.docId, projectId);
      }
    });
    insertMany(chunks);
  }

  // projectId optional — omit to search all
  async search(vector, topK = 5, projectId) {
    const rows = projectId
      ? this.db.prepare('SELECT id, doc_id, title, content, embedding FROM chunks WHERE project_id = ?').all(projectId)
      : this.db.prepare('SELECT id, doc_id, title, content, embedding FROM chunks').all();

    if (!rows.length) return [];

    let dimMismatch = false;
    const scored = rows.map(row => {
      const emb = JSON.parse(row.embedding);
      const sim = cosineSimilarity(vector, emb);
      if (sim === null) dimMismatch = true;
      return { id: row.id, docId: row.doc_id, title: row.title, text: row.content, similarity: sim ?? 0 };
    });
    if (dimMismatch) {
      console.warn('[vector] embedding 維度不符（查詢向量與既有 chunks 來自不同 embedding 模型？），相關 chunks 視為不相似。請重新 ingest 文件。');
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK).map(r => ({
      id: r.id,
      docId: r.docId,
      title: r.title,
      text: r.text,
      distance: 1 - r.similarity,
    }));
  }

  // BM25 keyword search：回傳排名好的 chunk_id 陣列（rank 越前越相關）
  _keywordSearch(queryText, limit, projectId) {
    const q = buildFtsQuery(queryText);
    if (!q) return [];
    const rows = projectId
      ? this.db.prepare(
          'SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ? AND project_id = ? ORDER BY rank LIMIT ?'
        ).all(q, projectId, limit)
      : this.db.prepare(
          'SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?'
        ).all(q, limit);
    return rows.map(r => r.chunk_id);
  }

  // Hybrid search：向量 + keyword 兩路各取 topK*4 候選，RRF（k=60）融合取 top-K。
  // 回傳 shape 與 search 相同；FTS 不可用或查詢斷不出 token 時自然退化為純向量。
  async hybridSearch(queryText, vector, topK = 5, projectId) {
    if (!this.ftsEnabled) return this.search(vector, topK, projectId);
    const window = topK * 4;

    const vecResults = await this.search(vector, window, projectId);
    const kwIds = this._keywordSearch(queryText, window, projectId);
    if (!kwIds.length) return vecResults.slice(0, topK);

    // RRF：score(c) = Σ 1/(k + rank)，兩路各自貢獻
    const scores = new Map();
    vecResults.forEach((r, i) => scores.set(r.id, (scores.get(r.id) || 0) + 1 / (RRF_K + i + 1)));
    kwIds.forEach((id, i) => scores.set(id, (scores.get(id) || 0) + 1 / (RRF_K + i + 1)));

    // 補齊只有 keyword 命中的 chunks 內容；distance 以向量側為準，keyword-only 以最大 distance 補位
    const byId = new Map(vecResults.map(r => [r.id, r]));
    const maxDistance = vecResults.length ? Math.max(...vecResults.map(r => r.distance)) : 1;
    const missing = kwIds.filter(id => !byId.has(id));
    if (missing.length) {
      const rows = this.db.prepare(
        `SELECT id, doc_id, title, content FROM chunks WHERE id IN (${missing.map(() => '?').join(',')})`
      ).all(...missing);
      for (const r of rows) {
        byId.set(r.id, { id: r.id, docId: r.doc_id, title: r.title, text: r.content, distance: maxDistance });
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([id]) => byId.get(id))
      .filter(Boolean);
  }

  // projectId optional for backward compat
  async clear(docId, projectId) {
    const clearBoth = this.db.transaction(() => {
      if (projectId) {
        this.db.prepare('DELETE FROM chunks WHERE doc_id = ? AND project_id = ?').run(docId, projectId);
        if (this.ftsEnabled) this.db.prepare('DELETE FROM chunks_fts WHERE doc_id = ? AND project_id = ?').run(docId, projectId);
      } else {
        this.db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId);
        if (this.ftsEnabled) this.db.prepare('DELETE FROM chunks_fts WHERE doc_id = ?').run(docId);
      }
    });
    clearBoth();
  }

  async movePhase(docId, projectId, newPhase) {
    this.db.prepare('UPDATE chunks SET phase = ? WHERE doc_id = ? AND project_id = ?').run(newPhase, docId, projectId);
  }

  async listDocuments(projectId) {
    const rows = this.db
      .prepare('SELECT DISTINCT phase, doc_id FROM chunks WHERE project_id = ? ORDER BY phase, doc_id')
      .all(projectId);
    return rows.map(r => ({ phase: r.phase, docId: r.doc_id }));
  }

  isEmpty(projectId) {
    const row = projectId
      ? this.db.prepare('SELECT COUNT(*) AS c FROM chunks WHERE project_id = ?').get(projectId)
      : this.db.prepare('SELECT COUNT(*) AS c FROM chunks').get();
    return row.c === 0;
  }

  async createProject(id, name) {
    const created_at = new Date().toISOString();
    this.db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(id, name, created_at);
    return { id, name, created_at, context: '' };
  }

  async listProjects() {
    return this.db.prepare('SELECT id, name, created_at, context FROM projects ORDER BY created_at DESC').all();
  }

  // 專案背景說明（使用者提供，回答時注入 system prompt）
  async updateProjectContext(id, context) {
    const r = this.db.prepare('UPDATE projects SET context = ? WHERE id = ?').run(context, id);
    return r.changes > 0;
  }
}

module.exports = SqliteVectorAdapter;
