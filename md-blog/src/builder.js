const fs = require('fs');
const path = require('path');
const { parsePost } = require('./parser');
const { renderPost, renderIndex } = require('./renderer');

/**
 * 建置整個部落格
 * @param {string} inputDir - 含 .md 檔案的來源目錄
 * @param {string} outputDir - 輸出目錄
 * @returns {{ success: boolean, skipped: number, outputDir: string }}
 */
function build(inputDir, outputDir) {
  // 清空並重建輸出目錄
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'posts'), { recursive: true });

  // 讀取所有 .md 檔案
  let mdFiles = [];
  if (fs.existsSync(inputDir)) {
    mdFiles = fs
      .readdirSync(inputDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(inputDir, f));
  }

  // 解析文章，失敗的 skip
  const posts = [];
  let skipped = 0;

  for (const filePath of mdFiles) {
    try {
      const post = parsePost(filePath);
      posts.push(post);
    } catch {
      skipped++;
    }
  }

  // 按日期降冪排序
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // 產出各文章頁
  for (const post of posts) {
    const html = renderPost(post, posts);
    fs.writeFileSync(path.join(outputDir, 'posts', `${post.slug}.html`), html, 'utf-8');
  }

  // 產出首頁
  const indexHtml = renderIndex(posts);
  fs.writeFileSync(path.join(outputDir, 'index.html'), indexHtml, 'utf-8');

  return { success: true, skipped, outputDir };
}

module.exports = { build };
