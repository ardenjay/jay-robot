const express = require('express');
const crypto = require('crypto');
const path = require('path');
const vectorStore = require('../adapters/vector');
const { blockWhenReadOnly } = require('../middleware/readOnly');
const { resolveDocView, resolveDownload } = require('../services/docView');

const router = express.Router();

const DOCS_ROOT = path.join(process.cwd(), 'public', 'documents');

router.post('/', blockWhenReadOnly, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '專案名稱為必填' });
  }
  try {
    const id = crypto.randomUUID();
    const project = await vectorStore.createProject(id, name.trim());
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新專案背景說明（回答時注入 system prompt）
const MAX_CONTEXT_LEN = 4000;
router.patch('/:id', blockWhenReadOnly, async (req, res) => {
  const { context } = req.body;
  if (typeof context !== 'string') {
    return res.status(400).json({ error: 'context 必須為字串' });
  }
  if (context.length > MAX_CONTEXT_LEN) {
    return res.status(400).json({ error: `context 長度上限 ${MAX_CONTEXT_LEN} 字` });
  }
  try {
    const ok = await vectorStore.updateProjectContext(req.params.id, context);
    if (!ok) return res.status(404).json({ error: '找不到專案' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const projects = await vectorStore.listProjects();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/documents', async (req, res) => {
  const PHASES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
  try {
    const docs = await vectorStore.listDocuments(req.params.id);
    const tree = Object.fromEntries(PHASES.map(p => [p, []]));
    for (const { phase, docId } of docs) {
      if (tree[phase]) tree[phase].push(docId);
    }
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 來源檢視：folder 進料的文件（持久化為目錄含 md+images）回 markdown 供前端渲染；
// 只有原始檔的文件回 file url 由前端開原檔。GET 讀取路由，不受唯讀模式阻擋。
router.get('/:id/documents/:docId/view', (req, res) => {
  const { status, body } = resolveDocView(DOCS_ROOT, req.params.id, req.params.docId);
  res.status(status).json(body);
});

// 下載原始檔（檔案型→該檔；目錄型→裡面的 PDF）。GET 讀取路由，唯讀模式可用。
router.get('/:id/documents/:docId/download', (req, res) => {
  const r = resolveDownload(DOCS_ROOT, req.params.id, req.params.docId);
  if (!r) return res.status(404).json({ error: '找不到可下載的原始檔' });
  res.download(r.filePath, r.filename);
});

router.delete('/:id/documents/:docId', blockWhenReadOnly, async (req, res) => {
  try {
    await vectorStore.clear(req.params.docId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const VALID_PHASES = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);

router.patch('/:id/documents/:docId/phase', blockWhenReadOnly, async (req, res) => {
  const { phase } = req.body;
  if (!phase || !VALID_PHASES.has(phase)) {
    return res.status(400).json({ error: 'phase 必須為 C1 至 C7' });
  }
  try {
    await vectorStore.movePhase(req.params.docId, req.params.id, phase);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
