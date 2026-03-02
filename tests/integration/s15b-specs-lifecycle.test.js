'use strict';
/**
 * s15b-specs-lifecycle.test.js — Specs 系統生命週期整合驗證
 *
 * S15b 重構後，驗證 specs/ 生命週期 API 行為完整且正確：
 *   1. Feature Init：initFeatureDir 建立正確目錄結構
 *   2. Active Feature：getActiveFeature 回傳正確屬性
 *   3. Archive：archiveFeature 移動到 archive/ 並加日期前綴
 *   4. Backlog：createBacklog 建立 backlog feature
 *   5. List Features：listFeatures 回傳 in-progress / backlog / archived
 *   6. Feature Name Validation：isValidFeatureName kebab-case 驗證
 *
 * 所有操作在臨時目錄執行，不影響真實 specs/。
 */

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, rmSync, existsSync, readdirSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const specs = require(join(SCRIPTS_LIB, 'specs'));

// ── 臨時目錄管理 ──────────────────────────────────────────────────────────

const TIMESTAMP = Date.now();
let tmpRoot;
let testCount = 0;

function makeTmpRoot() {
  testCount++;
  const dir = join(tmpdir(), `overtone-specs-test-${TIMESTAMP}-${testCount}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeEach(() => {
  tmpRoot = makeTmpRoot();
});

afterEach(() => {
  if (tmpRoot && existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
  tmpRoot = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Feature Init：initFeatureDir 建立正確目錄結構
// ─────────────────────────────────────────────────────────────────────────────

describe('1. Feature Init：initFeatureDir', () => {
  test('建立 in-progress/{name}/ 目錄', () => {
    specs.initFeatureDir(tmpRoot, 'my-feature', 'quick');

    const featureDir = join(tmpRoot, 'specs', 'features', 'in-progress', 'my-feature');
    expect(existsSync(featureDir)).toBe(true);
  });

  test('建立 tasks.md 檔案', () => {
    specs.initFeatureDir(tmpRoot, 'my-feature', 'quick');

    const tasksPath = join(tmpRoot, 'specs', 'features', 'in-progress', 'my-feature', 'tasks.md');
    expect(existsSync(tasksPath)).toBe(true);
  });

  test('tasks.md frontmatter 包含 workflow 欄位', () => {
    specs.initFeatureDir(tmpRoot, 'my-feature', 'quick');

    const tasksPath = join(tmpRoot, 'specs', 'features', 'in-progress', 'my-feature', 'tasks.md');
    const fm = specs.readTasksFrontmatter(tasksPath);

    expect(fm).not.toBeNull();
    expect(fm.workflow).toBe('quick');
  });

  test('tasks.md frontmatter 包含 status: in-progress', () => {
    specs.initFeatureDir(tmpRoot, 'my-feature', 'quick');

    const tasksPath = join(tmpRoot, 'specs', 'features', 'in-progress', 'my-feature', 'tasks.md');
    const fm = specs.readTasksFrontmatter(tasksPath);

    expect(fm).not.toBeNull();
    expect(fm.status).toBe('in-progress');
  });

  test('tasks.md frontmatter 包含 feature 欄位', () => {
    specs.initFeatureDir(tmpRoot, 'my-feature', 'quick');

    const tasksPath = join(tmpRoot, 'specs', 'features', 'in-progress', 'my-feature', 'tasks.md');
    const fm = specs.readTasksFrontmatter(tasksPath);

    expect(fm).not.toBeNull();
    expect(fm.feature).toBe('my-feature');
  });

  test('無效名稱（非 kebab-case）時拋出錯誤', () => {
    expect(() => {
      specs.initFeatureDir(tmpRoot, 'MyFeature', 'quick');
    }).toThrow();
  });

  test('重複 initFeatureDir 同名時拋出錯誤', () => {
    specs.initFeatureDir(tmpRoot, 'my-feature', 'quick');
    expect(() => {
      specs.initFeatureDir(tmpRoot, 'my-feature', 'quick');
    }).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Active Feature：getActiveFeature 回傳正確屬性
// ─────────────────────────────────────────────────────────────────────────────

describe('2. Active Feature：getActiveFeature', () => {
  test('無 in-progress feature 時回傳 null', () => {
    const active = specs.getActiveFeature(tmpRoot);
    expect(active).toBeNull();
  });

  test('有 in-progress feature 時回傳 name 屬性', () => {
    specs.initFeatureDir(tmpRoot, 'login-page', 'standard');

    // 靜音警告
    const orig = process.env.OVERTONE_QUIET;
    process.env.OVERTONE_QUIET = '1';
    const active = specs.getActiveFeature(tmpRoot);
    if (orig === undefined) delete process.env.OVERTONE_QUIET;
    else process.env.OVERTONE_QUIET = orig;

    expect(active).not.toBeNull();
    expect(active.name).toBe('login-page');
  });

  test('有 in-progress feature 時回傳 path 屬性（指向 in-progress 目錄）', () => {
    specs.initFeatureDir(tmpRoot, 'login-page', 'standard');

    process.env.OVERTONE_QUIET = '1';
    const active = specs.getActiveFeature(tmpRoot);
    delete process.env.OVERTONE_QUIET;

    expect(active.path).toContain('in-progress');
    expect(active.path).toContain('login-page');
  });

  test('有 in-progress feature 時 tasks 屬性回傳 checkbox 統計', () => {
    specs.initFeatureDir(tmpRoot, 'login-page', 'standard');

    process.env.OVERTONE_QUIET = '1';
    const active = specs.getActiveFeature(tmpRoot);
    delete process.env.OVERTONE_QUIET;

    // tasks 應為物件（readTasksCheckboxes 的回傳值）或 null
    // standard workflow 有 specsConfig，所以會生成 checkboxes
    expect(active.tasks).not.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Archive：archiveFeature 移動到 archive/
// ─────────────────────────────────────────────────────────────────────────────

describe('3. Archive：archiveFeature', () => {
  test('歸檔後原 in-progress 目錄消失', () => {
    specs.initFeatureDir(tmpRoot, 'user-auth', 'quick');
    const origDir = join(tmpRoot, 'specs', 'features', 'in-progress', 'user-auth');

    specs.archiveFeature(tmpRoot, 'user-auth');

    expect(existsSync(origDir)).toBe(false);
  });

  test('歸檔後 archive/ 下出現含日期前綴的目錄', () => {
    specs.initFeatureDir(tmpRoot, 'user-auth', 'quick');

    specs.archiveFeature(tmpRoot, 'user-auth');

    const archiveBase = join(tmpRoot, 'specs', 'features', 'archive');
    expect(existsSync(archiveBase)).toBe(true);

    const archivedDirs = readdirSync(archiveBase);
    expect(archivedDirs.length).toBe(1);

    // 日期前綴格式：YYYY-MM-DD_<name>
    const today = new Date().toISOString().slice(0, 10);
    expect(archivedDirs[0]).toBe(`${today}_user-auth`);
  });

  test('歸檔後 tasks.md 的 status 更新為 archived', () => {
    specs.initFeatureDir(tmpRoot, 'user-auth', 'quick');
    const archPath = specs.archiveFeature(tmpRoot, 'user-auth');

    const tasksPath = join(archPath, 'tasks.md');
    const fm = specs.readTasksFrontmatter(tasksPath);

    expect(fm).not.toBeNull();
    expect(fm.status).toBe('archived');
  });

  test('不存在的 feature 歸檔時拋出錯誤', () => {
    expect(() => {
      specs.archiveFeature(tmpRoot, 'nonexistent-feature');
    }).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Backlog：createBacklog 建立 backlog feature
// ─────────────────────────────────────────────────────────────────────────────

describe('4. Backlog：createBacklog', () => {
  test('建立 backlog/{name}/ 目錄', () => {
    specs.createBacklog(tmpRoot, 'future-feature', 'standard');

    const backlogDir = join(tmpRoot, 'specs', 'features', 'backlog', 'future-feature');
    expect(existsSync(backlogDir)).toBe(true);
  });

  test('建立 tasks.md 且 status 為 backlog', () => {
    specs.createBacklog(tmpRoot, 'future-feature', 'standard');

    const tasksPath = join(tmpRoot, 'specs', 'features', 'backlog', 'future-feature', 'tasks.md');
    expect(existsSync(tasksPath)).toBe(true);

    const fm = specs.readTasksFrontmatter(tasksPath);
    expect(fm).not.toBeNull();
    expect(fm.status).toBe('backlog');
  });

  test('backlog feature 可以透過 initFeatureDir 移到 in-progress', () => {
    specs.createBacklog(tmpRoot, 'future-feature', 'standard');
    specs.initFeatureDir(tmpRoot, 'future-feature', 'standard');

    const inProgressDir = join(tmpRoot, 'specs', 'features', 'in-progress', 'future-feature');
    const backlogDir = join(tmpRoot, 'specs', 'features', 'backlog', 'future-feature');

    expect(existsSync(inProgressDir)).toBe(true);
    expect(existsSync(backlogDir)).toBe(false);
  });

  test('重複建立 backlog 同名時拋出錯誤', () => {
    specs.createBacklog(tmpRoot, 'future-feature', 'standard');
    expect(() => {
      specs.createBacklog(tmpRoot, 'future-feature', 'standard');
    }).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. List Features：listFeatures 回傳所有 features
// ─────────────────────────────────────────────────────────────────────────────

describe('5. List Features：listFeatures', () => {
  test('空狀態時 inProgress / backlog / archived 皆為空陣列', () => {
    const list = specs.listFeatures(tmpRoot);

    expect(list.inProgress).toEqual([]);
    expect(list.backlog).toEqual([]);
    expect(list.archived).toEqual([]);
  });

  test('in-progress feature 出現在 inProgress 清單中', () => {
    specs.initFeatureDir(tmpRoot, 'feat-a', 'quick');

    process.env.OVERTONE_QUIET = '1';
    const list = specs.listFeatures(tmpRoot);
    delete process.env.OVERTONE_QUIET;

    expect(list.inProgress).toContain('feat-a');
  });

  test('backlog feature 出現在 backlog 清單中', () => {
    specs.createBacklog(tmpRoot, 'feat-b', 'standard');

    const list = specs.listFeatures(tmpRoot);

    expect(list.backlog).toContain('feat-b');
  });

  test('archived feature 出現在 archived 清單中（含日期前綴）', () => {
    specs.initFeatureDir(tmpRoot, 'feat-c', 'quick');
    specs.archiveFeature(tmpRoot, 'feat-c');

    const list = specs.listFeatures(tmpRoot);

    const today = new Date().toISOString().slice(0, 10);
    expect(list.archived).toContain(`${today}_feat-c`);
  });

  test('混合狀態：三種清單各自獨立正確', () => {
    specs.initFeatureDir(tmpRoot, 'active-feat', 'quick');
    specs.createBacklog(tmpRoot, 'backlog-feat', 'standard');
    specs.initFeatureDir(tmpRoot, 'to-archive', 'quick');
    specs.archiveFeature(tmpRoot, 'to-archive');

    process.env.OVERTONE_QUIET = '1';
    const list = specs.listFeatures(tmpRoot);
    delete process.env.OVERTONE_QUIET;

    expect(list.inProgress).toContain('active-feat');
    expect(list.backlog).toContain('backlog-feat');

    const today = new Date().toISOString().slice(0, 10);
    expect(list.archived).toContain(`${today}_to-archive`);

    // 不互相污染
    expect(list.inProgress).not.toContain('backlog-feat');
    expect(list.backlog).not.toContain('active-feat');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Feature Name Validation：isValidFeatureName
// ─────────────────────────────────────────────────────────────────────────────

describe('6. Feature Name Validation：isValidFeatureName', () => {
  describe('有效名稱（kebab-case）', () => {
    const validNames = [
      'my-feature',
      'login-page',
      'user-auth-v2',
      'feature123',
      'abc',
    ];

    for (const name of validNames) {
      test(`「${name}」是有效名稱`, () => {
        expect(specs.isValidFeatureName(name)).toBe(true);
      });
    }
  });

  describe('無效名稱', () => {
    const invalidNames = [
      ['MyFeature', '含大寫字母'],
      ['my feature', '含空格'],
      ['my_feature', '含底線'],
      ['', '空字串'],
      ['-leading-dash', '以連字號開頭'],
      ['trailing-dash-', '以連字號結尾'],
      ['double--dash', '連續連字號'],
    ];

    for (const [name, reason] of invalidNames) {
      test(`「${name}」是無效名稱（${reason}）`, () => {
        expect(specs.isValidFeatureName(name)).toBe(false);
      });
    }
  });

  test('非字串型別時回傳 false', () => {
    expect(specs.isValidFeatureName(null)).toBe(false);
    expect(specs.isValidFeatureName(undefined)).toBe(false);
    expect(specs.isValidFeatureName(123)).toBe(false);
  });
});
