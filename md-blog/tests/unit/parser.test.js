const { describe, it, expect, beforeAll } = require('bun:test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { parsePost } = require('../../src/parser');

const FIXTURES = path.join(__dirname, '../fixtures/posts');

// 建立臨時目錄用於測試
let tmpDir;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-blog-parser-'));
});

function writeTmp(filename, content) {
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('Feature 1: Parser — Front Matter 解析', () => {
  it('Scenario 1-1: 正常解析含完整 Front Matter 的 .md 檔案', () => {
    const filePath = writeTmp('complete.md', `---
title: 測試文章
date: 2026-01-15
---

# 標題

正文內容。`);

    const post = parsePost(filePath);

    expect(post.slug).toBe('complete');
    expect(post.title).toBe('測試文章');
    expect(post.date).toBe('2026-01-15');
    expect(typeof post.content).toBe('string');
    expect(typeof post.html).toBe('string');
  });

  it('Scenario 1-2: 缺少必填欄位 title 時拋出錯誤', () => {
    const filePath = writeTmp('no-title.md', `---
date: 2026-01-15
---

正文內容。`);

    expect(() => parsePost(filePath)).toThrow(/title/);
  });

  it('Scenario 1-3: 缺少必填欄位 date 時拋出錯誤', () => {
    const filePath = writeTmp('no-date.md', `---
title: 沒有日期
---

正文內容。`);

    expect(() => parsePost(filePath)).toThrow(/date/);
  });

  it('Scenario 1-4: slug 從檔名正確推導', () => {
    const filePath = writeTmp('hello-world.md', `---
title: Hello World
date: 2026-01-01
---

內容。`);

    const post = parsePost(filePath);
    expect(post.slug).toBe('hello-world');
  });

  it('Scenario 1-5: Markdown 內容正確轉換為 HTML', () => {
    const filePath = writeTmp('markdown.md', `---
title: Markdown 測試
date: 2026-01-01
---

# 標題

**粗體** 文字。`);

    const post = parsePost(filePath);
    expect(post.html).toContain('<h1>');
    expect(post.html).toContain('<strong>');
  });

  it('Scenario 1-6: 程式碼區塊產生帶 language class 的標記', () => {
    const filePath = writeTmp('code.md', `---
title: 程式碼測試
date: 2026-01-01
---

\`\`\`javascript
console.log('hello');
\`\`\``);

    const post = parsePost(filePath);
    expect(post.html).toContain('class="language-javascript"');
  });
});
