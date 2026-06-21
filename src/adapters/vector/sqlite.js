const initSqlJs = require('sql.js');
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
    this.db = null;
    this._ready = this._init();
  }

  async _init() {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    // Task 1.1: projects table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS chunks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id     TEXT NOT NULL,
        title      TEXT,
        content    TEXT NOT NULL,
        embedding  TEXT NOT NULL
      );
    `);

    // Task 1.2: migration — add columns if absent (SQLite errors if already exist)
    try { this.db.run(`ALTER TABLE chunks ADD COLUMN project_id TEXT DEFAULT 'default'`); } catch {}
    try { this.db.run(`ALTER TABLE chunks ADD COLUMN phase TEXT DEFAULT ''`); } catch {}

    this._persist();
  }

  _persist() {
    const data = this.db.export();
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  // Task 2.1
  async add(chunks) {
    await this._ready;
    const stmt = this.db.prepare(
      'INSERT INTO chunks (doc_id, title, content, embedding, project_id, phase) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const chunk of chunks) {
      stmt.run([
        chunk.docId,
        chunk.title || '',
        chunk.text,
        JSON.stringify(chunk.embedding),
        chunk.projectId || 'default',
        chunk.phase || '',
      ]);
    }
    stmt.free();
    this._persist();
  }

  // Task 2.2: projectId optional — omit to search all
  async search(vector, topK = 5, projectId) {
    await this._ready;
    const sql = projectId
      ? 'SELECT id, doc_id, title, content, embedding FROM chunks WHERE project_id = ?'
      : 'SELECT id, doc_id, title, content, embedding FROM chunks';
    const stmt = this.db.prepare(sql);
    if (projectId) stmt.bind([projectId]);

    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();

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

  // Task 2.3: projectId optional for backward compat
  async clear(docId, projectId) {
    await this._ready;
    if (projectId) {
      this.db.run('DELETE FROM chunks WHERE doc_id = ? AND project_id = ?', [docId, projectId]);
    } else {
      this.db.run('DELETE FROM chunks WHERE doc_id = ?', [docId]);
    }
    this._persist();
  }

  async movePhase(docId, projectId, newPhase) {
    await this._ready;
    this.db.run('UPDATE chunks SET phase = ? WHERE doc_id = ? AND project_id = ?', [newPhase, docId, projectId]);
    this._persist();
  }

  // Task 2.4
  async listDocuments(projectId) {
    await this._ready;
    const stmt = this.db.prepare(
      'SELECT DISTINCT phase, doc_id FROM chunks WHERE project_id = ? ORDER BY phase, doc_id'
    );
    stmt.bind([projectId]);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows.map(r => ({ phase: r.phase, docId: r.doc_id }));
  }

  isEmpty(projectId) {
    if (!this.db) return true;
    const sql = projectId
      ? 'SELECT COUNT(*) FROM chunks WHERE project_id = ?'
      : 'SELECT COUNT(*) FROM chunks';
    const stmt = this.db.prepare(sql);
    if (projectId) stmt.bind([projectId]);
    stmt.step();
    const count = stmt.getAsObject()['COUNT(*)'];
    stmt.free();
    return count === 0;
  }

  async createProject(id, name) {
    await this._ready;
    const created_at = new Date().toISOString();
    this.db.run('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)', [id, name, created_at]);
    this._persist();
    return { id, name, created_at };
  }

  async listProjects() {
    await this._ready;
    const stmt = this.db.prepare('SELECT id, name, created_at FROM projects ORDER BY created_at DESC');
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }
}

module.exports = SqliteVectorAdapter;
