const path = require('path');
const fs = require('fs');
const matter = require('gray-matter');
const { marked } = require('marked');

// 設定 marked 以支援語言 class
marked.setOptions({
  gfm: true,
});

/**
 * 解析單一 Markdown 文章檔案
 * @param {string} filePath - 絕對或相對路徑
 * @returns {{ slug: string, title: string, date: string, content: string, html: string }}
 */
function parsePost(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);

  if (!data.title) {
    throw new Error(`缺少必填欄位 title：${filePath}`);
  }
  if (!data.date) {
    throw new Error(`缺少必填欄位 date：${filePath}`);
  }

  const slug = path.basename(filePath, '.md');
  const html = marked.parse(content);

  return {
    slug,
    title: data.title,
    date: typeof data.date === 'string' ? data.date : data.date.toISOString().slice(0, 10),
    content,
    html,
    description: data.description || '',
    draft: data.draft || false,
  };
}

module.exports = { parsePost };
