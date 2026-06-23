const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const VectorAdapter = require('./base');

const DB_PATH = path.join(process.cwd(), 'data', 'rag.db');

function cosineSimilarity(a, b) {
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
        created_at TEXT NOT NULL
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

    // 維持與舊介面相容：呼叫端仍可 `await store._ready`
    this._ready = Promise.resolve();
  }

  async add(chunks) {
    const stmt = this.db.prepare(
      'INSERT INTO chunks (doc_id, title, content, embedding, project_id, phase) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertMany = this.db.transaction(rows => {
      for (const chunk of rows) {
        stmt.run(
          chunk.docId,
          chunk.title || '',
          chunk.text,
          JSON.stringify(chunk.embedding),
          chunk.projectId || 'default',
          chunk.phase || ''
        );
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

    const scored = rows.map(row => {
      const emb = JSON.parse(row.embedding);
      return { id: row.id, docId: row.doc_id, title: row.title, text: row.content, similarity: cosineSimilarity(vector, emb) };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK).map(r => ({
      id: r.id,
      docId: r.docId,
      title: r.title,
      text: r.text,
      distance: 1 - r.similarity,
    }));
  }

  // projectId optional for backward compat
  async clear(docId, projectId) {
    if (projectId) {
      this.db.prepare('DELETE FROM chunks WHERE doc_id = ? AND project_id = ?').run(docId, projectId);
    } else {
      this.db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId);
    }
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
    return { id, name, created_at };
  }

  async listProjects() {
    return this.db.prepare('SELECT id, name, created_at FROM projects ORDER BY created_at DESC').all();
  }
}

module.exports = SqliteVectorAdapter;
