'use strict';
const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

// ── 路徑設定 ──

const HOOK_PATH = join(
  __dirname,
  '../hooks/scripts/prompt/on-submit.js'
);

const STATE_LIB_PATH = join(__dirname, '../scripts/lib/state');
const PATHS_LIB_PATH = join(__dirname, '../scripts/lib/paths');

// ── 輔助函式 ──

/**
 * 執行 on-submit.js hook，回傳解析後的 JSON 輸出
 * @param {{ user_prompt: string }} input - hook 的 stdin 輸入
 * @param {Record<string, string>} env - 額外的環境變數
 * @returns {Promise<object>} 解析後的 JSON
 */
async function runHook(input, env = {}) {
  const proc = Bun.spawn(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(output);
}

// ── 場景 8 所需的 session 管理 ──

const TEST_SESSION = `test_on_submit_${Date.now()}`;
const paths = require(PATHS_LIB_PATH);
const SESSION_DIR = paths.sessionDir(TEST_SESSION);
const state = require(STATE_LIB_PATH);

beforeAll(() => {
  // 建立測試 session 目錄，供場景 8 使用
  mkdirSync(SESSION_DIR, { recursive: true });
  // 初始化 workflow state（quick: DEV → REVIEW → TEST）
  state.initState(TEST_SESSION, 'quick', ['DEV', 'REVIEW', 'TEST']);
});

afterAll(() => {
  // 清理測試 session 目錄
  rmSync(SESSION_DIR, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 1 & 2：/ot: 命令跳過
// ────────────────────────────────────────────────────────────────────────────

describe('/ot: 命令跳過', () => {
  test('場景 1：prompt = /ot:auto → 回傳空物件 {}', async () => {
    const result = await runHook({ user_prompt: '/ot:auto' });
    // hook 輸出 {} 而非 { result: '' }，這是正確的「不注入」行為
    expect(result).toEqual({});
    expect(result.additionalContext).toBeUndefined();
  });

  test('場景 2：prompt = /ot:plan → 回傳空物件 {}', async () => {
    const result = await runHook({ user_prompt: '/ot:plan' });
    expect(result).toEqual({});
    expect(result.additionalContext).toBeUndefined();
  });

  test('場景 2b：prompt = /ot:standard → 回傳空物件 {}', async () => {
    const result = await runHook({ user_prompt: '/ot:standard' });
    expect(result).toEqual({});
    expect(result.additionalContext).toBeUndefined();
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
    expect(result.additionalContext).toBeDefined();
    expect(result.additionalContext).toContain('standard');
    // 應包含 workflow label「標準功能」
    expect(result.additionalContext).toContain('標準功能');
    // 應告知使用對應 skill
    expect(result.additionalContext).toContain('/ot:standard');
  });

  test('場景 4：[workflow:quick] → additionalContext 包含 quick 資訊', async () => {
    const result = await runHook(
      { user_prompt: '快速修改 [workflow:quick]' },
      { CLAUDE_SESSION_ID: '' }
    );
    expect(result.additionalContext).toBeDefined();
    expect(result.additionalContext).toContain('quick');
    expect(result.additionalContext).toContain('快速開發');
    expect(result.additionalContext).toContain('/ot:quick');
  });

  test('場景 4b：[workflow:tdd] → additionalContext 包含 tdd 資訊', async () => {
    const result = await runHook(
      { user_prompt: '用 TDD 方式實作 [workflow:tdd]' },
      { CLAUDE_SESSION_ID: '' }
    );
    expect(result.additionalContext).toBeDefined();
    expect(result.additionalContext).toContain('tdd');
    expect(result.additionalContext).toContain('測試驅動');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 5：[workflow:invalid] — 無效 key 降級
// ────────────────────────────────────────────────────────────────────────────

describe('[workflow:xxx] 覆寫語法 — 無效 key 降級', () => {
  test('場景 5：[workflow:invalid] → 降級到一般 /ot:auto 注入（不 crash）', async () => {
    const result = await runHook(
      { user_prompt: '請執行 [workflow:invalid]' },
      { CLAUDE_SESSION_ID: '' }
    );
    // 不應 crash，應正常回傳 additionalContext
    expect(result.additionalContext).toBeDefined();
    // 降級後應注入 /ot:auto 指引（因為無 active workflow）
    expect(result.additionalContext).toContain('/ot:auto');
    // 不應包含 [Overtone] 工作流進行中 這樣的狀態摘要
    expect(result.additionalContext).not.toContain('工作流進行中');
  });

  test('場景 5b：[workflow:xyz123] → 降級，不包含 xyz123 覆寫資訊', async () => {
    const result = await runHook(
      { user_prompt: 'hello [workflow:xyz123]' },
      { CLAUDE_SESSION_ID: '' }
    );
    expect(result.additionalContext).toBeDefined();
    // 不應出現無效 workflow key 的 skill 引導
    expect(result.additionalContext).not.toContain('/ot:xyz123');
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
    expect(result.additionalContext).toBeDefined();
    // hook 使用 /i flag + .toLowerCase()，大寫應被正確處理
    expect(result.additionalContext).toContain('standard');
    expect(result.additionalContext).toContain('標準功能');
  });

  test('場景 6b：[workflow:QUICK] → 等同 [workflow:quick]', async () => {
    const result = await runHook(
      { user_prompt: '[workflow:QUICK]' },
      { CLAUDE_SESSION_ID: '' }
    );
    expect(result.additionalContext).toBeDefined();
    expect(result.additionalContext).toContain('quick');
    expect(result.additionalContext).toContain('快速開發');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 7：無 workflow、無 sessionId — 純 /ot:auto 注入
// ────────────────────────────────────────────────────────────────────────────

describe('無 workflow 狀態 — 注入 /ot:auto 指引', () => {
  test('場景 7：普通文字 prompt（無 sessionId）→ 注入 /ot:auto', async () => {
    const result = await runHook(
      { user_prompt: '請幫我修改程式碼' },
      { CLAUDE_SESSION_ID: '' }
    );
    expect(result.additionalContext).toBeDefined();
    expect(result.additionalContext).toContain('/ot:auto');
    // 應包含 [Overtone] 標記
    expect(result.additionalContext).toContain('[Overtone]');
  });

  test('場景 7b：prompt 為空字串 → 注入 /ot:auto', async () => {
    const result = await runHook(
      { user_prompt: '' },
      { CLAUDE_SESSION_ID: '' }
    );
    expect(result.additionalContext).toBeDefined();
    expect(result.additionalContext).toContain('/ot:auto');
  });

  test('場景 7c：缺少 CLAUDE_SESSION_ID 環境變數 → 注入 /ot:auto', async () => {
    // 不傳入 CLAUDE_SESSION_ID，hook 會讀到空字串
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
    expect(result.additionalContext).toBeDefined();
    expect(result.additionalContext).toContain('/ot:auto');
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
    expect(result.additionalContext).toBeDefined();
    // 應包含工作流進行中的標識
    expect(result.additionalContext).toContain('[Overtone]');
    expect(result.additionalContext).toContain('quick');
    // 應包含目前階段資訊
    expect(result.additionalContext).toContain('DEV');
    // 應包含繼續執行指引
    expect(result.additionalContext).toContain('/ot:auto');
  });

  test('場景 8b：狀態摘要包含進度（stage status icons）', async () => {
    const result = await runHook(
      { user_prompt: '什麼狀況？' },
      { CLAUDE_SESSION_ID: TEST_SESSION }
    );
    expect(result.additionalContext).toBeDefined();
    // 應包含進度顯示（⬜ 代表 pending stage，第一個 DEV 應為 active ⏳）
    const context = result.additionalContext;
    // 進度格式：icon → icon → icon（用 → 連接）
    expect(context).toMatch(/→/);
  });

  test('場景 8c：failCount = 0 時不顯示失敗次數', async () => {
    const result = await runHook(
      { user_prompt: '繼續' },
      { CLAUDE_SESSION_ID: TEST_SESSION }
    );
    // failCount 為 0 時，filter(Boolean) 會移除失敗次數行
    expect(result.additionalContext).not.toContain('失敗次數');
  });

  test('場景 8d：failCount > 0 時顯示失敗次數', async () => {
    // 更新 state 設置 failCount = 2
    state.updateStateAtomic(TEST_SESSION, (s) => {
      s.failCount = 2;
      return s;
    });

    const result = await runHook(
      { user_prompt: '繼續' },
      { CLAUDE_SESSION_ID: TEST_SESSION }
    );
    expect(result.additionalContext).toContain('失敗次數：2/3');

    // 還原 failCount = 0
    state.updateStateAtomic(TEST_SESSION, (s) => {
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
    expect(result.additionalContext).toBeDefined();
    // 覆寫指定了 single，應出現 single 資訊而非狀態摘要
    expect(result.additionalContext).toContain('single');
    expect(result.additionalContext).toContain('單步修改');
    // 不應出現「工作流進行中」的狀態摘要
    expect(result.additionalContext).not.toContain('工作流進行中');
  });
});
