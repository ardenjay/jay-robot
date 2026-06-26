// 把 md 內「相對」圖片連結 ![](images/x.jpg) 改寫成以 docId 為基底的絕對路徑。
// 只改 images/ 開頭的相對連結；絕對路徑（/...）與外部 URL（http...）不動。
// 路徑各段做 URL 編碼，避免 docId/檔名含空格（如「C204 MTi 600」）破壞 Markdown 圖片語法。
function rewriteImageLinks(markdownText, projectId, docId) {
  const base = `/documents/${encodeURIComponent(projectId)}/${encodeURIComponent(docId)}`;
  return markdownText.replace(
    /(!\[[^\]]*\]\()images\/([^)\s]+)(\))/g,
    (_, open, file, close) => `${open}${base}/images/${encodeURIComponent(file)}${close}`,
  );
}

module.exports = { rewriteImageLinks };
