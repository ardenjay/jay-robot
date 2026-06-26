const fs = require('fs');
const path = require('path');
const { rewriteImageLinks } = require('./imageLinks');

// 解析來源檢視內容（純函式，不碰 DB）。回傳 { status, body }。
// 目錄（folder 進料：md+images）→ markdown；單一原始檔（如 web 上傳的 pdf）→ file url；不存在 → 404。
function resolveDocView(docsRoot, projectId, docId) {
  const base = path.resolve(docsRoot, projectId);
  const target = path.resolve(base, docId);
  // 防路徑穿越：target 必須在 base 之內
  if (target !== base && !target.startsWith(base + path.sep)) {
    return { status: 400, body: { error: '無效路徑' } };
  }
  if (!fs.existsSync(target)) {
    return { status: 404, body: { error: '找不到文件' } };
  }
  if (fs.statSync(target).isDirectory()) {
    const mdFiles = fs.readdirSync(target).filter(f => f.toLowerCase().endsWith('.md')).sort();
    // 持久化的 md 原檔內仍是相對圖連結；回傳前改寫成絕對路徑（與 chunk 一致），讓檢視器顯示得出圖。
    const markdown = mdFiles
      .map(f => rewriteImageLinks(fs.readFileSync(path.join(target, f), 'utf-8'), projectId, docId))
      .join('\n\n');
    return { status: 200, body: { type: 'markdown', markdown } };
  }
  return {
    status: 200,
    body: { type: 'file', url: `/documents/${encodeURIComponent(projectId)}/${encodeURIComponent(docId)}` },
  };
}

// 解析要下載的「原始檔」實體路徑。檔案型 docId → 該檔；目錄型 → 目錄內的 .pdf。
// 回傳 { filePath, filename } 或 null（找不到 / 路徑穿越）。
function resolveDownload(docsRoot, projectId, docId) {
  const base = path.resolve(docsRoot, projectId);
  const target = path.resolve(base, docId);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  if (!fs.existsSync(target)) return null;
  if (fs.statSync(target).isDirectory()) {
    const pdf = fs.readdirSync(target).find(f => f.toLowerCase().endsWith('.pdf'));
    return pdf ? { filePath: path.join(target, pdf), filename: pdf } : null;
  }
  return { filePath: target, filename: docId };
}

module.exports = { resolveDocView, resolveDownload };
