'use strict';
/**
 * dead-code-scanner.test.js — Dead Code 偵測器單元測試
 *
 * 覆蓋：
 *   Feature 1: parseExportKeys — 解析 module.exports 的 key
 *   Feature 2: isExportUsed — 偵測 export key 是否被使用
 *   Feature 3: isModuleRequired — 偵測模組是否被 require
 *   Feature 4: scanUnusedExports — 未使用 exports 偵測
 *   Feature 5: scanOrphanFiles — 孤立檔案偵測
 *   Feature 6: runDeadCodeScan — 整合掃描入口
 *   Feature 7: 邊界情況
 */

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const { join } = require('path');
const os = require('os');

const {
  parseExportKeys,
  isExportUsed,
  isModuleRequired,
  scanUnusedExports,
  scanOrphanFiles,
  runDeadCodeScan,
  collectJsFiles,
} = require('../../plugins/overtone/scripts/lib/dead-code-scanner');

// ── 沙盒工具 ──────────────────────────────────────────────────────────────

let tmpDir;

function setupSandbox() {
  tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'dead-code-scanner-test-'));
  return tmpDir;
}

function teardownSandbox() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = null;
}

/**
 * 在沙盒中建立 lib 目錄與指定檔案。
 * @param {Object.<string, string>} files  - { 'moduleName.js': content, ... }
 * @returns {string} libDir 路徑
 */
function createLibDir(files) {
  const libDir = join(tmpDir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(join(libDir, name), content, 'utf8');
  }
  return libDir;
}

/**
 * 在沙盒中建立搜尋目錄與指定檔案。
 * @param {Object.<string, string>} files  - { 'path/to/file.js': content, ... }
 * @returns {string} searchDir 路徑
 */
function createSearchDir(files) {
  const searchDir = join(tmpDir, 'search');
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(searchDir, name);
    fs.mkdirSync(join(filePath, '..'), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  return searchDir;
}

// ══════════════════════════════════════════════════════════════════
// Feature 1: parseExportKeys
// ══════════════════════════════════════════════════════════════════

describe('parseExportKeys', () => {
  test('解析 shorthand 格式 module.exports = { a, b, c }', () => {
    const content = `
'use strict';
function a() {}
function b() {}
const c = 1;
module.exports = { a, b, c };
    `;
    const keys = parseExportKeys(content);
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).toContain('c');
  });

  test('解析 key: value 格式 module.exports = { foo: fooImpl }', () => {
    const content = `
module.exports = {
  readState: readStateImpl,
  writeState: writeStateImpl,
};
    `;
    const keys = parseExportKeys(content);
    expect(keys).toContain('readState');
    expect(keys).toContain('writeState');
  });

  test('解析 module.exports.x = ... 逐個賦值格式', () => {
    const content = `
module.exports.alpha = function() {};
module.exports.beta = 42;
    `;
    const keys = parseExportKeys(content);
    expect(keys).toContain('alpha');
    expect(keys).toContain('beta');
  });

  test('混合兩種格式時合併所有 keys', () => {
    const content = `
module.exports = { foo, bar };
module.exports.baz = 1;
    `;
    const keys = parseExportKeys(content);
    expect(keys).toContain('foo');
    expect(keys).toContain('bar');
    expect(keys).toContain('baz');
  });

  test('沒有 module.exports 時回傳空陣列', () => {
    const content = `function foo() {} exports.foo = foo;`;
    const keys = parseExportKeys(content);
    expect(keys).toEqual([]);
  });

  test('class instance export 不被解析（module.exports = new ...）', () => {
    // 這類 export 在 scanUnusedExports 中被整體跳過，但 parseExportKeys 回傳空
    const content = `class MyClass {} module.exports = new MyClass();`;
    const keys = parseExportKeys(content);
    // module.exports = new ... 不符合物件 { } 模式，應回傳空
    expect(keys).toEqual([]);
  });

  test('不重複回傳相同 key', () => {
    const content = `module.exports = { foo, foo };`;
    const keys = parseExportKeys(content);
    const fooCount = keys.filter((k) => k === 'foo').length;
    expect(fooCount).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: isExportUsed
// ══════════════════════════════════════════════════════════════════

describe('isExportUsed', () => {
  beforeEach(() => setupSandbox());
  afterEach(() => teardownSandbox());

  test('解構 require 時偵測為已使用', () => {
    const searchDir = createSearchDir({
      'consumer.js': `
const { myFunc } = require('./lib/mymodule');
myFunc();
      `,
    });
    const files = collectJsFiles(searchDir);
    expect(isExportUsed('myFunc', 'mymodule', files)).toBe(true);
  });

  test('屬性存取時偵測為已使用（module.myFunc）', () => {
    const searchDir = createSearchDir({
      'consumer.js': `
const mod = require('./lib/mymodule');
mod.myFunc();
      `,
    });
    const files = collectJsFiles(searchDir);
    expect(isExportUsed('myFunc', 'mymodule', files)).toBe(true);
  });

  test('未被使用時回傳 false', () => {
    const searchDir = createSearchDir({
      'consumer.js': `
const { otherFunc } = require('./lib/mymodule');
otherFunc();
      `,
    });
    const files = collectJsFiles(searchDir);
    expect(isExportUsed('unusedKey', 'mymodule', files)).toBe(false);
  });

  test('完全未 require 模組時回傳 false', () => {
    const searchDir = createSearchDir({
      'consumer.js': `
const { somethingElse } = require('./lib/othermodule');
      `,
    });
    const files = collectJsFiles(searchDir);
    expect(isExportUsed('myFunc', 'mymodule', files)).toBe(false);
  });

  test('空的 searchFiles 陣列回傳 false', () => {
    expect(isExportUsed('anyKey', 'anyModule', [])).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 3: isModuleRequired
// ══════════════════════════════════════════════════════════════════

describe('isModuleRequired', () => {
  beforeEach(() => setupSandbox());
  afterEach(() => teardownSandbox());

  test('require 相對路徑時偵測到引用', () => {
    const searchDir = createSearchDir({
      'hook.js': `const registry = require('../scripts/lib/registry');`,
    });
    const files = collectJsFiles(searchDir);
    expect(isModuleRequired('registry', files)).toBe(true);
  });

  test('require 絕對路徑時偵測到引用', () => {
    const searchDir = createSearchDir({
      'hook.js': `const state = require('/path/to/lib/state');`,
    });
    const files = collectJsFiles(searchDir);
    expect(isModuleRequired('state', files)).toBe(true);
  });

  test('未被 require 的模組回傳 false', () => {
    const searchDir = createSearchDir({
      'hook.js': `const registry = require('./lib/registry');`,
    });
    const files = collectJsFiles(searchDir);
    expect(isModuleRequired('orphanModule', files)).toBe(false);
  });

  test('空的 searchFiles 陣列回傳 false', () => {
    expect(isModuleRequired('anyModule', [])).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 4: scanUnusedExports
// ══════════════════════════════════════════════════════════════════

describe('scanUnusedExports', () => {
  beforeEach(() => setupSandbox());
  afterEach(() => teardownSandbox());

  test('偵測到未使用的 export', () => {
    const libDir = createLibDir({
      'mylib.js': `
'use strict';
function usedFunc() {}
function unusedFunc() {}
module.exports = { usedFunc, unusedFunc };
      `,
    });
    const searchDir = createSearchDir({
      'consumer.js': `
const { usedFunc } = require('./lib/mylib');
usedFunc();
      `,
    });

    const result = scanUnusedExports(libDir, [searchDir]);

    expect(result.unusedExports.length).toBeGreaterThan(0);
    const unusedNames = result.unusedExports.map((e) => e.exportName);
    expect(unusedNames).toContain('unusedFunc');
    expect(unusedNames).not.toContain('usedFunc');
  });

  test('全部被使用時 unusedExports 為空', () => {
    const libDir = createLibDir({
      'mylib.js': `
module.exports = { alpha, beta };
function alpha() {}
function beta() {}
      `,
    });
    const searchDir = createSearchDir({
      'consumer.js': `
const { alpha, beta } = require('./lib/mylib');
alpha();
beta();
      `,
    });

    const result = scanUnusedExports(libDir, [searchDir]);

    const unusedInMylib = result.unusedExports.filter((e) =>
      e.file.includes('mylib.js')
    );
    expect(unusedInMylib.length).toBe(0);
  });

  test('class instance export 的模組被跳過（不回報 false positive）', () => {
    const libDir = createLibDir({
      'singleton.js': `
class MyService {}
module.exports = new MyService();
      `,
    });
    const searchDir = createSearchDir({
      'consumer.js': `// 未使用 singleton`,
    });

    const result = scanUnusedExports(libDir, [searchDir]);

    const singletonIssues = result.unusedExports.filter((e) =>
      e.file.includes('singleton.js')
    );
    expect(singletonIssues.length).toBe(0);
  });

  test('回傳結構包含 unusedExports 陣列和 summary', () => {
    const libDir = createLibDir({
      'mod.js': `module.exports = { x };`,
    });
    const result = scanUnusedExports(libDir, []);

    expect(Array.isArray(result.unusedExports)).toBe(true);
    expect(typeof result.summary).toBe('object');
    expect(typeof result.summary.total).toBe('number');
    expect(typeof result.summary.byFile).toBe('object');
  });

  test('每個 unusedExports 項目包含必要欄位', () => {
    const libDir = createLibDir({
      'utils.js': `module.exports = { foo, bar };`,
    });
    const result = scanUnusedExports(libDir, []);

    for (const item of result.unusedExports) {
      expect(typeof item.file).toBe('string');
      expect(typeof item.exportName).toBe('string');
      expect(item.type).toBe('unused-export');
    }
  });

  test('summary.total 與 unusedExports.length 一致', () => {
    const libDir = createLibDir({
      'mod.js': `module.exports = { a, b, c };`,
    });
    const result = scanUnusedExports(libDir, []);

    expect(result.summary.total).toBe(result.unusedExports.length);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 5: scanOrphanFiles
// ══════════════════════════════════════════════════════════════════

describe('scanOrphanFiles', () => {
  beforeEach(() => setupSandbox());
  afterEach(() => teardownSandbox());

  test('偵測到孤立檔案（無人 require）', () => {
    const libDir = createLibDir({
      'used-module.js': `module.exports = { foo };`,
      'orphan-module.js': `module.exports = { bar };`,
    });
    const searchDir = createSearchDir({
      'consumer.js': `const { foo } = require('./lib/used-module');`,
    });

    const result = scanOrphanFiles(libDir, [searchDir]);

    const orphanNames = result.orphanFiles.map((f) => require('path').basename(f));
    expect(orphanNames).toContain('orphan-module.js');
    expect(orphanNames).not.toContain('used-module.js');
  });

  test('全部被 require 時 orphanFiles 為空', () => {
    const libDir = createLibDir({
      'modA.js': `module.exports = { a };`,
      'modB.js': `module.exports = { b };`,
    });
    const searchDir = createSearchDir({
      'consumer.js': `
const { a } = require('./lib/modA');
const { b } = require('./lib/modB');
      `,
    });

    const result = scanOrphanFiles(libDir, [searchDir]);
    expect(result.orphanFiles.length).toBe(0);
  });

  test('回傳結構包含 orphanFiles 陣列和 summary', () => {
    const libDir = createLibDir({
      'mod.js': `module.exports = { x };`,
    });
    const result = scanOrphanFiles(libDir, []);

    expect(Array.isArray(result.orphanFiles)).toBe(true);
    expect(typeof result.summary).toBe('object');
    expect(typeof result.summary.total).toBe('number');
  });

  test('summary.total 與 orphanFiles.length 一致', () => {
    const libDir = createLibDir({
      'isolated.js': `module.exports = { z };`,
    });
    const result = scanOrphanFiles(libDir, []);

    expect(result.summary.total).toBe(result.orphanFiles.length);
  });

  test('dead-code-scanner 自身不被標記為孤立', () => {
    // 使用實際的 lib 目錄驗證 dead-code-scanner 自排除
    const { SCRIPTS_LIB } = require('../helpers/paths');
    const searchDirs = [
      require('path').join(SCRIPTS_LIB, '..', '..', 'hooks', 'scripts'),
      require('path').join(SCRIPTS_LIB, '..'),
      require('path').join(SCRIPTS_LIB, '..', '..', '..', '..', 'tests'),
    ];

    const result = scanOrphanFiles(SCRIPTS_LIB, searchDirs);

    const orphanNames = result.orphanFiles.map((f) => require('path').basename(f));
    expect(orphanNames).not.toContain('dead-code-scanner.js');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 6: runDeadCodeScan
// ══════════════════════════════════════════════════════════════════

describe('runDeadCodeScan', () => {
  beforeEach(() => setupSandbox());
  afterEach(() => teardownSandbox());

  test('回傳包含 unusedExports、orphanFiles 和 summary 的物件', () => {
    const libDir = createLibDir({
      'mod.js': `module.exports = { a, b };`,
    });

    const result = runDeadCodeScan({ libDir, searchDirs: [] });

    expect(Array.isArray(result.unusedExports)).toBe(true);
    expect(Array.isArray(result.orphanFiles)).toBe(true);
    expect(typeof result.summary).toBe('object');
    expect(typeof result.summary.unusedExports).toBe('number');
    expect(typeof result.summary.orphanFiles).toBe('number');
    expect(typeof result.summary.total).toBe('number');
  });

  test('summary.total = unusedExports count + orphanFiles count', () => {
    const libDir = createLibDir({
      'mod.js': `module.exports = { a, b };`,
    });

    const result = runDeadCodeScan({ libDir, searchDirs: [] });

    expect(result.summary.total).toBe(
      result.summary.unusedExports + result.summary.orphanFiles
    );
  });

  test('有 dead code 的 fixture 能正確偵測', () => {
    const libDir = createLibDir({
      'helper.js': `
module.exports = { used, dead };
function used() {}
function dead() {}
      `,
    });
    const searchDir = createSearchDir({
      'script.js': `
const { used } = require('./lib/helper');
used();
      `,
    });

    const result = runDeadCodeScan({ libDir, searchDirs: [searchDir] });

    // dead export 應被偵測
    const deadExports = result.unusedExports.map((e) => e.exportName);
    expect(deadExports).toContain('dead');
    expect(deadExports).not.toContain('used');
  });

  test('無 options 使用預設路徑時不拋錯', () => {
    // 呼叫無參數版本，應回傳合法結構
    expect(() => {
      const result = runDeadCodeScan();
      expect(Array.isArray(result.unusedExports)).toBe(true);
      expect(Array.isArray(result.orphanFiles)).toBe(true);
    }).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 7: 邊界情況
// ══════════════════════════════════════════════════════════════════

describe('邊界情況', () => {
  beforeEach(() => setupSandbox());
  afterEach(() => teardownSandbox());

  test('空的 lib 目錄 — scanUnusedExports 回傳空結果', () => {
    const libDir = join(tmpDir, 'empty-lib');
    fs.mkdirSync(libDir, { recursive: true });

    const result = scanUnusedExports(libDir, []);
    expect(result.unusedExports).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  test('空的 lib 目錄 — scanOrphanFiles 回傳空結果', () => {
    const libDir = join(tmpDir, 'empty-lib');
    fs.mkdirSync(libDir, { recursive: true });

    const result = scanOrphanFiles(libDir, []);
    expect(result.orphanFiles).toEqual([]);
    expect(result.summary.total).toBe(0);
  });

  test('不存在的 lib 目錄 — scanUnusedExports 不拋錯', () => {
    const result = scanUnusedExports('/nonexistent/path/lib', []);
    expect(Array.isArray(result.unusedExports)).toBe(true);
    expect(result.summary.total).toBe(0);
  });

  test('不存在的 lib 目錄 — scanOrphanFiles 不拋錯', () => {
    const result = scanOrphanFiles('/nonexistent/path/lib', []);
    expect(Array.isArray(result.orphanFiles)).toBe(true);
    expect(result.summary.total).toBe(0);
  });

  test('空的 .js 檔案不觸發 false positive', () => {
    const libDir = createLibDir({
      'empty.js': '',
    });
    const result = scanUnusedExports(libDir, []);
    const emptyFileIssues = result.unusedExports.filter((e) =>
      e.file.includes('empty.js')
    );
    expect(emptyFileIssues.length).toBe(0);
  });

  test('collectJsFiles 對不存在的路徑回傳空陣列', () => {
    const files = collectJsFiles('/nonexistent/path');
    expect(files).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 8: 真實 codebase 合理性驗證
// ══════════════════════════════════════════════════════════════════

describe('真實 codebase 合理性驗證', () => {
  test('scanUnusedExports 使用實際路徑時回傳合法結構', () => {
    const { SCRIPTS_LIB, HOOKS_DIR, SCRIPTS_DIR, PROJECT_ROOT } = require('../helpers/paths');
    const searchDirs = [HOOKS_DIR, SCRIPTS_DIR, join(PROJECT_ROOT, 'tests')];

    const result = scanUnusedExports(SCRIPTS_LIB, searchDirs);

    expect(Array.isArray(result.unusedExports)).toBe(true);
    expect(typeof result.summary.total).toBe('number');
    expect(result.summary.total).toBe(result.unusedExports.length);

    // 每個項目都有必要欄位
    for (const item of result.unusedExports) {
      expect(typeof item.file).toBe('string');
      expect(typeof item.exportName).toBe('string');
      expect(item.type).toBe('unused-export');
    }
  });

  test('scanOrphanFiles 使用實際路徑時回傳合法結構', () => {
    const { SCRIPTS_LIB, HOOKS_DIR, SCRIPTS_DIR, PROJECT_ROOT } = require('../helpers/paths');
    const searchDirs = [HOOKS_DIR, SCRIPTS_DIR, join(PROJECT_ROOT, 'tests')];

    const result = scanOrphanFiles(SCRIPTS_LIB, searchDirs);

    expect(Array.isArray(result.orphanFiles)).toBe(true);
    expect(typeof result.summary.total).toBe('number');
    expect(result.summary.total).toBe(result.orphanFiles.length);

    // 所有孤立檔案路徑應以 .js 結尾
    for (const f of result.orphanFiles) {
      expect(f.endsWith('.js')).toBe(true);
    }
  });

  test('registry.js 的核心 exports 不被標記為 unused', () => {
    const { SCRIPTS_LIB, HOOKS_DIR, SCRIPTS_DIR, PROJECT_ROOT } = require('../helpers/paths');
    const searchDirs = [HOOKS_DIR, SCRIPTS_DIR, join(PROJECT_ROOT, 'tests')];

    const result = scanUnusedExports(SCRIPTS_LIB, searchDirs);

    // registry.js 的 stages 廣泛被使用，不應是 unused
    const registryUnused = result.unusedExports.filter(
      (e) => e.file.includes('registry.js') && e.exportName === 'stages'
    );
    expect(registryUnused.length).toBe(0);
  });
});
