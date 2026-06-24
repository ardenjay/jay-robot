const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { ingestFile } = require('../services/ingestion');
const { blockWhenReadOnly } = require('../middleware/readOnly');

const router = express.Router();

const VALID_PHASES = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);

// 由 markitdown 轉換為 Markdown 的文件格式（PDF 仍走 MinerU，不在此清單）
const MARKITDOWN_EXTS = new Set([
  '.docx', '.pptx', '.xlsx', '.xls', '.html', '.htm', '.csv', '.json', '.xml', '.epub',
]);

const storage = multer.diskStorage({
  destination: path.join(process.cwd(), 'uploads'),
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({ storage });

function findFirstMd(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFirstMd(full);
      if (found) return found;
    } else if (entry.name.endsWith('.md')) {
      return full;
    }
  }
  return null;
}

function convertPdfToMarkdown(pdfPath, useVlm, onLog) {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineru-'));
    console.log(`[MinerU] 開始轉換：${pdfPath} (VLM: ${useVlm})`);

    const args = ['run', '--no-capture-output', '-n', 'mineru', 'mineru', '-p', pdfPath, '-o', tmpDir];
    if (!useVlm) args.push('-b', 'pipeline');

    const proc = spawn('conda', args);

    proc.stdout.on('data', d => {
      const msg = d.toString().trim();
      if (msg) { process.stdout.write(`[MinerU] ${d}`); onLog(msg); }
    });
    proc.stderr.on('data', d => {
      const msg = d.toString().trim();
      if (msg) { process.stderr.write(`[MinerU] ${d}`); onLog(msg); }
    });

    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`MinerU 結束，exit code ${code}`));
      const mdPath = findFirstMd(tmpDir);
      if (!mdPath) return reject(new Error('MinerU 未產生任何 Markdown 輸出'));
      resolve({ mdPath, tmpDir });
    });
  });
}

function convertWithMarkitdown(filePath, onLog) {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markitdown-'));
    const mdPath = path.join(tmpDir, 'out.md');
    console.log(`[markitdown] 開始轉換：${filePath}`);

    const args = ['run', '--no-capture-output', '-n', 'markitdown', 'markitdown', filePath, '-o', mdPath];
    const proc = spawn('conda', args);

    proc.stdout.on('data', d => {
      const msg = d.toString().trim();
      if (msg) { process.stdout.write(`[markitdown] ${d}`); onLog(msg); }
    });
    proc.stderr.on('data', d => {
      const msg = d.toString().trim();
      if (msg) { process.stderr.write(`[markitdown] ${d}`); onLog(msg); }
    });

    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`markitdown 結束，exit code ${code}`));
      if (!fs.existsSync(mdPath)) return reject(new Error('markitdown 未產生任何 Markdown 輸出'));
      resolve({ mdPath, tmpDir });
    });
  });
}

router.post('/', blockWhenReadOnly, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '請選擇要上傳的檔案' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const isMarkdown = ext === '.md' || ext === '.markdown';
  const isPdf = ext === '.pdf';
  const isMarkitdown = MARKITDOWN_EXTS.has(ext);
  if (!isMarkdown && !isPdf && !isMarkitdown) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: '僅接受 Markdown、PDF 或 markitdown 支援的文件格式' });
  }

  const projectId = req.body.project_id;
  const phase = req.body.phase;
  const useVlm = req.body.use_vlm === 'true';

  if (!projectId || !projectId.trim()) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'project_id 為必填' });
  }

  if (!phase || !VALID_PHASES.has(phase)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'phase 必須為 C1 至 C7' });
  }

  // Switch to SSE for streaming progress to the UI
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let mdPath = req.file.path;
  let tmpDir = null;

  try {
    if (isPdf) {
      const result = await convertPdfToMarkdown(req.file.path, useVlm, msg => send({ type: 'log', message: msg }));
      mdPath = result.mdPath;
      tmpDir = result.tmpDir;
    } else if (isMarkitdown) {
      const result = await convertWithMarkitdown(req.file.path, msg => send({ type: 'log', message: msg }));
      mdPath = result.mdPath;
      tmpDir = result.tmpDir;
    }

    const chunkCount = await ingestFile(mdPath, req.file.originalname, projectId.trim(), phase);

    const docsDir = path.join(process.cwd(), 'public', 'documents', projectId.trim());
    fs.mkdirSync(docsDir, { recursive: true });
    fs.copyFileSync(req.file.path, path.join(docsDir, req.file.originalname));

    send({ type: 'done', message: `成功處理 ${req.file.originalname}`, chunks: chunkCount });
  } catch (err) {
    console.error('Upload error:', err);
    send({ type: 'error', message: err.message });
  } finally {
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    res.end();
  }
});

module.exports = router;
