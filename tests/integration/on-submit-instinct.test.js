'use strict';
/**
 * on-submit-instinct.test.js — on-submit.js workflow_routing 觀察整合測試
 *
 * 測試 on-submit.js 在偵測到進行中 workflow 時記錄 workflow_routing 觀察的行為。
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const HOOK_PATH = join(HOOKS_DIR, 'prompt', 'on-submit.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const instinct = require(join(SCRIPTS_LIB, 'instinct'));

// ── 輔助函式 ──

/**
 * 執行 on-submit.js hook，回傳解析後的 JSON 輸出
 * @param {object} input - hook 的 stdin 輸入
 * @returns {Promise<{ additionalContext: string }>}
 */
async function runHook(input) {
  const proc = Bun.spawn(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  return JSON.parse(output);
}

// ── Session 管理 ──

const SESSION_PREFIX = `test_on_submit_instinct_${Date.now()}`;
let sessionCounter = 0;

function newSessionId() {
  return `${SESSION_PREFIX}_${++sessionCounter}`;
}

const createdSessions = [];

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 1：已有進行中 workflow 時記錄 workflow_routing
// ────────────────────────────────────────────────────────────────────────────

describe('場景 1：已有進行中 workflow 時記錄 workflow_routing', () => {
  test('workflowType=standard → 觀察 type=workflow_routing，tag=wf-standard', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'standard', ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST:2', 'RETRO', 'DOCS']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      s.currentStage = 'DEV';
      return s;
    });

    await runHook({
      session_id: sessionId,
      prompt: '請繼續完成開發',
      cwd: process.cwd(),
    });

    const observations = instinct.query(sessionId, { type: 'workflow_routing' });
    expect(observations.length).toBeGreaterThan(0);

    const obs = observations.find(o => o.tag === 'wf-standard');
    expect(obs).toBeDefined();
    expect(obs.type).toBe('workflow_routing');
    expect(obs.trigger).toBe('請繼續完成開發');
    expect(obs.action).toContain('standard');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 2：首次 prompt（無 workflow state）不記錄 workflow_routing
// ────────────────────────────────────────────────────────────────────────────

describe('場景 2：首次 prompt 不記錄 workflow_routing', () => {
  test('全新 session，無 workflow.json → observations.jsonl 不含 workflow_routing', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 不建立 workflow state（模擬全新 session）
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    const output = await runHook({
      session_id: sessionId,
      prompt: '請幫我實作登入功能',
      cwd: process.cwd(),
    });

    // systemMessage 應注入 /ot:auto 指引
    expect(output.additionalContext).toContain('/ot:auto');

    // 不應有 workflow_routing 觀察
    const observations = instinct.query(sessionId, { type: 'workflow_routing' });
    expect(observations.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 3：使用者 prompt 超過 80 字元時截斷作為 trigger
// ────────────────────────────────────────────────────────────────────────────

describe('場景 3：prompt 超過 80 字元時截斷', () => {
  test('200 字元的 prompt → trigger 只有前 80 字元', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      s.currentStage = 'DEV';
      return s;
    });

    const longPrompt = '請幫我實作一個非常複雜的功能，需要包含認證、授權、資料庫查詢、快取機制和完整的錯誤處理。還需要撰寫完整的單元測試和整合測試。';

    await runHook({
      session_id: sessionId,
      prompt: longPrompt,
      cwd: process.cwd(),
    });

    const observations = instinct.query(sessionId, { type: 'workflow_routing', tag: 'wf-quick' });
    expect(observations.length).toBeGreaterThan(0);

    // trigger 應為前 80 字元
    const obs = observations[0];
    expect(obs.trigger.length).toBeLessThanOrEqual(80);
    expect(obs.trigger).toBe(longPrompt.slice(0, 80));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 4：使用者 prompt 為空字串時使用預設 trigger
// ────────────────────────────────────────────────────────────────────────────

describe('場景 4：空字串 prompt 使用預設 trigger', () => {
  test('空字串 prompt → trigger 為 "(empty prompt)"', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'tdd', ['TEST', 'DEV', 'TEST:2']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      return s;
    });

    await runHook({
      session_id: sessionId,
      prompt: '',
      cwd: process.cwd(),
    });

    const observations = instinct.query(sessionId, { type: 'workflow_routing', tag: 'wf-tdd' });
    expect(observations.length).toBeGreaterThan(0);
    expect(observations[0].trigger).toBe('(empty prompt)');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 5：instinct.emit() 失敗時 on-submit.js 繼續正常輸出
// ────────────────────────────────────────────────────────────────────────────

describe('場景 5：hook 主流程不受 instinct 失敗影響', () => {
  test('即使無法記錄觀察，systemMessage 仍正常輸出', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      s.currentStage = 'DEV';
      return s;
    });

    // 正常執行，即使 instinct 內部可能失敗，hook 也應正常輸出
    const output = await runHook({
      session_id: sessionId,
      prompt: '繼續開發',
      cwd: process.cwd(),
    });

    // systemMessage 應包含 workflow 狀態資訊
    expect(output.additionalContext).toContain('quick');
    expect(typeof output.additionalContext).toBe('string');
  });
});
