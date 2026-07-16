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

// FTS 索引定義版本（PRAGMA user_version）：定義變更時 bump，啟動即一次性整表重建。
// v2：content_seg 由「title + 內文」組成，標題詞（章節路徑）可被關鍵字命中。
// v3：再加上 doc_id（文件名）——「100T 有幾個 CAN」的答案 chunk 標題與內文都沒有
//     「100T」，只有文件名（C455 EAR-100T_UM…）帶著；文件名不進索引就永遠輸給
//     內文碰巧含該詞的無關 chunks。
// v4：定義同 v3。實際部署曾在 v3 改版「改到一半」時重啟（版本號已是 3、取值行還是舊的），
//     導致 v2 內容掛上 v3 版本戳、之後永遠跳過重建；bump 一版強制重建修復。
// v5：doc_id 拆到獨立的 doc_seg 欄位（原本跟 title+content 混在同一個 content_seg）。
//     副作用：BM25 依「這一列總長度」正規化分數，內容短的 chunk（如封面/安裝須知）
//     因 doc_id 占其總字數比例高，查詢含專案代號時分數被灌爆，蓋過內容真正相關但
//     字數多的 chunk（實測「EAR-100T 的 AI 運算效能大概多少?」答案 chunk 排名第5）。
//     拆欄位後用 bm25(chunks_fts, 1.0, 0.3) 讓 doc_id 命中打折，不再蓋過內容相關性。
const FTS_VERSION = 5;

// FTS 索引文本：content_seg（標題章節路徑 + 內文）與 doc_seg（文件名）分開，
// 讓 BM25 可以個別加權，doc_id 命中不再因為短 chunk 而蓋過內容本身的相關性。
function ftsContentSeg(title, content) {
  return [title, content].filter(Boolean).join('\n');
}
function ftsDocSeg(docId) {
  return docId || '';
}

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

    // Sidecar 表格列索引：大表的每一 body 列（帶表頭與章節/caption 脈絡）獨立存放，
    // 不進 chunks、不進 FTS——只在檢索時以相似度門檻限量注入 rerank 候選池
    // （見 document-retrieval spec: Bounded table-row injection）。first_cell 供
    // 「查詢含 pin 編號/屬性名 對 列首格」的字面加成，救 embedding 分不出數字的查詢。
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS table_rows (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id     TEXT NOT NULL,
        title      TEXT,
        content    TEXT NOT NULL,
        first_cell TEXT DEFAULT '',
        embedding  TEXT NOT NULL,
        project_id TEXT DEFAULT 'default'
      );
    `);

    // 全文索引（keyword search 用）：FTS5 不可用時降級為純向量模式，不讓服務掛掉
    this.ftsEnabled = false;
    try {
      const ver = this.db.pragma('user_version', { simple: true });
      // FTS5 虛表不支援 ALTER TABLE 加欄位；版本落後代表欄位定義可能已變(如 v5 新增
      // doc_seg)，此時單靠 IF NOT EXISTS 會沿用舊表結構、新欄位寫入必炸——先砍表
      // 再照目前定義重建，才能保證表結構跟 FTS_VERSION 同步。
      if (ver < FTS_VERSION) {
        this.db.exec(`DROP TABLE IF EXISTS chunks_fts;`);
      }
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
          content_seg, doc_seg,
          chunk_id UNINDEXED, doc_id UNINDEXED, project_id UNINDEXED
        );
      `);
      this.ftsEnabled = true;
      // 索引定義版本落後（如 v2 起 content_seg 含 title）→ 一次性整表重建，
      // 既有 chunks 的 title 一併納入索引（舊資料不重灌也受益）
      if (ver < FTS_VERSION) {
        this._rebuildFts();
        this.db.pragma(`user_version = ${FTS_VERSION}`);
      } else {
        // backfill：舊 DB（無 FTS）或先前寫入不同步（筆數不符）→ 整表重建
        const nChunks = this.db.prepare('SELECT COUNT(*) AS c FROM chunks').get().c;
        const nFts = this.db.prepare('SELECT COUNT(*) AS c FROM chunks_fts').get().c;
        if (nChunks !== nFts) this._rebuildFts();
      }
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
      const rows = this.db.prepare('SELECT id, doc_id, title, content, project_id FROM chunks').all();
      const ins = this.db.prepare('INSERT INTO chunks_fts (content_seg, doc_seg, chunk_id, doc_id, project_id) VALUES (?, ?, ?, ?, ?)');
      for (const r of rows) {
        ins.run(segmentForFts(ftsContentSeg(r.title, r.content)), segmentForFts(ftsDocSeg(r.doc_id)), r.id, r.doc_id, r.project_id);
      }
    });
    rebuild();
  }

  async add(chunks) {
    const stmt = this.db.prepare(
      'INSERT INTO chunks (doc_id, title, content, embedding, project_id, phase) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insFts = this.ftsEnabled
      ? this.db.prepare('INSERT INTO chunks_fts (content_seg, doc_seg, chunk_id, doc_id, project_id) VALUES (?, ?, ?, ?, ?)')
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
        // FTS 與 chunks 同一交易寫入，維持兩表同步（content_seg/doc_seg 分開，見 ftsContentSeg/ftsDocSeg）
        if (insFts) {
          insFts.run(
            segmentForFts(ftsContentSeg(chunk.title, chunk.text)),
            segmentForFts(ftsDocSeg(chunk.docId)),
            r.lastInsertRowid,
            chunk.docId,
            projectId
          );
        }
      }
    });
    insertMany(chunks);
  }

  // Sidecar 表格列寫入：rows = [{docId, title, text, firstCell, embedding, projectId}]
  async addTableRows(rows) {
    const stmt = this.db.prepare(
      'INSERT INTO table_rows (doc_id, title, content, first_cell, embedding, project_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertMany = this.db.transaction(list => {
      for (const r of list) {
        stmt.run(r.docId, r.title || '', r.text, r.firstCell || '', JSON.stringify(r.embedding), r.projectId || 'default');
      }
    });
    insertMany(rows);
  }

  // Sidecar 表格列查詢：純向量比對（列不進 FTS），回傳含 similarity 供檢索端做門檻判定。
  // id 加 tr 前綴，避免與 chunks 的整數 id 在候選池去重時相撞。
  async searchTableRows(vector, topK = 5, projectId) {
    const rows = projectId
      ? this.db.prepare('SELECT id, doc_id, title, content, first_cell, embedding FROM table_rows WHERE project_id = ?').all(projectId)
      : this.db.prepare('SELECT id, doc_id, title, content, first_cell, embedding FROM table_rows').all();
    if (!rows.length) return [];
    const scored = rows.map(row => ({
      id: `tr${row.id}`,
      docId: row.doc_id,
      title: row.title,
      text: row.content,
      firstCell: row.first_cell || '',
      similarity: cosineSimilarity(vector, JSON.parse(row.embedding)) ?? 0,
    }));
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
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

  // BM25 keyword search：回傳排名好的 chunk_id 陣列（rank 越前越相關）。
  // 用欄位加權 bm25(chunks_fts, content_seg權重, doc_seg權重)取代預設 rank：
  // doc_id 命中打折，避免內容空洞的 chunk 因文件名匹配蓋過內容真正相關的 chunk。
  _keywordSearch(queryText, limit, projectId) {
    const q = buildFtsQuery(queryText);
    if (!q) return [];
    const rows = projectId
      ? this.db.prepare(
          'SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ? AND project_id = ? ORDER BY bm25(chunks_fts, 1.0, 0.3) LIMIT ?'
        ).all(q, projectId, limit)
      : this.db.prepare(
          'SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts, 1.0, 0.3) LIMIT ?'
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
        this.db.prepare('DELETE FROM table_rows WHERE doc_id = ? AND project_id = ?').run(docId, projectId);
        if (this.ftsEnabled) this.db.prepare('DELETE FROM chunks_fts WHERE doc_id = ? AND project_id = ?').run(docId, projectId);
      } else {
        this.db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId);
        this.db.prepare('DELETE FROM table_rows WHERE doc_id = ?').run(docId);
        if (this.ftsEnabled) this.db.prepare('DELETE FROM chunks_fts WHERE doc_id = ?').run(docId);
      }
    });
    clearBoth();
  }

  // 文件改名：chunks 的 doc_id 與該文件 FTS 索引列同一交易更新。
  // FTS 索引文本含檔名（ftsText），不能只改 doc_id 欄——整批 delete 後以新名重建。
  // 回傳更新的 chunk 數（0 = 該專案無此文件）。
  async renameDocument(projectId, oldDocId, newDocId) {
    const run = this.db.transaction(() => {
      const r = this.db
        .prepare('UPDATE chunks SET doc_id = ? WHERE doc_id = ? AND project_id = ?')
        .run(newDocId, oldDocId, projectId);
      // sidecar 表格列跟著改名（列 title 不含 docId，改欄位即可）
      this.db.prepare('UPDATE table_rows SET doc_id = ? WHERE doc_id = ? AND project_id = ?').run(newDocId, oldDocId, projectId);
      if (r.changes > 0 && this.ftsEnabled) {
        this.db.prepare('DELETE FROM chunks_fts WHERE doc_id = ? AND project_id = ?').run(oldDocId, projectId);
        const rows = this.db
          .prepare('SELECT id, doc_id, title, content, project_id FROM chunks WHERE doc_id = ? AND project_id = ?')
          .all(newDocId, projectId);
        const ins = this.db.prepare('INSERT INTO chunks_fts (content_seg, doc_seg, chunk_id, doc_id, project_id) VALUES (?, ?, ?, ?, ?)');
        for (const row of rows) {
          ins.run(segmentForFts(ftsContentSeg(row.title, row.content)), segmentForFts(ftsDocSeg(row.doc_id)), row.id, row.doc_id, row.project_id);
        }
      }
      return r.changes;
    });
    return run();
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
