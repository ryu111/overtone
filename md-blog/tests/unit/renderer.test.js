const { describe, it, expect } = require('bun:test');
const { renderPost, renderIndex } = require('../../src/renderer');

// 測試用 PostData
function makePost(overrides = {}) {
  return {
    slug: 'test-post',
    title: '測試文章',
    date: '2026-01-15',
    content: '# Hello\n\nWorld',
    html: '<h1>Hello</h1><p>World</p>',
    description: '',
    ...overrides,
  };
}

describe('Feature 2: Renderer — HTML 頁面產生', () => {
  it('Scenario 2-1: renderPost 產出含完整結構的 HTML 頁面', () => {
    const post = makePost();
    const html = renderPost(post, []);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
    expect(html).toContain('<style>');
  });

  it('Scenario 2-2: renderPost 在頁面中顯示文章標題與日期', () => {
    const post = makePost({ title: '我的第一篇文章', date: '2026-01-15' });
    const html = renderPost(post, []);

    expect(html).toContain('我的第一篇文章');
    expect(html).toContain('2026-01-15');
  });

  it('Scenario 2-3: renderPost 包含返回首頁連結', () => {
    const post = makePost();
    const html = renderPost(post, []);

    // href 含 ../index.html 或 /
    const hasBackLink = html.includes('../index.html') || html.match(/href=["']\/["']/);
    expect(hasBackLink).toBe(true);
  });

  it('Scenario 2-4: renderPost 嵌入文章 HTML 內容', () => {
    const post = makePost({ html: '<h1>Hello</h1><p>World</p>' });
    const html = renderPost(post, []);

    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<p>World</p>');
  });

  it('Scenario 2-5: renderIndex 產出所有文章的清單頁', () => {
    const posts = [
      makePost({ slug: 'post-a', title: '文章甲', date: '2026-03-01' }),
      makePost({ slug: 'post-b', title: '文章乙', date: '2026-02-01' }),
      makePost({ slug: 'post-c', title: '文章丙', date: '2026-01-01' }),
    ];
    const html = renderIndex(posts);

    expect(html).toContain('文章甲');
    expect(html).toContain('文章乙');
    expect(html).toContain('文章丙');
    expect(html).toContain('posts/post-a.html');
    expect(html).toContain('posts/post-b.html');
    expect(html).toContain('posts/post-c.html');
  });

  it('Scenario 2-6: renderIndex 在無文章時產出空清單頁', () => {
    const html = renderIndex([]);

    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('posts/');
  });
});
