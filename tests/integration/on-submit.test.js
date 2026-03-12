'use strict';
const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir, tmpdir } = require('os');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');
const SessionContext = require(join(SCRIPTS_LIB, 'session-context'));

// ── 路徑設定 ──

const HOOK_PATH = join(HOOKS_DIR, 'prompt', 'on-submit.js');

// ── 測試專案根目錄（per-project 隔離）──
const TEST_PROJECT_ROOT = join(tmpdir(), `on-submit-test-${Date.now()}`);

// ── 輔助函式 ──

/**
 * 執行 on-submit.js hook，回傳解析後的 JSON 輸出
 * @param {{ user_prompt: string }} input - hook 的 stdin 輸入
 * @param {Record<string, string>} env - 額外的環境變數
 * @returns {Promise<object>} 解析後的 JSON（hookSpecificOutput 格式）
 */
async function runHook(input, env = {}) {
  const fullInput = { cwd: TEST_PROJECT_ROOT, ...input };
  const proc = Bun.spawn(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(fullInput)),
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(output);
}

/**
 * 從 hook 輸出取得 systemMessage
 * @param {object} result - runHook 回傳值
 * @returns {string}
 */
function getContext(result) {
  return result?.systemMessage ?? '';
}

// ── 場景 8 所需的 session 管理 ──

const TEST_SESSION = `test_on_submit_${Date.now()}`;
const paths = require(join(SCRIPTS_LIB, 'paths'));
const SESSION_DIR = paths.sessionDir(TEST_PROJECT_ROOT, TEST_SESSION);
const state = require(join(SCRIPTS_LIB, 'state'));

beforeAll(() => {
  // 建立測試 session 目錄，供場景 8 使用
  mkdirSync(SESSION_DIR, { recursive: true });
  // 初始化 workflow state（quick: DEV → REVIEW → TEST）
  state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION), 'quick', ['DEV', 'REVIEW', 'TEST']);
});

afterAll(() => {
  // 清理測試專案根目錄（含所有 session 目錄）
  rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 1 & 2：/ 命令跳過
// ────────────────────────────────────────────────────────────────────────────

describe('/ 命令跳過', () => {
  test('場景 1：prompt = /auto → 回傳空 additionalContext', async () => {
    const result = await runHook({ user_prompt: '/auto' });
    // hook 輸出 systemMessage 格式，/ 命令時 systemMessage 為 undefined → ''
    expect(getContext(result)).toBe('');
  });

  test('場景 2：prompt = /plan → 回傳空 additionalContext', async () => {
    const result = await runHook({ user_prompt: '/plan' });
    expect(getContext(result)).toBe('');
  });

  test('場景 2b：prompt = /standard → 回傳空 additionalContext', async () => {
    const result = await runHook({ user_prompt: '/standard' });
    expect(getContext(result)).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 3 & 4：[workflow:xxx] 覆寫（有效 key）
// ────────────────────────────────────────────────────────────────────────────

describe('[workflow:xxx] 覆寫語法 — 有效 key', () => {
  test('場景 3：[workflow:standard] → additionalContext 包含 standard 資訊', async () => {
    const result = await runHook(
      { user_prompt: '請幫我新增功能 [workflow:standard]' },
      { CLAUDE_SESSION_ID: '' }
    );
    const ctx = getContext(result);
    expect(ctx).toBeTruthy();
    expect(ctx).toContain('standard');
    expect(ctx).toContain('標準功能');
    expect(ctx).toContain('/standard');
  });

  test('場景 4：[workflow:quick] → additionalContext 包含 quick 資訊', async () => {
    const result = await runHook(
      { user_prompt: '快速修改 [workflow:quick]' },
      { CLAUDE_SESSION_ID: '' }
    );
    const ctx = getContext(result);
    expect(ctx).toBeTruthy();
    expect(ctx).toContain('quick');
    expect(ctx).toContain('快速開發');
    expect(ctx).toContain('/quick');
  });

  test('場景 4b：[workflow:tdd] → additionalContext 包含 tdd 資訊', async () => {
    const result = await runHook(
      { user_prompt: '用 TDD 方式實作 [workflow:tdd]' },
      { CLAUDE_SESSION_ID: '' }
    );
    const ctx = getContext(result);
    expect(ctx).toBeTruthy();
    expect(ctx).toContain('tdd');
    expect(ctx).toContain('測試驅動');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 5：[workflow:invalid] — 無效 key 降級
// ────────────────────────────────────────────────────────────────────────────

describe('[workflow:xxx] 覆寫語法 — 無效 key 降級', () => {
  test('場景 5：[workflow:invalid] → 降級，不 crash，不注入 workflow 資訊', async () => {
    const result = await runHook(
      { user_prompt: '請執行 [workflow:invalid]' },
      { CLAUDE_SESSION_ID: '' }
    );
    const ctx = getContext(result);
    // v0.30：無 workflow 時不強制注入，Main Agent 自行判斷
    expect(ctx).toBe('');
    expect(ctx).not.toContain('工作流進行中');
    expect(ctx).not.toContain('/invalid');
  });

  test('場景 5b：[workflow:xyz123] → 降級，不包含 xyz123 覆寫資訊', async () => {
    const result = await runHook(
      { user_prompt: 'hello [workflow:xyz123]' },
      { CLAUDE_SESSION_ID: '' }
    );
    const ctx = getContext(result);
    // v0.30：無有效 workflow 覆寫時不注入任何 systemMessage
    expect(ctx).toBe('');
    expect(ctx).not.toContain('/xyz123');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 6：大小寫不敏感
// ────────────────────────────────────────────────────────────────────────────

describe('[workflow:xxx] 大小寫不敏感', () => {
  test('場景 6：[workflow:STANDARD] → 等同 [workflow:standard]，包含覆寫資訊', async () => {
    const result = await runHook(
      { user_prompt: '請執行 [workflow:STANDARD]' },
      { CLAUDE_SESSION_ID: '' }
    );
    const ctx = getContext(result);
    expect(ctx).toBeTruthy();
    expect(ctx).toContain('standard');
    expect(ctx).toContain('標準功能');
  });

  test('場景 6b：[workflow:QUICK] → 等同 [workflow:quick]', async () => {
    const result = await runHook(
      { user_prompt: '[workflow:QUICK]' },
      { CLAUDE_SESSION_ID: '' }
    );
    const ctx = getContext(result);
    expect(ctx).toBeTruthy();
    expect(ctx).toContain('quick');
    expect(ctx).toContain('快速開發');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 7：無 workflow、無 sessionId — 純 auto 注入
// ────────────────────────────────────────────────────────────────────────────

describe('無 workflow 狀態 — 不注入 auto 指引（v0.30 新行為）', () => {
  test('場景 7：普通文字 prompt（無 sessionId）→ 不注入 auto 指引（Main Agent 自行判斷）', async () => {
    const result = await runHook(
      { user_prompt: '請幫我修改程式碼' },
      { CLAUDE_SESSION_ID: '' }
    );
    const ctx = getContext(result);
    // v0.30：無進行中 workflow 時回傳 null，不強制 /auto 指引
    expect(ctx).toBe('');
  });

  test('場景 7b：prompt 為空字串且無 session → 抑制 auto 指引（空白 prompt 不需要注入）', async () => {
    const result = await runHook(
      { user_prompt: '' },
      { CLAUDE_SESSION_ID: '' }
    );
    const ctx = getContext(result);
    // 空 prompt + 無進行中 workflow → 抑制警告 systemMessage（task-notification / system-reminder 情境）
    expect(ctx).toBe('');
  });

  test('場景 7c：缺少 CLAUDE_SESSION_ID 環境變數 → 不注入 auto 指引（v0.30 新行為）', async () => {
    const { CLAUDE_SESSION_ID: _, ...envWithoutSession } = process.env;
    const proc = Bun.spawn(['node', HOOK_PATH], {
      stdin: Buffer.from(JSON.stringify({ user_prompt: '你好' })),
      env: envWithoutSession,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const result = JSON.parse(output);
    const ctx = getContext(result);
    // v0.30：無 session + 無 workflow → buildSystemMessage 回傳 null，不注入 /auto
    expect(ctx).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 8：有進行中 workflow（mock state）
// ────────────────────────────────────────────────────────────────────────────

describe('有進行中 workflow — 注入狀態摘要', () => {
  test('場景 8：有 workflow.json（quick, currentStage=DEV）→ 注入狀態摘要', async () => {
    const result = await runHook(
      { user_prompt: '繼續執行' },
      { CLAUDE_SESSION_ID: TEST_SESSION }
    );
    const ctx = getContext(result);
    expect(ctx).toBeTruthy();
    expect(ctx).toContain('[Overtone]');
    expect(ctx).toContain('quick');
    expect(ctx).toContain('DEV');
    expect(ctx).toContain('/auto');
  });

  test('場景 8b：狀態摘要為簡短格式（指引用戶查看 /auto）', async () => {
    const result = await runHook(
      { user_prompt: '什麼狀況？' },
      { CLAUDE_SESSION_ID: TEST_SESSION }
    );
    const ctx = getContext(result);
    expect(ctx).toBeTruthy();
    expect(ctx).toContain('/auto');
    expect(ctx).toContain('工作流進行中');
  });

  test('場景 8c：failCount = 0 時不顯示失敗次數', async () => {
    const result = await runHook(
      { user_prompt: '繼續' },
      { CLAUDE_SESSION_ID: TEST_SESSION }
    );
    expect(getContext(result)).not.toContain('失敗次數');
  });

  test('場景 8d：failCount > 0 時仍輸出簡短格式（失敗次數由 get-workflow-context.js 顯示）', async () => {
    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION), (s) => {
      s.failCount = 2;
      return s;
    });

    const result = await runHook(
      { user_prompt: '繼續' },
      { CLAUDE_SESSION_ID: TEST_SESSION }
    );
    const ctx = getContext(result);
    expect(ctx).not.toContain('失敗次數');
    expect(ctx).toContain('工作流進行中');
    expect(ctx).toContain('/auto');

    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION), (s) => {
      s.failCount = 0;
      return s;
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 9：工作流覆寫優先於 active state
// ────────────────────────────────────────────────────────────────────────────

describe('[workflow:xxx] 覆寫優先於 active workflow state', () => {
  test('場景 9：有進行中 workflow 但 prompt 含 [workflow:single] → 以覆寫為主', async () => {
    const result = await runHook(
      { user_prompt: '我要重新開始 [workflow:single]' },
      { CLAUDE_SESSION_ID: TEST_SESSION }
    );
    const ctx = getContext(result);
    expect(ctx).toBeTruthy();
    expect(ctx).toContain('single');
    expect(ctx).toContain('單步修改');
    expect(ctx).not.toContain('工作流進行中');
  });
});
