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
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chunks (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id    TEXT NOT NULL,
        title     TEXT,
        content   TEXT NOT NULL,
        embedding TEXT NOT NULL
      );
    `);
    this._persist();
  }

  _persist() {
    const data = this.db.export();
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  async add(chunks) {
    await this._ready;
    const stmt = this.db.prepare(
      'INSERT INTO chunks (doc_id, title, content, embedding) VALUES (?, ?, ?, ?)'
    );
    for (const chunk of chunks) {
      stmt.run([chunk.docId, chunk.title || '', chunk.text, JSON.stringify(chunk.embedding)]);
    }
    stmt.free();
    this._persist();
  }

  async search(vector, topK = 5) {
    await this._ready;
    const rows = this.db.exec('SELECT id, doc_id, title, content, embedding FROM chunks');
    if (!rows.length || !rows[0].values.length) return [];

    const scored = rows[0].values.map(([id, docId, title, content, embJson]) => {
      const emb = JSON.parse(embJson);
      const similarity = cosineSimilarity(vector, emb);
      return { id, docId, title, text: content, similarity };
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

  async clear(docId) {
    await this._ready;
    this.db.run('DELETE FROM chunks WHERE doc_id = ?', [docId]);
    this._persist();
  }

  isEmpty() {
    if (!this.db) return true;
    const result = this.db.exec('SELECT COUNT(*) as count FROM chunks');
    if (!result.length) return true;
    return result[0].values[0][0] === 0;
  }
}

module.exports = SqliteVectorAdapter;
