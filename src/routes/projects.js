const express = require('express');
const crypto = require('crypto');
const vectorStore = require('../adapters/vector');
const { blockWhenReadOnly } = require('../middleware/readOnly');

const router = express.Router();

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
