const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { ingestFile, ingestFolder, phaseFromFolderName } = require('../services/ingestion');
const { fixLatin1Mojibake } = require('../services/uploadName');
const { blockWhenReadOnly } = require('../middleware/readOnly');
const vectorStore = require('../adapters/vector');

const router = express.Router();

const VALID_PHASES = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);

// 由 markitdown 轉換為 Markdown 的文件格式（PDF 仍走 MinerU，不在此清單）
const MARKITDOWN_EXTS = new Set([
  '.docx', '.pptx', '.xlsx', '.xls', '.html', '.htm', '.csv', '.json', '.xml', '.epub',
]);

const storage = multer.diskStorage({
  destination: path.join(process.cwd(), 'uploads'),
  // multer 1.x 把 UTF-8 filename 當 latin1 解，中文/全形檔名變 mojibake；
  // 在此就地修正 originalname，下游（docId、持久化、下載、訊息）一次全對。
  filename: (req, file, cb) => {
    file.originalname = fixLatin1Mojibake(file.originalname);
    cb(null, file.originalname);
  },
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

// MinerU 呼叫方式依機器安裝方式而異（build server 用 conda env、測試機用 uv 裝進 PATH），
// 以 MINERU_CMD 環境變數覆寫（空白分隔，如 `mineru`）；預設維持 conda，正式機不受影響。
const MINERU_CMD = (process.env.MINERU_CMD || 'conda run --no-capture-output -n mineru mineru').trim().split(/\s+/);

function convertPdfToMarkdown(pdfPath, useVlm, onLog) {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineru-'));
    console.log(`[MinerU] 開始轉換：${pdfPath} (VLM: ${useVlm})`);

    const args = [...MINERU_CMD.slice(1), '-p', pdfPath, '-o', tmpDir];
    if (!useVlm) args.push('-b', 'pipeline');

    const proc = spawn(MINERU_CMD[0], args);

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
    // 轉檔類上傳（.docx/.pdf 等）把轉出的 md 一併持久化為 `<原檔名>.md` sibling：
    // 啟動回填只吃 md、不重跑轉檔，沒這份 sibling 的文件在 SIDECAR_VERSION bump 後
    // 永遠追不上（每次啟動被跳過）。直接上傳 .md 者原檔即 md，不需 sibling。
    if (mdPath !== req.file.path) {
      fs.copyFileSync(mdPath, path.join(docsDir, `${req.file.originalname}.md`));
    }

    send({ type: 'done', message: `成功處理 ${req.file.originalname}`, chunks: chunkCount });
  } catch (err) {
    console.error('Upload error:', err);
    send({ type: 'error', message: err.message });
  } finally {
    if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    res.end();
  }
});

// ── 資料夾進料（md + 圖 + PDF）：暫存區重建目錄樹後走既有 ingestFolder，規則與 CLI 一致 ──

// 資料夾內允許的副檔名；其他（.DS_Store、.tmp…）整批報錯（使用者要求「直接報錯」而非靜默略過）
const FOLDER_ALLOWED_EXTS = new Set(['.md', '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);

// 多檔上傳：隨機暫存檔名（避免同名互撞），檔數/大小上限防呆誤選巨大資料夾
const folderUpload = multer({
  dest: path.join(process.cwd(), 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024, files: 300 },
});

router.post('/folder', blockWhenReadOnly, folderUpload.array('files'), async (req, res) => {
  const files = req.files || [];
  let tempRoot = null;
  try {
    if (!files.length) return res.status(400).json({ error: '請選擇要上傳的資料夾' });

    const projectId = (req.body.project_id || '').trim();
    if (!projectId) return res.status(400).json({ error: 'project_id 為必填' });

    // paths：與 files 同序的相對路徑（multipart 的 filename 不保證保留路徑）
    let paths = req.body.paths === undefined ? [] : req.body.paths;
    if (!Array.isArray(paths)) paths = [paths];
    paths = paths.map(fixLatin1Mojibake);
    if (paths.length !== files.length) {
      return res.status(400).json({ error: 'paths 與 files 數量不一致' });
    }

    // 路徑防護：不接受絕對路徑、反斜線、空段與 . / ..；且必須含資料夾名一層
    for (const p of paths) {
      const segs = p.split('/');
      if (!p || p.startsWith('/') || p.includes('\\') || segs.length < 2
          || segs.some(seg => !seg || seg === '.' || seg === '..')) {
        return res.status(400).json({ error: `無效路徑:${p}` });
      }
    }
    const folderName = paths[0].split('/')[0];
    if (!paths.every(p => p.split('/')[0] === folderName)) {
      return res.status(400).json({ error: '所有檔案必須屬於同一個資料夾' });
    }

    // 副檔名白名單：違規直接報錯並列出檔名
    const illegal = paths.filter(p => !FOLDER_ALLOWED_EXTS.has(path.extname(p).toLowerCase()));
    if (illegal.length) {
      return res.status(400).json({ error: `含不允許的檔案(僅接受 md/pdf/圖檔):${illegal.join('、')}` });
    }

    // 覆蓋確認：同名 docId 已存在且未帶 overwrite → 409，由前端確認後重送
    const docId = folderName;
    const existing = await vectorStore.listDocuments(projectId);
    if (existing.some(d => d.docId === docId) && req.body.overwrite !== 'true') {
      return res.status(409).json({ error: `文件「${docId}」已存在,重新上傳將整夾替換`, docId });
    }

    // phase：下拉優先，否則從資料夾名的 NPDS 代碼推
    let phase = req.body.phase;
    if (phase) {
      if (!VALID_PHASES.has(phase)) return res.status(400).json({ error: 'phase 必須為 C1 至 C7' });
    } else {
      phase = phaseFromFolderName(folderName);
    }
    if (!phase) return res.status(400).json({ error: '無法從資料夾名推得階段,請選擇 NPDS 階段' });

    // 暫存區重建目錄樹（雙重防護：resolve 後必須仍在 tempRoot 內）
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-upload-'));
    files.forEach((f, i) => {
      const dest = path.resolve(tempRoot, paths[i]);
      if (!dest.startsWith(tempRoot + path.sep)) throw new Error(`無效路徑:${paths[i]}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(f.path, dest);
    });

    // 進料規則（恰好一個 PDF、至少一個 md、wiki-link 圖、整夾持久化、重灌替換）全在 ingestFolder
    const result = await ingestFolder(path.join(tempRoot, folderName), { projectId, phase });
    res.json(result);
  } catch (err) {
    console.error('Folder upload error:', err);
    res.status(400).json({ error: err.message });
  } finally {
    for (const f of files) { try { fs.unlinkSync(f.path); } catch {} }
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

module.exports = router;
