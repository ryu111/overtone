const CSS = `
  *, *::before, *::after { box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.7;
    color: #222;
    background: #fafafa;
    margin: 0;
    padding: 0;
  }

  .container {
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  header {
    border-bottom: 2px solid #e5e7eb;
    margin-bottom: 2.5rem;
    padding-bottom: 1.25rem;
  }

  header h1 {
    margin: 0 0 0.25rem;
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  header .meta {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 1.5rem;
    color: #4f46e5;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  article h1, article h2, article h3 {
    margin-top: 2rem;
    margin-bottom: 0.75rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  article h1 { font-size: 1.875rem; }
  article h2 { font-size: 1.5rem; }
  article h3 { font-size: 1.25rem; }

  article p {
    margin: 0 0 1.25rem;
  }

  article a {
    color: #4f46e5;
  }

  article code {
    background: #f3f4f6;
    padding: 0.15em 0.35em;
    border-radius: 4px;
    font-size: 0.875em;
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
  }

  article pre {
    background: #1e1e2e;
    color: #cdd6f4;
    padding: 1.25rem;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1.5rem 0;
  }

  article pre code {
    background: none;
    padding: 0;
    font-size: 0.875rem;
    color: inherit;
  }

  article blockquote {
    border-left: 4px solid #4f46e5;
    margin: 1.5rem 0;
    padding: 0.5rem 1.25rem;
    background: #f5f3ff;
    border-radius: 0 6px 6px 0;
    color: #4b5563;
  }

  article ul, article ol {
    padding-left: 1.75rem;
    margin: 0 0 1.25rem;
  }

  article li {
    margin-bottom: 0.35rem;
  }

  /* Index page */
  .site-title {
    font-size: 2rem;
    font-weight: 800;
    margin: 0 0 0.5rem;
    letter-spacing: -0.03em;
  }

  .site-subtitle {
    color: #6b7280;
    margin: 0;
  }

  .post-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .post-item {
    border-bottom: 1px solid #e5e7eb;
    padding: 1.25rem 0;
  }

  .post-item:last-child {
    border-bottom: none;
  }

  .post-item a {
    color: #111;
    text-decoration: none;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .post-item a:hover {
    color: #4f46e5;
  }

  .post-date {
    color: #9ca3af;
    font-size: 0.85rem;
    margin-top: 0.25rem;
  }

  .empty-state {
    color: #9ca3af;
    font-size: 1rem;
    padding: 2rem 0;
    text-align: center;
  }
`;

/**
 * 產生單篇文章的完整 HTML 頁面
 * @param {{ slug: string, title: string, date: string, html: string }} post
 * @param {Array} allPosts
 * @returns {string}
 */
function renderPost(post, allPosts) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(post.title)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <a class="back-link" href="../index.html">&larr; 返回首頁</a>
    <header>
      <h1>${escapeHtml(post.title)}</h1>
      <div class="meta">${escapeHtml(post.date)}</div>
    </header>
    <article>
      ${post.html}
    </article>
  </div>
</body>
</html>`;
}

/**
 * 產生首頁（文章清單）的完整 HTML 頁面
 * @param {Array} posts - 已按 date 降冪排序的 PostData 陣列
 * @returns {string}
 */
function renderIndex(posts) {
  let listHtml;
  if (posts.length === 0) {
    listHtml = '<p class="empty-state">目前還沒有文章。</p>';
  } else {
    const items = posts
      .map(
        (p) => `    <li class="post-item">
      <a href="posts/${escapeHtml(p.slug)}.html">${escapeHtml(p.title)}</a>
      <div class="post-date">${escapeHtml(p.date)}</div>
    </li>`
      )
      .join('\n');
    listHtml = `<ul class="post-list">\n${items}\n  </ul>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>部落格</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <header>
      <h1 class="site-title">部落格</h1>
      <p class="site-subtitle">所有文章</p>
    </header>
    ${listHtml}
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { renderPost, renderIndex };
