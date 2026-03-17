// error-analyzer.test.js — error-analyzer.js 單元測試
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';

const ERROR_ANALYZER_PATH = join(homedir(), '.claude/scripts/error-analyzer.js');

const {
  clusterErrors,
  createRepairTaskIfNeeded,
} = await import(ERROR_ANALYZER_PATH);

// ─── 測試輔助 ────────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), `error-analyzer-test-${Date.now()}`);
mkdirSync(TMP_DIR, { recursive: true });

function makeDedupPath() {
  return join(TMP_DIR, `dedup-${Math.random().toString(36).slice(2)}.json`);
}

afterEach(() => {
  // 清理 TMP_DIR 下的檔案
});

// ─── clusterErrors 測試 ──────────────────────────────────────────────────────

describe('clusterErrors', () => {
  test('相同 event+phase 歸為同一根因', () => {
    const errors = [
      { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
      { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
      { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
    ];

    const clusters = clusterErrors(errors);
    expect(Object.keys(clusters)).toHaveLength(1);
    expect(clusters['PreToolUse:guard'].count).toBe(3);
    expect(clusters['PreToolUse:guard'].sample).toBe('timeout');
  });

  test('不同 event+phase 分開歸類', () => {
    const errors = [
      { event: 'PreToolUse', phase: 'guard', error: 'err1' },
      { event: 'PostToolUse', phase: 'observer', error: 'err2' },
      { event: 'PreToolUse', phase: 'unknown', error: 'err3' },
    ];

    const clusters = clusterErrors(errors);
    expect(Object.keys(clusters)).toHaveLength(3);
    expect(clusters['PreToolUse:guard'].count).toBe(1);
    expect(clusters['PostToolUse:observer'].count).toBe(1);
  });

  test('phase 為空時使用 "unknown"', () => {
    const errors = [
      { event: 'SessionStart', error: 'init failed' },
    ];

    const clusters = clusterErrors(errors);
    expect(clusters['SessionStart:unknown']).toBeDefined();
    expect(clusters['SessionStart:unknown'].count).toBe(1);
  });

  test('空陣列返回空物件', () => {
    const clusters = clusterErrors([]);
    expect(Object.keys(clusters)).toHaveLength(0);
  });

  test('sample 取第一個 error 文字', () => {
    const errors = [
      { event: 'A', phase: 'B', error: 'first error message' },
      { event: 'A', phase: 'B', error: 'second error message' },
    ];

    const clusters = clusterErrors(errors);
    expect(clusters['A:B'].sample).toBe('first error message');
  });
});

// ─── isSelfHealingError 測試 ─────────────────────────────────────────────────

describe('isSelfHealingError', () => {
  let isSelfHealingError;

  test('載入 isSelfHealingError', async () => {
    const mod = await import(ERROR_ANALYZER_PATH);
    isSelfHealingError = mod.isSelfHealingError;
    expect(typeof isSelfHealingError).toBe('function');
  });

  test('PreToolUse:Bash:all-failed → true（有 fallback）', async () => {
    const mod = await import(ERROR_ANALYZER_PATH);
    expect(mod.isSelfHealingError('PreToolUse:Bash:all-failed')).toBe(true);
  });

  test('PreToolUse:Write:all-failed → true（有 fallback）', async () => {
    const mod = await import(ERROR_ANALYZER_PATH);
    expect(mod.isSelfHealingError('PreToolUse:Write:all-failed')).toBe(true);
  });

  test('PreToolUse:Edit:all-failed → true（有 fallback）', async () => {
    const mod = await import(ERROR_ANALYZER_PATH);
    expect(mod.isSelfHealingError('PreToolUse:Edit:all-failed')).toBe(true);
  });

  test('PostToolUse:observer:all-failed → false（觀測型，無 fallback）', async () => {
    const mod = await import(ERROR_ANALYZER_PATH);
    expect(mod.isSelfHealingError('PostToolUse:observer:all-failed')).toBe(false);
  });

  test('PreToolUse:Bash:dispatch → true（dispatch phase + 有 fallback）', async () => {
    const mod = await import(ERROR_ANALYZER_PATH);
    expect(mod.isSelfHealingError('PreToolUse:Bash:dispatch')).toBe(true);
  });

  test('PreToolUse:Bash:retry → true（retry phase + 有 fallback）', async () => {
    const mod = await import(ERROR_ANALYZER_PATH);
    expect(mod.isSelfHealingError('PreToolUse:Bash:retry')).toBe(true);
  });

  test('SessionStart:dispatch → false（dispatch phase 但無 fallback）', async () => {
    const mod = await import(ERROR_ANALYZER_PATH);
    expect(mod.isSelfHealingError('SessionStart:dispatch')).toBe(false);
  });

  test('PreToolUse:Bash:stdin → false（phase 不是 all-failed/dispatch/retry）', async () => {
    const mod = await import(ERROR_ANALYZER_PATH);
    expect(mod.isSelfHealingError('PreToolUse:Bash:stdin')).toBe(false);
  });

  test('SessionStart:unknown → false（無 fallback）', async () => {
    const mod = await import(ERROR_ANALYZER_PATH);
    expect(mod.isSelfHealingError('SessionStart:unknown')).toBe(false);
  });
});

// ─── createRepairTaskIfNeeded 自癒過濾測試 ──────────────────────────────────

describe('createRepairTaskIfNeeded 自癒過濾', () => {
  test('全為自癒型錯誤 → 不建任務', async () => {
    const createdTasks = [];
    try { unlinkSync('/tmp/hook-error-tasks-created.json'); } catch (e) { /* cleanup */ }

    const errors = [
      { event: 'PreToolUse:Bash', phase: 'all-failed', error: 'Unable to connect' },
      { event: 'PreToolUse:Bash', phase: 'all-failed', error: 'Unable to connect' },
      { event: 'PreToolUse:Bash', phase: 'all-failed', error: 'Unable to connect' },
      { event: 'PreToolUse:Bash', phase: 'all-failed', error: 'Unable to connect' },
      { event: 'PreToolUse:Bash', phase: 'all-failed', error: 'Unable to connect' },
    ];

    await createRepairTaskIfNeeded(errors, {
      createTask: async (title) => createdTasks.push(title),
      log: () => {},
      existsSync,
      readFileSync,
      writeFileSync,
    });

    expect(createdTasks.length).toBe(0);
    try { unlinkSync('/tmp/hook-error-tasks-created.json'); } catch (e) { /* cleanup */ }
  });

  test('自癒 + 非自癒混合 → 只對非自癒建任務', async () => {
    const createdTasks = [];
    try { unlinkSync('/tmp/hook-error-tasks-created.json'); } catch (e) { /* cleanup */ }

    const errors = [
      { event: 'PreToolUse:Bash', phase: 'all-failed', error: 'Unable to connect' },
      { event: 'PreToolUse:Bash', phase: 'all-failed', error: 'Unable to connect' },
      { event: 'PreToolUse:Bash', phase: 'all-failed', error: 'Unable to connect' },
      { event: 'SessionStart', phase: 'unknown', error: 'init failed' },
      { event: 'SessionStart', phase: 'unknown', error: 'init failed' },
      { event: 'SessionStart', phase: 'unknown', error: 'init failed' },
      { event: 'SessionStart', phase: 'unknown', error: 'init failed' },
      { event: 'SessionStart', phase: 'unknown', error: 'init failed' },
    ];

    await createRepairTaskIfNeeded(errors, {
      createTask: async (title) => createdTasks.push(title),
      log: () => {},
      existsSync,
      readFileSync,
      writeFileSync,
    });

    expect(createdTasks.length).toBe(1);
    expect(createdTasks[0]).toContain('SessionStart');
    expect(createdTasks[0]).not.toContain('PreToolUse:Bash');
    try { unlinkSync('/tmp/hook-error-tasks-created.json'); } catch (e) { /* cleanup */ }
  });
});

// ─── createRepairTaskIfNeeded 測試 ───────────────────────────────────────────

describe('createRepairTaskIfNeeded', () => {
  test('hookErrors < 5 時不建立任務（已由呼叫端判斷，但函式內部沒有限制）', async () => {
    // createRepairTaskIfNeeded 本身不過濾數量（呼叫端負責 if >= 5）
    // 但測試確認少量 errors 仍能正常處理
    const createdTasks = [];
    const dedupFile = makeDedupPath();

    const errors = [
      { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
      { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
    ];

    await createRepairTaskIfNeeded(errors, {
      createTask: async (title, _opts) => createdTasks.push(title),
      log: () => {},
      existsSync,
      readFileSync,
      writeFileSync: (path, data) => writeFileSync(path, data),
    });

    expect(createdTasks.length).toBe(1);

    // 清理
    if (existsSync(dedupFile)) unlinkSync(dedupFile);
  });

  test('建立任務後記錄到 dedup 檔案防止重複', async () => {
    const createdTasks = [];
    const logs = [];

    // 確保測試前清除舊的 dedup 檔
    try { unlinkSync('/tmp/hook-error-tasks-created.json'); } catch (e) { /* cleanup */ }

    const deps = {
      createTask: async (title) => createdTasks.push(title),
      log: (m) => logs.push(m),
      existsSync,
      readFileSync,
      writeFileSync,
    };

    const errors = [
      { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
      { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
      { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
    ];

    // 第一次：應建立任務
    await createRepairTaskIfNeeded(errors, deps);
    expect(createdTasks.length).toBe(1);

    // 第二次：應跳過（24h 內已建過）
    await createRepairTaskIfNeeded(errors, deps);
    expect(createdTasks.length).toBe(1); // 沒有新增

    // 清理
    try { unlinkSync('/tmp/hook-error-tasks-created.json'); } catch (e) { /* cleanup */ }
  });

  test('24h 內不重複建立相同根因任務', async () => {
    const dedupFile = '/tmp/hook-error-tasks-created.json';
    const createdTasks = [];
    const logs = [];

    // 寫入一個已存在的記錄（now - 1h = 在 24h 內）
    const recentTime = new Date(Date.now() - 3600000).toISOString();
    writeFileSync(dedupFile, JSON.stringify({ 'PreToolUse:guard': recentTime }));

    const deps = {
      createTask: async (title) => createdTasks.push(title),
      log: (m) => logs.push(m),
      existsSync,
      readFileSync,
      writeFileSync,
    };

    const errors = [
      { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
      { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
    ];

    await createRepairTaskIfNeeded(errors, deps);

    // 應該跳過（24h 內已建過）
    expect(createdTasks.length).toBe(0);
    expect(logs.some((l) => l.includes('個已建過'))).toBe(true);

    // 清理
    try { unlinkSync(dedupFile); } catch (e) { /* cleanup */ }
  });

  test('24h 外的記錄應該重新建立任務', async () => {
    const dedupFile = '/tmp/hook-error-tasks-created.json';
    const createdTasks = [];

    // 寫入一個過期記錄（now - 25h）
    const oldTime = new Date(Date.now() - 25 * 3600000).toISOString();
    writeFileSync(dedupFile, JSON.stringify({ 'PreToolUse:guard': oldTime }));

    await createRepairTaskIfNeeded(
      [
        { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
        { event: 'PreToolUse', phase: 'guard', error: 'timeout' },
      ],
      {
        createTask: async (title) => createdTasks.push(title),
        log: () => {},
        existsSync,
        readFileSync,
        writeFileSync,
      }
    );

    expect(createdTasks.length).toBe(1);
    expect(createdTasks[0]).toContain('PreToolUse:guard');

    // 清理
    try { unlinkSync(dedupFile); } catch (e) { /* cleanup */ }
  });

  test('選擇最頻繁的根因建立任務', async () => {
    const createdTasks = [];

    const errors = [
      { event: 'PreToolUse', phase: 'guard', error: 'err' },
      { event: 'PreToolUse', phase: 'guard', error: 'err' },
      { event: 'PreToolUse', phase: 'guard', error: 'err' }, // 3 次
      { event: 'PostToolUse', phase: 'observe', error: 'err2' }, // 1 次
    ];

    // 清除可能存在的舊 dedup 檔
    try { unlinkSync('/tmp/hook-error-tasks-created.json'); } catch (e) { /* cleanup */ }

    await createRepairTaskIfNeeded(errors, {
      createTask: async (title) => createdTasks.push(title),
      log: () => {},
      existsSync,
      readFileSync,
      writeFileSync,
    });

    expect(createdTasks.length).toBe(1);
    // 應選擇最頻繁的 PreToolUse:guard
    expect(createdTasks[0]).toContain('PreToolUse:guard');
    expect(createdTasks[0]).toContain('3 次');

    // 清理
    try { unlinkSync('/tmp/hook-error-tasks-created.json'); } catch (e) { /* cleanup */ }
  });
});
