'use strict';
/**
 * specs.test.js — specs.js 單元測試
 *
 * 使用 bun test + mkdtempSync 建立隔離臨時目錄
 */
const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} = require('fs');
const os = require('os');
const path = require('path');
const { SCRIPTS_LIB, SCRIPTS_DIR } = require('../helpers/paths');

const specs = require(path.join(SCRIPTS_LIB, 'specs'));

// ── 臨時目錄工具 ──

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'overtone-specs-test-'));
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* 忽略清理錯誤 */ }
});

// ── isValidFeatureName ──

describe('isValidFeatureName', () => {
  test('合法的單一小寫單字通過驗證', () => {
    expect(specs.isValidFeatureName('auth')).toBe(true);
  });

  test('合法的 kebab-case 多詞名稱通過驗證', () => {
    expect(specs.isValidFeatureName('add-user-auth')).toBe(true);
  });

  test('含數字的合法 kebab-case 名稱通過驗證', () => {
    expect(specs.isValidFeatureName('oauth2-integration')).toBe(true);
  });

  test('名稱含大寫字母被拒絕', () => {
    expect(specs.isValidFeatureName('AddUserAuth')).toBe(false);
  });

  test('名稱含底線被拒絕', () => {
    expect(specs.isValidFeatureName('add_user_auth')).toBe(false);
  });

  test('名稱以連字號開頭被拒絕', () => {
    expect(specs.isValidFeatureName('-auth')).toBe(false);
  });

  test('名稱以連字號結尾被拒絕', () => {
    expect(specs.isValidFeatureName('auth-')).toBe(false);
  });

  test('連續連字號被拒絕', () => {
    expect(specs.isValidFeatureName('add--auth')).toBe(false);
  });

  test('空字串被拒絕', () => {
    expect(specs.isValidFeatureName('')).toBe(false);
  });

  test('含空白字元被拒絕', () => {
    expect(specs.isValidFeatureName('add user auth')).toBe(false);
  });

  test('含特殊符號被拒絕', () => {
    expect(specs.isValidFeatureName('auth@v2')).toBe(false);
  });
});

// ── readTasksFrontmatter ──

describe('readTasksFrontmatter', () => {
  test('成功解析完整 frontmatter', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '---',
      'feature: my-feature',
      'status: in-progress',
      'workflow: standard',
      'created: 2026-02-26T00:00:00Z',
      '---',
      '',
      '## Tasks',
    ].join('\n'));

    const result = specs.readTasksFrontmatter(tasksPath);
    expect(result).not.toBeNull();
    expect(result.feature).toBe('my-feature');
    expect(result.status).toBe('in-progress');
    expect(result.workflow).toBe('standard');
    expect(result.created).toBe('2026-02-26T00:00:00Z');
  });

  test('只解析 frontmatter 區塊，忽略內文', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '---',
      'feature: my-feature',
      'status: in-progress',
      '---',
      '',
      '## Tasks',
      '',
      'some content: not-a-field',
    ].join('\n'));

    const result = specs.readTasksFrontmatter(tasksPath);
    expect(result).not.toBeNull();
    expect(Object.keys(result)).toHaveLength(2);
    expect(result.feature).toBe('my-feature');
  });

  test('檔案不存在時回傳 null', () => {
    const result = specs.readTasksFrontmatter('/non/existent/tasks.md');
    expect(result).toBeNull();
  });

  test('frontmatter 缺失時回傳 null', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, '# Just a heading\nNo frontmatter here.');
    const result = specs.readTasksFrontmatter(tasksPath);
    expect(result).toBeNull();
  });

  test('frontmatter 欄位值含冒號時正確解析', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '---',
      'created: 2026-02-26T10:30:00Z',
      '---',
    ].join('\n'));

    const result = specs.readTasksFrontmatter(tasksPath);
    expect(result.created).toBe('2026-02-26T10:30:00Z');
  });
});

// ── readTasksCheckboxes ──

describe('readTasksCheckboxes', () => {
  test('成功計算 checkbox 統計', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '## Tasks',
      '',
      '- [x] 已完成任務 A',
      '- [x] 已完成任務 B',
      '- [ ] 待辦任務 C',
    ].join('\n'));

    const result = specs.readTasksCheckboxes(tasksPath);
    expect(result.total).toBe(3);
    expect(result.checked).toBe(2);
    expect(result.allChecked).toBe(false);
  });

  test('所有 checkbox 皆已勾選時 allChecked 為 true', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '## Tasks',
      '- [x] 任務 A',
      '- [x] 任務 B',
    ].join('\n'));

    const result = specs.readTasksCheckboxes(tasksPath);
    expect(result.total).toBe(2);
    expect(result.checked).toBe(2);
    expect(result.allChecked).toBe(true);
  });

  test('沒有 checkbox 時 total 為 0', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, '## Tasks\n\n無任何 checkbox');

    const result = specs.readTasksCheckboxes(tasksPath);
    expect(result.total).toBe(0);
    expect(result.checked).toBe(0);
    expect(result.allChecked).toBe(false);
  });

  test('只計算 Tasks 區塊以後的 checkbox', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '# Header',
      '- [x] 這是在 Tasks 前的 checkbox，不應計算',
      '',
      '## Tasks',
      '',
      '- [x] 這是 Tasks 後的',
      '- [ ] 待辦',
    ].join('\n'));

    const result = specs.readTasksCheckboxes(tasksPath);
    expect(result.total).toBe(2);
    expect(result.checked).toBe(1);
  });

  test('檔案不存在時回傳 null', () => {
    const result = specs.readTasksCheckboxes('/non/existent/tasks.md');
    expect(result).toBeNull();
  });

  test('舊格式 ## Stages 標頭也能正確統計 stage checkbox', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '---',
      'feature: old-feature',
      'status: in-progress',
      '---',
      '',
      '## Stages',
      '',
      '- [x] PLAN',
      '- [x] ARCH',
      '- [ ] DEV',
    ].join('\n'));

    const result = specs.readTasksCheckboxes(tasksPath);
    expect(result.total).toBe(3);
    expect(result.checked).toBe(2);
    expect(result.allChecked).toBe(false);
  });

  test('舊格式：## Stages 全部勾選時 allChecked 為 true，即使 ## Dev Phases 有未勾選項', () => {
    // 此測試驗證：Dev Phases 的 checkbox 不影響 stage-level 的完成判斷
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '---',
      'feature: old-feature',
      'status: in-progress',
      '---',
      '',
      '## Stages',
      '',
      '- [x] PLAN',
      '- [x] DEV',
      '- [x] REVIEW',
      '',
      '## Dev Phases',
      '',
      '### Phase 1',
      '- [ ] 未完成的細項任務 A',
      '- [ ] 未完成的細項任務 B',
    ].join('\n'));

    const result = specs.readTasksCheckboxes(tasksPath);
    // 只統計 ## Stages 區塊的 checkbox
    expect(result.total).toBe(3);
    expect(result.checked).toBe(3);
    expect(result.allChecked).toBe(true);
  });

  test('新格式：## Tasks 後接 ## Dev Phases 時只統計 Tasks 區塊', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '## Tasks',
      '',
      '- [x] PLAN',
      '- [x] DEV',
      '',
      '## Dev Phases',
      '',
      '- [ ] 未完成細項',
    ].join('\n'));

    const result = specs.readTasksCheckboxes(tasksPath);
    expect(result.total).toBe(2);
    expect(result.checked).toBe(2);
    expect(result.allChecked).toBe(true);
  });
});

// ── updateTasksFrontmatter ──

describe('updateTasksFrontmatter', () => {
  test('成功更新單一欄位', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '---',
      'feature: my-feature',
      'status: in-progress',
      'workflow: standard',
      '---',
      '',
      '## Tasks',
    ].join('\n'));

    specs.updateTasksFrontmatter(tasksPath, { status: 'archived' });

    const updated = specs.readTasksFrontmatter(tasksPath);
    expect(updated.status).toBe('archived');
    expect(updated.feature).toBe('my-feature');
    expect(updated.workflow).toBe('standard');
  });

  test('新增不存在的欄位', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '---',
      'feature: my-feature',
      'status: in-progress',
      '---',
      '',
      '## Tasks',
    ].join('\n'));

    specs.updateTasksFrontmatter(tasksPath, { archivedAt: '2026-02-26T12:00:00Z' });

    const updated = specs.readTasksFrontmatter(tasksPath);
    expect(updated.archivedAt).toBe('2026-02-26T12:00:00Z');
    expect(updated.feature).toBe('my-feature');
  });

  test('同時更新多個欄位', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    writeFileSync(tasksPath, [
      '---',
      'feature: my-feature',
      'status: in-progress',
      '---',
    ].join('\n'));

    specs.updateTasksFrontmatter(tasksPath, {
      status: 'archived',
      archivedAt: '2026-02-26T12:00:00Z',
    });

    const updated = specs.readTasksFrontmatter(tasksPath);
    expect(updated.status).toBe('archived');
    expect(updated.archivedAt).toBe('2026-02-26T12:00:00Z');
    expect(updated.feature).toBe('my-feature');
  });

  test('內文保持不變', () => {
    const tasksPath = path.join(tmpDir, 'tasks.md');
    const original = [
      '---',
      'status: in-progress',
      '---',
      '',
      '## Tasks',
      '',
      '- [ ] 任務 A',
    ].join('\n');
    writeFileSync(tasksPath, original);

    specs.updateTasksFrontmatter(tasksPath, { status: 'archived' });

    const content = readFileSync(tasksPath, 'utf8');
    expect(content).toContain('## Tasks');
    expect(content).toContain('- [ ] 任務 A');
  });

  test('檔案不存在時拋出錯誤', () => {
    expect(() => {
      specs.updateTasksFrontmatter('/non/existent/tasks.md', { status: 'archived' });
    }).toThrow();
  });
});

// ── initFeatureDir ──

describe('initFeatureDir', () => {
  test('成功建立全新 feature 目錄', () => {
    const result = specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    expect(existsSync(result)).toBe(true);

    const tasksPath = path.join(result, 'tasks.md');
    expect(existsSync(tasksPath)).toBe(true);

    const fm = specs.readTasksFrontmatter(tasksPath);
    expect(fm.feature).toBe('my-feature');
    expect(fm.status).toBe('in-progress');
    expect(fm.workflow).toBe('standard');
    expect(fm.created).toBeDefined();
  });

  test('tasks.md 包含正確 Markdown 結構', () => {
    const result = specs.initFeatureDir(tmpDir, 'new-feature', 'quick');
    const content = readFileSync(path.join(result, 'tasks.md'), 'utf8');
    expect(content).toContain('---');
    expect(content).toContain('## Tasks');
    expect(content).toContain('workflow: quick');
  });

  test('從 backlog 搬移到 in-progress', () => {
    // 建立 backlog feature
    const backlogPath = path.join(tmpDir, 'specs', 'features', 'backlog', 'my-feature');
    mkdirSync(backlogPath, { recursive: true });
    writeFileSync(path.join(backlogPath, 'tasks.md'), [
      '---',
      'feature: my-feature',
      'status: backlog',
      'workflow: standard',
      'created: 2026-02-01T00:00:00Z',
      '---',
      '',
      '## Tasks',
    ].join('\n'));

    const result = specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    expect(existsSync(result)).toBe(true);
    expect(existsSync(backlogPath)).toBe(false);

    const fm = specs.readTasksFrontmatter(path.join(result, 'tasks.md'));
    expect(fm.status).toBe('in-progress');
  });

  test('防止重複建立同名 feature', () => {
    specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    expect(() => {
      specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    }).toThrow(/已存在於 in-progress/);
  });

  test('featureName 不合法時拒絕建立', () => {
    expect(() => {
      specs.initFeatureDir(tmpDir, 'Invalid_Name', 'standard');
    }).toThrow(/無效的 feature 名稱/);
  });

  test('中間目錄不存在時自動建立', () => {
    const result = specs.initFeatureDir(tmpDir, 'my-feature', 'tdd');
    expect(existsSync(result)).toBe(true);
    expect(existsSync(path.join(result, 'tasks.md'))).toBe(true);
  });
});

// ── archiveFeature ──

describe('archiveFeature', () => {
  test('成功歸檔 in-progress feature', () => {
    const inProgressPath = specs.initFeatureDir(tmpDir, 'my-feature', 'standard');

    const archivePath = specs.archiveFeature(tmpDir, 'my-feature');
    expect(existsSync(archivePath)).toBe(true);
    expect(existsSync(inProgressPath)).toBe(false);
    expect(archivePath).toContain('my-feature');
  });

  test('歸檔後更新 tasks.md 狀態', () => {
    specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    const archivePath = specs.archiveFeature(tmpDir, 'my-feature');

    const fm = specs.readTasksFrontmatter(path.join(archivePath, 'tasks.md'));
    expect(fm.status).toBe('archived');
    expect(fm.archivedAt).toBeDefined();
  });

  test('歸檔目錄名稱衝突時加序號後綴', () => {
    // 手動建立衝突目錄
    specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    const archivePath1 = specs.archiveFeature(tmpDir, 'my-feature');

    // 再建一個同名 feature 並歸檔
    specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    const archivePath2 = specs.archiveFeature(tmpDir, 'my-feature');

    expect(archivePath1).not.toBe(archivePath2);
    expect(archivePath2).toContain('_2');
  });

  test('第三次歸檔同名 feature 時序號遞增', () => {
    specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    specs.archiveFeature(tmpDir, 'my-feature');

    specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    specs.archiveFeature(tmpDir, 'my-feature');

    specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    const archivePath3 = specs.archiveFeature(tmpDir, 'my-feature');

    expect(archivePath3).toContain('_3');
  });

  test('feature 不在 in-progress 時拋出錯誤', () => {
    expect(() => {
      specs.archiveFeature(tmpDir, 'non-existent');
    }).toThrow(/不在 in-progress 中/);
  });
});

// ── createBacklog ──

describe('createBacklog', () => {
  test('成功建立 backlog feature', () => {
    const result = specs.createBacklog(tmpDir, 'future-feature', 'standard');
    expect(existsSync(result)).toBe(true);

    const fm = specs.readTasksFrontmatter(path.join(result, 'tasks.md'));
    expect(fm.status).toBe('backlog');
    expect(fm.feature).toBe('future-feature');
    expect(fm.workflow).toBe('standard');
  });

  test('同名 feature 已在 backlog 時拒絕重複建立', () => {
    specs.createBacklog(tmpDir, 'future-feature', 'standard');
    expect(() => {
      specs.createBacklog(tmpDir, 'future-feature', 'standard');
    }).toThrow(/已存在於 backlog/);
  });

  test('featureName 不合法時拒絕建立', () => {
    expect(() => {
      specs.createBacklog(tmpDir, 'Invalid_Name!', 'standard');
    }).toThrow(/無效的 feature 名稱/);
  });

  test('同名 feature 已在 in-progress 時仍可建立 backlog', () => {
    specs.initFeatureDir(tmpDir, 'my-feature', 'standard');
    const backlogPath = specs.createBacklog(tmpDir, 'my-feature', 'quick');

    expect(existsSync(backlogPath)).toBe(true);
    // in-progress 目錄應仍存在
    expect(existsSync(specs.featurePath(tmpDir, 'my-feature'))).toBe(true);
  });
});

// ── listFeatures ──

describe('listFeatures', () => {
  test('三個分類都有 feature 時完整回傳', () => {
    specs.initFeatureDir(tmpDir, 'feature-a', 'standard');
    specs.createBacklog(tmpDir, 'feature-b', 'quick');
    // 手動建立歸檔目錄
    const archDir = specs.archiveDir(tmpDir);
    mkdirSync(path.join(archDir, '2026-02-01_feature-c'), { recursive: true });

    const result = specs.listFeatures(tmpDir);
    expect(result.inProgress).toContain('feature-a');
    expect(result.backlog).toContain('feature-b');
    expect(result.archived).toContain('2026-02-01_feature-c');
  });

  test('某個分類為空時回傳空陣列', () => {
    specs.initFeatureDir(tmpDir, 'feature-a', 'standard');

    const result = specs.listFeatures(tmpDir);
    expect(result.inProgress).toContain('feature-a');
    expect(result.backlog).toHaveLength(0);
    expect(result.archived).toHaveLength(0);
  });

  test('specs 目錄完全不存在時回傳全空', () => {
    const result = specs.listFeatures(tmpDir);
    expect(result.inProgress).toHaveLength(0);
    expect(result.backlog).toHaveLength(0);
    expect(result.archived).toHaveLength(0);
  });

  test('只列出目錄，忽略各分類下的非目錄檔案', () => {
    const inProgressDir = specs.inProgressDir(tmpDir);
    mkdirSync(path.join(inProgressDir, 'feature-a'), { recursive: true });
    writeFileSync(path.join(inProgressDir, 'README.md'), '# README');

    const result = specs.listFeatures(tmpDir);
    expect(result.inProgress).toContain('feature-a');
    expect(result.inProgress).not.toContain('README.md');
  });

  test('多個 feature 時依字母排序回傳', () => {
    specs.initFeatureDir(tmpDir, 'zebra-feature', 'standard');
    specs.initFeatureDir(tmpDir, 'alpha-feature', 'standard');
    specs.initFeatureDir(tmpDir, 'middle-feature', 'standard');

    const result = specs.listFeatures(tmpDir);
    expect(result.inProgress).toEqual(['alpha-feature', 'middle-feature', 'zebra-feature']);
  });
});

// ── getActiveFeature ──

describe('getActiveFeature', () => {
  test('只有一個 in-progress feature 時正確回傳', () => {
    specs.initFeatureDir(tmpDir, 'my-feature', 'standard');

    const result = specs.getActiveFeature(tmpDir);
    expect(result).not.toBeNull();
    expect(result.name).toBe('my-feature');
    expect(result.path).toContain('my-feature');
  });

  test('沒有 in-progress feature 時回傳 null', () => {
    const result = specs.getActiveFeature(tmpDir);
    expect(result).toBeNull();
  });

  test('多個 in-progress feature 時回傳字母順序第一個', () => {
    const inProgressDir = specs.inProgressDir(tmpDir);
    mkdirSync(path.join(inProgressDir, 'feature-a'), { recursive: true });
    mkdirSync(path.join(inProgressDir, 'feature-b'), { recursive: true });

    const result = specs.getActiveFeature(tmpDir);
    expect(result).not.toBeNull();
    expect(result.name).toBe('feature-a');
  });

  test('in-progress 目錄中有非目錄的檔案時忽略', () => {
    const inProgressDir = specs.inProgressDir(tmpDir);
    mkdirSync(path.join(inProgressDir, 'my-feature'), { recursive: true });
    writeFileSync(path.join(inProgressDir, '.gitkeep'), '');

    const result = specs.getActiveFeature(tmpDir);
    expect(result).not.toBeNull();
    expect(result.name).toBe('my-feature');
  });

  test('回傳物件包含 tasks 統計', () => {
    specs.initFeatureDir(tmpDir, 'my-feature', 'quick');
    const tasksPath = path.join(specs.featurePath(tmpDir, 'my-feature'), 'tasks.md');
    // 確認 tasks.md 存在
    expect(existsSync(tasksPath)).toBe(true);

    const result = specs.getActiveFeature(tmpDir);
    expect(result.tasks).toBeDefined();
    // tasks 可能是 { total, checked, allChecked } 或 null（取決於 quick 的 specsConfig）
  });
});

// ── CLI 腳本整合測試 ──

/**
 * 執行 CLI 腳本，傳入參數和 cwd
 * @param {string} scriptPath
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
function runCLI(scriptPath, args, cwd) {
  const result = Bun.spawnSync(['node', scriptPath, ...args], {
    cwd,
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

// ── specs-pause.js ──

describe('CLI: specs-pause.js', () => {
  test('成功暫停 in-progress feature 至 backlog', () => {
    // 準備：建立 in-progress feature
    specs.initFeatureDir(tmpDir, 'pause-me', 'standard');
    const inProgressPath = specs.featurePath(tmpDir, 'pause-me');
    expect(existsSync(inProgressPath)).toBe(true);

    const { stdout, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-pause.js'),
      ['pause-me'],
      tmpDir
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('pause-me');
    // in-progress 已移除，backlog 存在
    expect(existsSync(inProgressPath)).toBe(false);
    expect(existsSync(specs.backlogFeaturePath(tmpDir, 'pause-me'))).toBe(true);
  });

  test('feature 不在 in-progress 時 exit code 為 1', () => {
    const { stderr, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-pause.js'),
      ['non-existent-feature'],
      tmpDir
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain('non-existent-feature');
  });

  test('未提供 featureName 時 exit code 為 1', () => {
    const { stderr, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-pause.js'),
      [],
      tmpDir
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage');
  });
});

// ── specs-resume.js ──

describe('CLI: specs-resume.js', () => {
  test('成功恢復 backlog feature 至 in-progress', () => {
    // 準備：建立 backlog feature
    specs.createBacklog(tmpDir, 'resume-me', 'quick');
    const backlogPath = specs.backlogFeaturePath(tmpDir, 'resume-me');
    expect(existsSync(backlogPath)).toBe(true);

    const { stdout, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-resume.js'),
      ['resume-me'],
      tmpDir
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('resume-me');
    // backlog 已移除，in-progress 存在
    expect(existsSync(backlogPath)).toBe(false);
    expect(existsSync(specs.featurePath(tmpDir, 'resume-me'))).toBe(true);
  });

  test('feature 不在 backlog 時 exit code 為 1', () => {
    const { stderr, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-resume.js'),
      ['non-existent-feature'],
      tmpDir
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain('non-existent-feature');
  });

  test('未提供 featureName 時 exit code 為 1', () => {
    const { stderr, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-resume.js'),
      [],
      tmpDir
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage');
  });
});

// ── specs-backlog.js ──

describe('CLI: specs-backlog.js', () => {
  test('成功建立 backlog feature', () => {
    const { stdout, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-backlog.js'),
      ['my-backlog-feature', 'quick'],
      tmpDir
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('my-backlog-feature');
    expect(existsSync(specs.backlogFeaturePath(tmpDir, 'my-backlog-feature'))).toBe(true);
  });

  test('未提供參數時 exit code 為 1', () => {
    const { stderr, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-backlog.js'),
      [],
      tmpDir
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage');
  });

  test('未知 workflowType 時 exit code 為 1', () => {
    const { stderr, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-backlog.js'),
      ['my-feature', 'invalid-type'],
      tmpDir
    );

    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid-type');
  });
});

// ── specs-list.js ──

describe('CLI: specs-list.js', () => {
  test('無任何 feature 時輸出「沒有任何 feature」', () => {
    const { stdout, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-list.js'),
      [],
      tmpDir
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('沒有任何 feature');
  });

  test('有 in-progress feature 時列出名稱', () => {
    specs.initFeatureDir(tmpDir, 'listed-feature', 'standard');

    const { stdout, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-list.js'),
      [],
      tmpDir
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('listed-feature');
    expect(stdout).toContain('In Progress');
  });

  test('有 backlog feature 時列出名稱', () => {
    specs.createBacklog(tmpDir, 'backlog-feature', 'quick');

    const { stdout, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'specs-list.js'),
      [],
      tmpDir
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('backlog-feature');
    expect(stdout).toContain('Backlog');
  });
});

// ── tasks.md checkbox — buildTasksMd workflow stages 驗證 ──
// 修復：buildTasksMd 應用 workflow stages 生成 checkbox，而非文件類型

describe('buildTasksMd — tasks.md checkbox 內容驗證', () => {
  test('standard workflow 的 tasks.md checkbox 應為 workflow stages 而非文件類型', () => {
    // standard workflow stages: ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']
    // 去重後：PLAN, ARCH, TEST, DEV, REVIEW, RETRO, DOCS
    const result = specs.initFeatureDir(tmpDir, 'test-feature', 'standard');
    const tasksPath = path.join(result, 'tasks.md');
    const content = readFileSync(tasksPath, 'utf8');

    // 應包含 workflow stages 的 checkbox
    expect(content).toContain('- [ ] PLAN');
    expect(content).toContain('- [ ] ARCH');
    expect(content).toContain('- [ ] DEV');
    expect(content).toContain('- [ ] TEST');
    expect(content).toContain('- [ ] REVIEW');
    expect(content).toContain('- [ ] RETRO');
    expect(content).toContain('- [ ] DOCS');

    // 不應包含文件類型名稱（舊的錯誤格式）
    expect(content).not.toContain('- [ ] tasks');
    expect(content).not.toContain('- [ ] bdd');
  });

  test('full workflow 的 tasks.md checkbox 應包含 DESIGN、QA、E2E stages', () => {
    // full workflow stages: ['PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV', 'REVIEW', 'TEST', 'QA', 'E2E', 'RETRO', 'DOCS']
    const result = specs.initFeatureDir(tmpDir, 'full-feature', 'full');
    const tasksPath = path.join(result, 'tasks.md');
    const content = readFileSync(tasksPath, 'utf8');

    expect(content).toContain('- [ ] PLAN');
    expect(content).toContain('- [ ] ARCH');
    expect(content).toContain('- [ ] DESIGN');
    expect(content).toContain('- [ ] TEST');
    expect(content).toContain('- [ ] DEV');
    expect(content).toContain('- [ ] REVIEW');
    expect(content).toContain('- [ ] QA');
    expect(content).toContain('- [ ] E2E');
    expect(content).toContain('- [ ] RETRO');
    expect(content).toContain('- [ ] DOCS');

    // 不應包含文件類型名稱
    expect(content).not.toContain('- [ ] tasks');
    expect(content).not.toContain('- [ ] bdd');
  });

  test('quick workflow（specsConfig 有 tasks）的 checkbox 應為 workflow stages', () => {
    // quick workflow stages: ['DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']
    const result = specs.initFeatureDir(tmpDir, 'quick-feature', 'quick');
    const tasksPath = path.join(result, 'tasks.md');
    const content = readFileSync(tasksPath, 'utf8');

    expect(content).toContain('- [ ] DEV');
    expect(content).toContain('- [ ] REVIEW');
    expect(content).toContain('- [ ] TEST');
    expect(content).toContain('- [ ] RETRO');

    // 不應包含文件類型名稱
    expect(content).not.toContain('- [ ] tasks');
  });

  test('standard workflow 的 checkbox 不重複（TEST 出現兩次但只有一個 checkbox）', () => {
    // standard stages 含兩個 TEST，去重後只應出現一次
    const result = specs.initFeatureDir(tmpDir, 'no-dup-feature', 'standard');
    const tasksPath = path.join(result, 'tasks.md');
    const content = readFileSync(tasksPath, 'utf8');

    // 計算 '- [ ] TEST' 出現次數
    const testCheckboxCount = (content.match(/- \[ \] TEST/g) || []).length;
    expect(testCheckboxCount).toBe(1);
  });

  test('readTasksCheckboxes 能正確統計 workflow stages checkbox', () => {
    // standard 去重 stages：PLAN, ARCH, TEST, DEV, REVIEW, RETRO, DOCS = 7 個
    const result = specs.initFeatureDir(tmpDir, 'count-feature', 'standard');
    const tasksPath = path.join(result, 'tasks.md');

    const stats = specs.readTasksCheckboxes(tasksPath);
    expect(stats).not.toBeNull();
    expect(stats.total).toBe(7);
    expect(stats.checked).toBe(0);
    expect(stats.allChecked).toBe(false);
  });
});

// ── buildTasksMd — single workflow（specsConfig 空）不生成 checkbox ──

describe('buildTasksMd — specsConfig 空的 workflow 不生成 checkbox', () => {
  test('single workflow 的 specsConfig 為空，initFeatureDir 不被呼叫但 buildTasksMd 生成空 checkbox', () => {
    // single 的 specsConfig = [] → buildTasksMd 內 config.length === 0 → 不生成 checkbox
    // 驗證 buildTasksMd 邏輯：直接呼叫 initFeatureDir（即使 single 不通過 init-workflow.js 的 specsConfig 判斷）
    const result = specs.initFeatureDir(tmpDir, 'single-feature', 'single');
    const tasksPath = path.join(result, 'tasks.md');
    const content = readFileSync(tasksPath, 'utf8');

    // single 的 specsConfig 為空，不應有任何 stage checkbox
    expect(content).not.toContain('- [ ] DEV');
    expect(content).not.toContain('- [ ] tasks');
    expect(content).not.toContain('- [ ] bdd');

    // tasks.md 應仍存在，只是沒有 checkbox
    const stats = specs.readTasksCheckboxes(tasksPath);
    expect(stats).not.toBeNull();
    expect(stats.total).toBe(0);
  });

  test('diagnose workflow（specsConfig 空）同樣不生成 checkbox', () => {
    const result = specs.initFeatureDir(tmpDir, 'diagnose-feature', 'diagnose');
    const tasksPath = path.join(result, 'tasks.md');
    const content = readFileSync(tasksPath, 'utf8');

    expect(content).not.toContain('- [ ] DEBUG');
    expect(content).not.toContain('- [ ] tasks');

    const stats = specs.readTasksCheckboxes(tasksPath);
    expect(stats.total).toBe(0);
  });
});
