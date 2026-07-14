const fs = require('fs');
const path = require('path');

// 遞迴掃描資料夾，建「檔名 → 相對子路徑」索引（略過 .md；供 wiki-link 解析用）。
// 同名檔以排序後的掃描順序取第一個，行為穩定。
function buildFileIndex(folderPath, prefix = '', index = new Map()) {
  for (const entry of fs.readdirSync(folderPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      buildFileIndex(path.join(folderPath, entry.name), rel, index);
    } else if (!entry.name.toLowerCase().endsWith('.md') && !index.has(entry.name)) {
      index.set(entry.name, rel);
    }
  }
  return index;
}

// 相對子路徑逐段 URL 編碼（保留 / 結構），空格檔名/資料夾名不會破壞 Markdown 語法。
function encodePathSegments(relPath) {
  return relPath.split('/').map(encodeURIComponent).join('/');
}

// 把 md 內的圖片連結改寫成以 docId 為基底的絕對路徑。支援兩種語法：
// 1. 標準相對連結 ![](images/x.jpg) → 絕對路徑（絕對路徑 /... 與外部 URL http... 不動）
// 2. Obsidian wiki-link ![[name.jpg]] / ![[name.jpg|alt]] → 以 fileIndex 查實際子路徑後改寫；
//    未命中或未傳 fileIndex 則保留原樣（不杜撰路徑）。
// 路徑各段做 URL 編碼，避免 docId/檔名含空格（如「C204 MTi 600」）破壞 Markdown 圖片語法。
function rewriteImageLinks(markdownText, projectId, docId, fileIndex) {
  const base = `/documents/${encodeURIComponent(projectId)}/${encodeURIComponent(docId)}`;
  let out = markdownText.replace(
    /(!\[[^\]]*\]\()images\/([^)\s]+)(\))/g,
    (_, open, file, close) => `${open}${base}/images/${encodeURIComponent(file)}${close}`,
  );
  if (fileIndex) {
    out = out.replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (whole, name, alt) => {
      const rel = fileIndex.get(name.trim());
      if (!rel) return whole;
      return `![${alt || ''}](${base}/${encodePathSegments(rel)})`;
    });
  }
  return out;
}

module.exports = { rewriteImageLinks, buildFileIndex };
