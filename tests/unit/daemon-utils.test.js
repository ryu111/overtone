// daemon-utils.test.js — daemon-utils.js 單元測試
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { writeFileSync, existsSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  setupLock,
  reportStatus,
} from '/Users/sbu/.claude/scripts/daemon-utils.js';

// ─── 測試輔助 ────────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), `daemon-utils-test-${Date.now()}`);
mkdirSync(TMP_DIR, { recursive: true });

function makeLockPath() {
  return join(TMP_DIR, `test-${Math.random().toString(36).slice(2)}.lock`);
}

// ─── setupLock 測試 ──────────────────────────────────────────────────────────

describe('setupLock', () => {
  let lockFile;
  let originalOn;
  let registeredHandlers;

  beforeEach(() => {
    lockFile = makeLockPath();
    // 記錄 process.on 呼叫但不真的覆蓋（避免影響測試框架）
    registeredHandlers = {};
    originalOn = process.on.bind(process);
    process.on = (event, handler) => {
      registeredHandlers[event] = handler;
      originalOn(event, handler);
    };
  });

  afterEach(() => {
    process.on = originalOn;
    // 清理可能殘留的 lockfile
    if (existsSync(lockFile)) {
      try { unlinkSync(lockFile); } catch {}
    }
  });

  test('應該建立 lockfile 並寫入 PID', () => {
    const removeLock = setupLock(lockFile, () => {});
    expect(existsSync(lockFile)).toBe(true);
    const content = readFileSync(lockFile, 'utf-8').trim();
    expect(content).toBe(String(process.pid));
    removeLock(); // 清理
  });

  test('建立後 removeLock 應該刪除 lockfile', () => {
    const removeLock = setupLock(lockFile, () => {});
    expect(existsSync(lockFile)).toBe(true);
    removeLock();
    expect(existsSync(lockFile)).toBe(false);
  });

  test('removeLock 應該驗證 PID 才刪除（不刪除其他 PID 的 lock）', () => {
    const removeLock = setupLock(lockFile, () => {});
    // 覆寫 lockfile 內容為不同 PID
    writeFileSync(lockFile, '99999');
    removeLock(); // 不應該刪除（PID 不符）
    expect(existsSync(lockFile)).toBe(true);
    unlinkSync(lockFile); // 手動清理
  });

  test('接受可選的 logFn 回呼', () => {
    const logs = [];
    const removeLock = setupLock(lockFile, (msg) => logs.push(msg));
    expect(existsSync(lockFile)).toBe(true);
    removeLock();
  });

  test('不傳 logFn 也能正常工作', () => {
    const removeLock = setupLock(lockFile, undefined);
    expect(existsSync(lockFile)).toBe(true);
    removeLock();
  });

  test('dead PID lock → 自動移除並建立新 lock', () => {
    // 寫入一個不存在的 PID
    writeFileSync(lockFile, '999999999');
    const logs = [];
    const removeLock = setupLock(lockFile, (msg) => logs.push(msg));
    // 應該移除 stale lock 並建立新的（當前 PID）
    expect(existsSync(lockFile)).toBe(true);
    expect(readFileSync(lockFile, 'utf-8').trim()).toBe(String(process.pid));
    expect(logs.some(m => m.includes('Stale lock removed') && m.includes('dead'))).toBe(true);
    removeLock();
  });

  test('超齡 lock（PID 存活但 age > maxAge）→ 自動移除', () => {
    // 父進程一定活著
    writeFileSync(lockFile, String(process.ppid));
    const logs = [];
    // maxAge=0 → 任何 lock 都算過期
    const removeLock = setupLock(lockFile, (msg) => logs.push(msg), { maxAge: 0 });
    expect(existsSync(lockFile)).toBe(true);
    expect(readFileSync(lockFile, 'utf-8').trim()).toBe(String(process.pid));
    expect(logs.some(m => m.includes('Stale lock removed'))).toBe(true);
    removeLock();
  });

  test('有效 lock（PID 存活 + 未過期）→ 應該阻擋（呼叫 process.exit）', () => {
    // 用父進程 PID 建立 lock，不設 maxAge 限制
    writeFileSync(lockFile, String(process.ppid));
    const logs = [];
    const originalExit = process.exit;
    let exitCalled = false;
    let exitCode;
    process.exit = (code) => { exitCalled = true; exitCode = code; };
    try {
      setupLock(lockFile, (msg) => logs.push(msg));
      expect(exitCalled).toBe(true);
      expect(exitCode).toBe(0);
      expect(logs.some(m => m.includes('Lock exists, skipping'))).toBe(true);
    } finally {
      process.exit = originalExit;
      unlinkSync(lockFile);
    }
  });

  test('lock 內容非數字 → 視為 stale 並移除', () => {
    writeFileSync(lockFile, 'corrupted');
    const logs = [];
    const removeLock = setupLock(lockFile, (msg) => logs.push(msg));
    expect(existsSync(lockFile)).toBe(true);
    expect(readFileSync(lockFile, 'utf-8').trim()).toBe(String(process.pid));
    // NaN PID → !pid → stale
    expect(logs.some(m => m.includes('Stale lock removed'))).toBe(true);
    removeLock();
  });
});

// ─── reportStatus 測試 ───────────────────────────────────────────────────────

describe('reportStatus', () => {
  test('發送正確的 POST 請求格式', async () => {
    const requests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      requests.push({ url, body: JSON.parse(opts.body) });
      return { ok: true };
    };

    try {
      await reportStatus('maintainer', 'running', 'collecting');
      expect(requests.length).toBe(1);
      expect(requests[0].url).toBe('http://127.0.0.1:3457/agent/status');
      expect(requests[0].body).toEqual({
        name: 'maintainer',
        status: 'running',
        detail: 'collecting',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('status=done 時不傳 detail（undefined）', async () => {
    const requests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, opts) => {
      requests.push(JSON.parse(opts.body));
      return { ok: true };
    };

    try {
      await reportStatus('judge', 'done');
      expect(requests[0].name).toBe('judge');
      expect(requests[0].status).toBe('done');
      expect(requests[0].detail).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('server 不可用時靜默失敗（不 throw）', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Connection refused');
    };

    try {
      // 不應該 throw
      await expect(reportStatus('learner', 'done')).resolves.toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
