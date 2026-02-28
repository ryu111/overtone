'use strict';
const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const HOOK_PATH = join(HOOKS_DIR, 'tool', 'post-use.js');

// ── Session 管理 ──

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));

// 每個測試場景使用獨立 sessionId 避免干擾
const SESSION_1 = `test_post_bash_s1_${Date.now()}`;
const SESSION_2 = `test_post_bash_s2_${Date.now()}`;
const SESSION_3 = `test_post_bash_s3_${Date.now()}`;
const SESSION_4 = `test_post_bash_s4_${Date.now()}`;
const SESSION_5 = `test_post_bash_s5_${Date.now()}`;
const SESSION_6 = `test_post_bash_s6_${Date.now()}`;
const SESSION_7 = `test_post_bash_s7_${Date.now()}`;
const SESSION_8 = `test_post_bash_s8_${Date.now()}`;

const ALL_SESSIONS = [SESSION_1, SESSION_2, SESSION_3, SESSION_4, SESSION_5, SESSION_6, SESSION_7, SESSION_8];

const instinct = require(join(SCRIPTS_LIB, 'instinct'));

beforeAll(() => {
  // 建立所有 session，確保 instinct.emit 有有效的 session 存在
  for (const sessionId of ALL_SESSIONS) {
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
  }
});

afterAll(() => {
  // 清理所有測試 session 目錄
  for (const sessionId of ALL_SESSIONS) {
    rmSync(paths.sessionDir(sessionId), { recursive: true, force: true });
  }
});

// ── 輔助函式 ──

/**
 * 執行 post-use.js hook，回傳解析後的輸出
 * @param {object} input - hook 的 stdin 輸入（PostToolUse 格式）
 * @returns {Promise<{ exitCode: number, result: string|null }>}
 *   exitCode：子進程退出碼
 *   result：若 stdout 為 JSON { result: "..." } 則是 result 字串，否則 null
 */
async function runHook(input) {
  const proc = Bun.spawn(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  let result = null;
  if (stdout.trim()) {
    try {
      const parsed = JSON.parse(stdout);
      result = parsed.result ?? null;
    } catch {
      result = stdout;
    }
  }

  return { exitCode, result };
}

// ────────────────────────────────────────────────────────────────────────────
// 場景 1：Bash exit 0 時無錯誤守衛輸出
// ────────────────────────────────────────────────────────────────────────────

describe('場景 1：Bash exit 0 時無錯誤守衛輸出', () => {
  test('exit_code=0 → 子進程 exit 0，result 不含錯誤守衛關鍵詞', async () => {
    const { exitCode, result } = await runHook({
      session_id: SESSION_1,
      tool_name: 'Bash',
      tool_input: { command: 'bun test' },
      tool_response: { exit_code: 0, stdout: 'OK', stderr: '' },
    });

    expect(exitCode).toBe(0);
    // exit 0 時 observeBashError 回傳 null，不寫任何 result
    // result 為 null（無 stdout）或字串（不含守衛關鍵詞）
    if (result !== null) {
      expect(result).not.toContain('[Overtone 錯誤守衛]');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 2：Bash exit 1 + 重要工具 + 實質 stderr → 輸出錯誤守衛訊息
// ────────────────────────────────────────────────────────────────────────────

describe('場景 2：Bash exit 1 + 重要工具 + 實質 stderr 輸出錯誤守衛', () => {
  test('exit_code=1 + bun + 長 stderr → result 包含 [Overtone 錯誤守衛]', async () => {
    const { exitCode, result } = await runHook({
      session_id: SESSION_2,
      tool_name: 'Bash',
      tool_input: { command: 'bun test' },
      tool_response: {
        exit_code: 1,
        stdout: '',
        stderr: 'Error: Cannot find module xyz - compilation failed',
      },
    });

    expect(exitCode).toBe(0);
    expect(result).not.toBeNull();
    // 包含錯誤守衛標識
    expect(result).toContain('[Overtone 錯誤守衛]');
    // 包含主要工具名稱（bun）
    expect(result).toContain('bun');
    // 包含強制用詞 MUST NOT
    expect(result).toContain('MUST NOT');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 3：Bash exit 1 + 不重要工具 → 不輸出錯誤守衛
// ────────────────────────────────────────────────────────────────────────────

describe('場景 3：Bash exit 1 + 不重要工具時不輸出錯誤守衛', () => {
  test('exit_code=1 + my-custom-script → exit 0，result 不含 [Overtone 錯誤守衛]', async () => {
    const { exitCode, result } = await runHook({
      session_id: SESSION_3,
      tool_name: 'Bash',
      tool_input: { command: 'my-custom-script --run all' },
      tool_response: {
        exit_code: 1,
        stdout: '',
        stderr: 'some error message here long enough to pass threshold',
      },
    });

    expect(exitCode).toBe(0);
    // my-custom-script 不在重要工具清單，isSignificantTool = false → 不觸發守衛
    // instinct.emit 會成功，但不回傳 guard 字串，result 為 null 或不含守衛訊息
    if (result !== null) {
      expect(result).not.toContain('[Overtone 錯誤守衛]');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 4：非 Bash 工具不觸發 observeBashError
// ────────────────────────────────────────────────────────────────────────────

describe('場景 4：非 Bash 工具不觸發 observeBashError', () => {
  test('tool_name=Grep → exit 0，result 不含錯誤守衛訊息', async () => {
    const { exitCode, result } = await runHook({
      session_id: SESSION_4,
      tool_name: 'Grep',
      tool_input: { pattern: 'foo', path: '/tmp' },
      tool_response: { exit_code: 1, stdout: '', stderr: 'error: something failed here' },
    });

    expect(exitCode).toBe(0);
    // Grep 不進入 observeBashError 分支，不會產生錯誤守衛
    // result 為 null（無 guard 輸出）或字串（不含守衛訊息）
    if (result !== null) {
      expect(result).not.toContain('[Overtone 錯誤守衛]');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 5：search-tools 反面觀察 — Bash grep/find/rg 偵測
// ────────────────────────────────────────────────────────────────────────────

describe('場景 5：search-tools 反面觀察', () => {
  test('Bash grep 觸發 tool_preferences 觀察（exit_code=0）', async () => {
    const { exitCode } = await runHook({
      session_id: SESSION_5,
      tool_name: 'Bash',
      tool_input: { command: 'grep -r "pattern" ./src' },
      tool_response: { exit_code: 0, stdout: '', stderr: '' },
    });

    expect(exitCode).toBe(0);

    // 驗證 instinct 觀察記錄
    const observations = instinct.query(SESSION_5, { type: 'tool_preferences', tag: 'search-tools' });
    expect(observations.length).toBeGreaterThan(0);
    expect(observations[0].action).toContain('建議改用 Grep/Glob 工具');
    expect(observations[0].trigger).toContain('grep');
  });

  test('Bash 管道 grep（cat file | grep）也觸發觀察', async () => {
    await runHook({
      session_id: SESSION_6,
      tool_name: 'Bash',
      tool_input: { command: 'cat package.json | grep "version"' },
      tool_response: { exit_code: 0, stdout: '"version": "1.0.0"', stderr: '' },
    });

    const observations = instinct.query(SESSION_6, { type: 'tool_preferences', tag: 'search-tools' });
    expect(observations.length).toBeGreaterThan(0);
  });

  test('Bash rg 也觸發 search-tools 觀察', async () => {
    await runHook({
      session_id: SESSION_7,
      tool_name: 'Bash',
      tool_input: { command: 'rg "TODO" ./plugins' },
      tool_response: { exit_code: 0, stdout: '', stderr: '' },
    });

    const observations = instinct.query(SESSION_7, { type: 'tool_preferences', tag: 'search-tools' });
    expect(observations.length).toBeGreaterThan(0);
  });

  test('Bash grep exit_code=1（無匹配行）也觸發觀察（不以成敗區分）', async () => {
    await runHook({
      session_id: SESSION_8,
      tool_name: 'Bash',
      tool_input: { command: 'grep "pattern" ./no-match-file' },
      tool_response: { exit_code: 1, stdout: '', stderr: '' },
    });

    const observations = instinct.query(SESSION_8, { type: 'tool_preferences', tag: 'search-tools' });
    expect(observations.length).toBeGreaterThan(0);
  });

  test('Grep 工具使用時不記錄 search-tools 觀察', async () => {
    // SESSION_4 使用 Grep 工具（場景 4 已執行）
    const observations = instinct.query(SESSION_4, { type: 'tool_preferences', tag: 'search-tools' });
    expect(observations.length).toBe(0);
  });

  test('Bash 指令含 fingerprint 不觸發（word boundary 匹配）', async () => {
    // 建立獨立 session 避免與其他測試干擾
    const fpSession = `test_post_bash_fp_${Date.now()}`;
    mkdirSync(paths.sessionDir(fpSession), { recursive: true });
    state.initState(fpSession, 'quick', ['DEV', 'REVIEW', 'TEST']);

    try {
      await runHook({
        session_id: fpSession,
        tool_name: 'Bash',
        tool_input: { command: 'node -e "console.log(fingerprint)"' },
        tool_response: { exit_code: 0, stdout: '', stderr: '' },
      });

      const observations = instinct.query(fpSession, { type: 'tool_preferences', tag: 'search-tools' });
      expect(observations.length).toBe(0);
    } finally {
      rmSync(paths.sessionDir(fpSession), { recursive: true, force: true });
    }
  });
});
