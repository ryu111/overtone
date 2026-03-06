const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { build } = require('../../src/builder');

const FIXTURES = path.join(__dirname, '../fixtures/posts');

let outputDir;
let inputDir;

beforeEach(() => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-blog-out-'));
  inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-blog-in-'));
});

afterEach(() => {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.rmSync(inputDir, { recursive: true, force: true });
});

function writePost(dir, filename, content) {
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

function validPost(title, date, body = '正文內容。') {
  return `---\ntitle: ${title}\ndate: ${date}\n---\n\n${body}`;
}

describe('Feature 3: Builder — 端到端建置流程', () => {
  it('Scenario 3-1: build 正常執行後產出 index.html 與各文章頁', () => {
    writePost(inputDir, 'post-a.md', validPost('文章甲', '2026-01-01'));
    writePost(inputDir, 'post-b.md', validPost('文章乙', '2026-02-01'));

    const result = build(inputDir, outputDir);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(0);
    expect(result.outputDir).toBe(outputDir);
    expect(fs.existsSync(path.join(outputDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'posts', 'post-a.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'posts', 'post-b.html'))).toBe(true);
  });

  it('Scenario 3-2: build 執行前清空 outputDir', () => {
    // 先在 outputDir 放一個舊檔案
    fs.writeFileSync(path.join(outputDir, 'stale-file.html'), '<html>old</html>', 'utf-8');

    writePost(inputDir, 'new-post.md', validPost('新文章', '2026-01-01'));

    build(inputDir, outputDir);

    expect(fs.existsSync(path.join(outputDir, 'stale-file.html'))).toBe(false);
  });

  it('Scenario 3-3: 解析失敗的檔案被 skip 且不中斷整體建置', () => {
    writePost(inputDir, 'valid.md', validPost('合法文章', '2026-01-01'));
    writePost(inputDir, 'invalid.md', `---\ndescription: 沒有 title 和 date\n---\n\n內容`);

    const result = build(inputDir, outputDir);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(1);
    expect(fs.existsSync(path.join(outputDir, 'posts', 'valid.html'))).toBe(true);
  });

  it('Scenario 3-4: inputDir 為空目錄時成功建置空首頁', () => {
    // inputDir 已建立但是空的
    const result = build(inputDir, outputDir);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(0);
    expect(fs.existsSync(path.join(outputDir, 'index.html'))).toBe(true);
  });

  it('Scenario 3-5: 首頁文章連結按日期降冪排序', () => {
    writePost(inputDir, 'early.md', validPost('早期文章', '2026-01-01'));
    writePost(inputDir, 'latest.md', validPost('最新文章', '2026-03-01'));
    writePost(inputDir, 'middle.md', validPost('中間文章', '2026-02-01'));

    build(inputDir, outputDir);

    const indexHtml = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf-8');

    const pos2026_03 = indexHtml.indexOf('2026-03-01');
    const pos2026_02 = indexHtml.indexOf('2026-02-01');
    const pos2026_01 = indexHtml.indexOf('2026-01-01');

    // 降冪：2026-03-01 出現在 2026-02-01 之前，2026-02-01 在 2026-01-01 之前
    expect(pos2026_03).toBeGreaterThan(-1);
    expect(pos2026_02).toBeGreaterThan(-1);
    expect(pos2026_01).toBeGreaterThan(-1);
    expect(pos2026_03).toBeLessThan(pos2026_02);
    expect(pos2026_02).toBeLessThan(pos2026_01);
  });

  it('Scenario 3-6: 文章頁包含返回首頁連結', () => {
    writePost(inputDir, 'my-post.md', validPost('我的文章', '2026-01-01'));

    build(inputDir, outputDir);

    const postHtml = fs.readFileSync(path.join(outputDir, 'posts', 'my-post.html'), 'utf-8');
    expect(postHtml).toContain('../index.html');
  });
});

describe('Feature 4: CLI — 命令列介面（子進程測試）', () => {
  const { execFileSync, spawnSync } = require('child_process');
  const indexJs = path.join(__dirname, '../../index.js');

  it('Scenario 4-1: 正常執行 build 指令並指定 output 目錄', () => {
    writePost(inputDir, 'post.md', validPost('CLI 文章', '2026-01-01'));

    const result = spawnSync('node', [indexJs, 'build', inputDir, '--output', outputDir], {
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(outputDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'posts', 'post.html'))).toBe(true);
  });

  it('Scenario 4-2: 不指定 --output 時使用預設輸出目錄', () => {
    writePost(inputDir, 'post.md', validPost('預設輸出文章', '2026-01-01'));

    // 在 md-blog 根目錄執行，預設輸出到 ./dist
    const mdBlogRoot = path.join(__dirname, '../..');
    const defaultDist = path.join(mdBlogRoot, 'dist');

    // 清理可能存在的 dist
    if (fs.existsSync(defaultDist)) {
      fs.rmSync(defaultDist, { recursive: true, force: true });
    }

    const result = spawnSync('node', [indexJs, 'build', inputDir], {
      encoding: 'utf-8',
      cwd: mdBlogRoot,
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(defaultDist, 'index.html'))).toBe(true);

    // 清理 dist
    if (fs.existsSync(defaultDist)) {
      fs.rmSync(defaultDist, { recursive: true, force: true });
    }
  });

  it('Scenario 4-3: 缺少 inputDir 參數時回報錯誤', () => {
    const result = spawnSync('node', [indexJs, 'build'], {
      encoding: 'utf-8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/inputDir|input/i);
  });

  it('Scenario 4-4: inputDir 路徑不存在時回報錯誤', () => {
    const result = spawnSync('node', [indexJs, 'build', '/non/existent/path'], {
      encoding: 'utf-8',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/不存在|not exist|exist/i);
  });
});
