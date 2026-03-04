'use strict';
/**
 * test-quality-scanner.test.js
 *
 * 驗證 test-quality-scanner.js 模組的核心行為：
 * 1. detectSkipOnly — 偵測 skip/only 殘留
 * 2. detectEmptyTests — 偵測空測試體
 * 3. detectLargeFile — 偵測過大測試檔
 * 4. detectMissingDescribe — 偵測缺少 describe
 * 5. detectHardcodedPaths — 偵測硬編碼路徑
 * 6. scanFile — 整合單檔掃描
 * 7. scanTestQuality — 整合目錄掃描
 * 8. severity 分級正確性
 * 9. 邊界情況（空檔、乾淨測試）
 */

const { describe, test, expect, beforeAll, afterAll } = require('bun:test');
const fs = require('fs');
const { join } = require('path');
const os = require('os');

const { SCRIPTS_LIB } = require('../helpers/paths');
const SCANNER_PATH = join(SCRIPTS_LIB, 'analyzers/test-quality-scanner.js');

const {
  detectEmptyTests,
  detectLargeFile,
  detectMissingDescribe,
  detectHardcodedPaths,
  detectSkipOnly,
  scanFile,
  scanTestQuality,
} = require(SCANNER_PATH);

// ── 工具函式 ──────────────────────────────────────────────────────────────

/** 把多行字串轉成 lines 陣列（模擬 content.split('\n')）*/
function toLines(str) {
  return str.split('\n');
}

// ── detectSkipOnly ────────────────────────────────────────────────────────

describe('detectSkipOnly — skip/only 殘留偵測', () => {
  test('偵測 test.skip', () => {
    const lines = toLines(`
describe('foo', () => {
  test.skip('pending test', () => {
    expect(1).toBe(1);
  });
});
`);
    const issues = detectSkipOnly(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('skip-only');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('.skip');
  });

  test('偵測 test.only', () => {
    const lines = toLines(`
describe('foo', () => {
  test.only('focused test', () => {
    expect(1).toBe(1);
  });
});
`);
    const issues = detectSkipOnly(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('skip-only');
    expect(issues[0].message).toContain('.only');
  });

  test('偵測 describe.skip', () => {
    const lines = toLines(`
describe.skip('skipped suite', () => {
  test('foo', () => {
    expect(1).toBe(1);
  });
});
`);
    const issues = detectSkipOnly(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('skip-only');
    expect(issues[0].message).toContain('.skip');
  });

  test('偵測 describe.only', () => {
    const lines = toLines(`
describe.only('focused suite', () => {
  test('foo', () => {
    expect(1).toBe(1);
  });
});
`);
    const issues = detectSkipOnly(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('.only');
  });

  test('偵測 it.skip', () => {
    const lines = toLines(`
describe('foo', () => {
  it.skip('todo', () => {});
});
`);
    const issues = detectSkipOnly(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('skip-only');
  });

  test('多個 skip/only 各自回傳一個 issue', () => {
    const lines = toLines(`
test.skip('a', () => {});
test.only('b', () => { expect(1).toBe(1); });
`);
    const issues = detectSkipOnly(lines);
    expect(issues.length).toBe(2);
  });

  test('反向測試：正常 test 無 issue', () => {
    const lines = toLines(`
describe('正常測試', () => {
  test('normal', () => {
    expect(1).toBe(1);
  });
});
`);
    const issues = detectSkipOnly(lines);
    expect(issues.length).toBe(0);
  });

  test('回傳正確行號', () => {
    const lines = toLines(`line1
line2
test.skip('foo', () => { expect(1).toBe(1); });
`);
    const issues = detectSkipOnly(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].line).toBe(3);
  });
});

// ── detectEmptyTests ──────────────────────────────────────────────────────

describe('detectEmptyTests — 空測試體偵測', () => {
  test('偵測單行空測試體', () => {
    const lines = toLines(`
describe('foo', () => {
  test('empty', () => {});
});
`);
    const issues = detectEmptyTests(lines);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('empty-test');
    expect(issues[0].severity).toBe('error');
  });

  test('偵測單行空 async 測試體', () => {
    const lines = toLines(`
describe('foo', () => {
  test('empty async', async () => {});
});
`);
    const issues = detectEmptyTests(lines);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('empty-test');
  });

  test('偵測只有 console.log 沒有 expect 的測試', () => {
    const lines = toLines(`
describe('foo', () => {
  test('console only', () => {
    console.log('debug');
  });
});
`);
    const issues = detectEmptyTests(lines);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('empty-test');
  });

  test('反向測試：有 expect 的測試無 issue', () => {
    const lines = toLines(`
describe('foo', () => {
  test('with expect', () => {
    expect(1).toBe(1);
  });
});
`);
    const issues = detectEmptyTests(lines);
    expect(issues.length).toBe(0);
  });

  test('反向測試：有 expect 的 async 測試無 issue', () => {
    const lines = toLines(`
describe('foo', () => {
  test('async with expect', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
`);
    const issues = detectEmptyTests(lines);
    expect(issues.length).toBe(0);
  });

  test('it() 也被偵測', () => {
    const lines = toLines(`
describe('foo', () => {
  it('empty it', () => {});
});
`);
    const issues = detectEmptyTests(lines);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('empty-test');
  });
});

// ── detectLargeFile ───────────────────────────────────────────────────────

describe('detectLargeFile — 過大測試檔偵測', () => {
  test('超過 500 行回傳 warning', () => {
    // 建立 501 行的假內容
    const lines = Array.from({ length: 501 }, (_, i) => `// line ${i + 1}`);
    const issues = detectLargeFile(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('large-file');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('501');
    expect(issues[0].line).toBe(1);
  });

  test('剛好 500 行不觸發 issue', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `// line ${i + 1}`);
    const issues = detectLargeFile(lines);
    expect(issues.length).toBe(0);
  });

  test('反向測試：100 行的測試無 issue', () => {
    const lines = Array.from({ length: 100 }, () => 'test code');
    const issues = detectLargeFile(lines);
    expect(issues.length).toBe(0);
  });

  test('回傳訊息包含行數和上限', () => {
    const lines = Array.from({ length: 600 }, () => 'code');
    const issues = detectLargeFile(lines);
    expect(issues[0].message).toContain('600');
    expect(issues[0].message).toContain('500');
  });
});

// ── detectMissingDescribe ─────────────────────────────────────────────────

describe('detectMissingDescribe — 缺少 describe 偵測', () => {
  test('有 test 無 describe 回傳 info issue', () => {
    const lines = toLines(`
test('no describe', () => {
  expect(1).toBe(1);
});
`);
    const issues = detectMissingDescribe(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('missing-describe');
    expect(issues[0].severity).toBe('info');
    expect(issues[0].line).toBe(1);
  });

  test('有 it 無 describe 回傳 info issue', () => {
    const lines = toLines(`
it('no describe', () => {
  expect(1).toBe(1);
});
`);
    const issues = detectMissingDescribe(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].type).toBe('missing-describe');
  });

  test('反向測試：有 describe 的測試無 issue', () => {
    const lines = toLines(`
describe('suite', () => {
  test('with describe', () => {
    expect(1).toBe(1);
  });
});
`);
    const issues = detectMissingDescribe(lines);
    expect(issues.length).toBe(0);
  });

  test('反向測試：無任何測試的檔案無 issue', () => {
    const lines = toLines(`
// 純工具函式檔案
function helper() {}
module.exports = { helper };
`);
    const issues = detectMissingDescribe(lines);
    expect(issues.length).toBe(0);
  });

  test('每個檔案最多回傳一個 missing-describe issue', () => {
    const lines = toLines(`
test('a', () => { expect(1).toBe(1); });
test('b', () => { expect(2).toBe(2); });
test('c', () => { expect(3).toBe(3); });
`);
    const issues = detectMissingDescribe(lines);
    expect(issues.length).toBe(1);
  });
});

// ── detectHardcodedPaths ──────────────────────────────────────────────────

describe('detectHardcodedPaths — 硬編碼路徑偵測', () => {
  test('偵測 /Users/xxx 路徑', () => {
    const lines = toLines(`
const path = '/Users/sbu/project/test.js';
`);
    const issues = detectHardcodedPaths(lines);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('hardcoded-path');
    expect(issues[0].severity).toBe('warning');
  });

  test('偵測 /home/xxx 路徑', () => {
    const lines = toLines(`
const filePath = "/home/ubuntu/myproject/file.js";
`);
    const issues = detectHardcodedPaths(lines);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('hardcoded-path');
  });

  test('回傳正確行號', () => {
    const lines = toLines(`line1
line2
const p = '/Users/foo/bar';
`);
    const issues = detectHardcodedPaths(lines);
    expect(issues.length).toBe(1);
    expect(issues[0].line).toBe(3);
  });

  test('反向測試：/tmp 路徑不觸發（臨時目錄允許）', () => {
    const lines = toLines(`
const tmpDir = '/tmp/test-dir';
`);
    const issues = detectHardcodedPaths(lines);
    expect(issues.length).toBe(0);
  });

  test('反向測試：相對路徑不觸發', () => {
    const lines = toLines(`
const p = join(__dirname, '..', 'fixtures');
`);
    const issues = detectHardcodedPaths(lines);
    expect(issues.length).toBe(0);
  });

  test('反向測試：使用 helpers/paths 的路徑不觸發', () => {
    const lines = toLines(`
const { PROJECT_ROOT } = require('../helpers/paths');
const filePath = join(PROJECT_ROOT, 'tests', 'fixtures');
`);
    const issues = detectHardcodedPaths(lines);
    expect(issues.length).toBe(0);
  });

  test('反向測試：純註解行不觸發', () => {
    const lines = toLines(`
// 舊路徑範例：/Users/sbu/project（請勿直接複製）
`);
    const issues = detectHardcodedPaths(lines);
    expect(issues.length).toBe(0);
  });
});

// ── scanFile — 整合測試 ────────────────────────────────────────────────────

describe('scanFile — 單檔掃描整合', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'test-quality-scanner-'));
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('掃描空檔案回傳空 issues', () => {
    const filePath = join(tmpDir, 'empty.test.js');
    fs.writeFileSync(filePath, '', 'utf8');
    const result = scanFile(filePath);
    expect(result.filePath).toBe(filePath);
    expect(result.issues).toEqual([]);
  });

  test('掃描不存在的檔案回傳空 issues', () => {
    const result = scanFile(join(tmpDir, 'nonexistent.test.js'));
    expect(result.issues).toEqual([]);
  });

  test('乾淨的測試檔案無 issue', () => {
    const content = `'use strict';
const { describe, test, expect } = require('bun:test');

describe('正常測試', () => {
  test('加法計算', () => {
    expect(1 + 1).toBe(2);
  });

  test('字串比較', () => {
    expect('hello').toBe('hello');
  });
});
`;
    const filePath = join(tmpDir, 'clean.test.js');
    fs.writeFileSync(filePath, content, 'utf8');
    const result = scanFile(filePath);
    expect(result.issues.length).toBe(0);
  });

  test('包含 test.skip 的檔案回傳 skip-only issue', () => {
    const content = `'use strict';
const { describe, test, expect } = require('bun:test');

describe('有 skip 的測試', () => {
  test.skip('暫時跳過', () => {
    expect(1).toBe(1);
  });
  test('正常測試', () => {
    expect(2).toBe(2);
  });
});
`;
    const filePath = join(tmpDir, 'has-skip.test.js');
    fs.writeFileSync(filePath, content, 'utf8');
    const result = scanFile(filePath);
    const skipIssues = result.issues.filter(i => i.type === 'skip-only');
    expect(skipIssues.length).toBeGreaterThan(0);
    expect(skipIssues[0].severity).toBe('error');
  });

  test('包含 /Users/ 路徑的檔案回傳 hardcoded-path issue', () => {
    const content = `'use strict';
const { describe, test, expect } = require('bun:test');
const FIXTURE = '/Users/testuser/project/fixture.json';

describe('有硬編碼路徑', () => {
  test('讀取 fixture', () => {
    expect(FIXTURE).toBeTruthy();
  });
});
`;
    const filePath = join(tmpDir, 'hardcoded.test.js');
    fs.writeFileSync(filePath, content, 'utf8');
    const result = scanFile(filePath);
    const pathIssues = result.issues.filter(i => i.type === 'hardcoded-path');
    expect(pathIssues.length).toBeGreaterThan(0);
    expect(pathIssues[0].severity).toBe('warning');
  });

  test('回傳結構包含 filePath 和 issues 陣列', () => {
    const filePath = join(tmpDir, 'struct.test.js');
    fs.writeFileSync(filePath, `describe('d', () => { test('t', () => { expect(1).toBe(1); }); });`, 'utf8');
    const result = scanFile(filePath);
    expect(result.filePath).toBe(filePath);
    expect(Array.isArray(result.issues)).toBe(true);
  });

  test('每個 issue 包含 type、line、message、severity 欄位', () => {
    const content = `
describe('foo', () => {
  test.skip('skip test', () => { expect(1).toBe(1); });
});
`;
    const filePath = join(tmpDir, 'issue-fields.test.js');
    fs.writeFileSync(filePath, content, 'utf8');
    const result = scanFile(filePath);
    expect(result.issues.length).toBeGreaterThan(0);
    const issue = result.issues[0];
    expect(typeof issue.type).toBe('string');
    expect(typeof issue.line).toBe('number');
    expect(typeof issue.message).toBe('string');
    expect(typeof issue.severity).toBe('string');
    expect(issue.line).toBeGreaterThan(0);
  });
});

// ── scanTestQuality — 目錄掃描整合 ────────────────────────────────────────

describe('scanTestQuality — 目錄掃描整合', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'scan-quality-'));
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('空目錄回傳 { issues: [], summary: { total: 0, byType: {} } }', () => {
    const emptyDir = join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir);
    const result = scanTestQuality(emptyDir);
    expect(result.issues).toEqual([]);
    expect(result.summary.total).toBe(0);
    expect(result.summary.byType).toEqual({});
  });

  test('不存在的目錄回傳空結果', () => {
    const result = scanTestQuality(join(tmpDir, 'nonexistent'));
    expect(result.issues).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  test('目錄中的乾淨測試檔案無 issue', () => {
    const dir = join(tmpDir, 'clean');
    fs.mkdirSync(dir);
    fs.writeFileSync(join(dir, 'good.test.js'), `'use strict';
const { describe, test, expect } = require('bun:test');
describe('乾淨測試', () => {
  test('通過', () => { expect(true).toBe(true); });
});
`);
    const result = scanTestQuality(dir);
    expect(result.summary.total).toBe(0);
  });

  test('回傳結構包含 issues 陣列和 summary 物件', () => {
    const dir = join(tmpDir, 'structure');
    fs.mkdirSync(dir);
    const result = scanTestQuality(dir);
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.summary).toBe('object');
    expect(typeof result.summary.total).toBe('number');
    expect(typeof result.summary.byType).toBe('object');
  });

  test('summary.total 等於 issues 陣列長度', () => {
    const dir = join(tmpDir, 'count');
    fs.mkdirSync(dir);
    fs.writeFileSync(join(dir, 'bad.test.js'), `
describe('有問題', () => {
  test.skip('skip', () => { expect(1).toBe(1); });
  test.only('only', () => { expect(2).toBe(2); });
});
`);
    const result = scanTestQuality(dir);
    expect(result.summary.total).toBe(result.issues.length);
  });

  test('summary.byType 正確統計各類型 issue 數量', () => {
    const dir = join(tmpDir, 'bytype');
    fs.mkdirSync(dir);
    fs.writeFileSync(join(dir, 'mixed.test.js'), `
describe('混合問題', () => {
  test.skip('skip1', () => { expect(1).toBe(1); });
  test.skip('skip2', () => { expect(2).toBe(2); });
});
`);
    const result = scanTestQuality(dir);
    expect(result.summary.byType['skip-only']).toBe(2);
  });

  test('每個 issue 包含 filePath 欄位', () => {
    const dir = join(tmpDir, 'filepath');
    fs.mkdirSync(dir);
    fs.writeFileSync(join(dir, 'check.test.js'), `
describe('foo', () => {
  test.skip('s', () => { expect(1).toBe(1); });
});
`);
    const result = scanTestQuality(dir);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(typeof result.issues[0].filePath).toBe('string');
    expect(result.issues[0].filePath).toContain('check.test.js');
  });

  test('非 .test.js 檔案不被掃描', () => {
    const dir = join(tmpDir, 'non-test');
    fs.mkdirSync(dir);
    // 放入一個有問題的非測試檔
    fs.writeFileSync(join(dir, 'utils.js'), `
test.skip('not a test file', () => {});
`);
    const result = scanTestQuality(dir);
    expect(result.summary.total).toBe(0);
  });

  test('遞迴掃描子目錄', () => {
    const dir = join(tmpDir, 'recursive');
    const subDir = join(dir, 'sub');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(join(subDir, 'nested.test.js'), `
describe('nested', () => {
  test.skip('nested skip', () => { expect(1).toBe(1); });
});
`);
    const result = scanTestQuality(dir);
    expect(result.summary.total).toBeGreaterThan(0);
    expect(result.issues.some(i => i.filePath.includes('nested.test.js'))).toBe(true);
  });

  test('排除 node_modules 子目錄', () => {
    const dir = join(tmpDir, 'node-modules-test');
    const nodeModules = join(dir, 'node_modules', 'some-pkg');
    fs.mkdirSync(nodeModules, { recursive: true });
    fs.writeFileSync(join(nodeModules, 'fake.test.js'), `
test.skip('inside node_modules', () => {});
`);
    const result = scanTestQuality(dir);
    expect(result.summary.total).toBe(0);
  });
});

// ── severity 分級正確性 ───────────────────────────────────────────────────

describe('severity 分級正確性', () => {
  test('skip-only 嚴重度為 error', () => {
    const lines = toLines(`test.skip('foo', () => { expect(1).toBe(1); });`);
    const issues = detectSkipOnly(lines);
    expect(issues[0].severity).toBe('error');
  });

  test('empty-test 嚴重度為 error', () => {
    const lines = toLines(`test('empty', () => {});`);
    const issues = detectEmptyTests(lines);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('error');
  });

  test('large-file 嚴重度為 warning', () => {
    const lines = Array.from({ length: 501 }, () => 'code');
    const issues = detectLargeFile(lines);
    expect(issues[0].severity).toBe('warning');
  });

  test('hardcoded-path 嚴重度為 warning', () => {
    const lines = toLines(`const p = '/Users/foo/bar';`);
    const issues = detectHardcodedPaths(lines);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('warning');
  });

  test('missing-describe 嚴重度為 info', () => {
    const lines = toLines(`test('no describe', () => { expect(1).toBe(1); });`);
    const issues = detectMissingDescribe(lines);
    expect(issues[0].severity).toBe('info');
  });
});
