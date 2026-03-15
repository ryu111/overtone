import { describe, test, expect } from 'bun:test';
import { buildPrompt, spawnSession, parseStreamJson } from '../../../../.claude/scripts/session-spawner.js';

// ─── buildPrompt ─────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  test('包含任務名稱', () => {
    const task = { name: '實作心跳引擎', priority: 'P0', scope: 'R3.1', phase: 'Phase 1' };
    const prompt = buildPrompt(task);
    expect(prompt).toContain('實作心跳引擎');
  });

  test('包含優先級', () => {
    const task = { name: '測試任務', priority: 'P1' };
    const prompt = buildPrompt(task);
    expect(prompt).toContain('P1');
  });

  test('包含深度路由說明', () => {
    const task = { name: '任務', priority: 'P0' };
    const prompt = buildPrompt(task);
    expect(prompt).toContain('深度路由');
  });

  test('包含 commit 說明', () => {
    const task = { name: '任務', priority: 'P0' };
    const prompt = buildPrompt(task);
    expect(prompt).toContain('commit');
  });

  test('包含 scope 欄位（若有）', () => {
    const task = { name: '任務', priority: 'P0', scope: 'R3.1' };
    const prompt = buildPrompt(task);
    expect(prompt).toContain('R3.1');
  });

  test('包含 phase 欄位（若有）', () => {
    const task = { name: '任務', priority: 'P0', phase: 'Phase 2' };
    const prompt = buildPrompt(task);
    expect(prompt).toContain('Phase 2');
  });

  test('無 scope/phase 時不崩潰', () => {
    const task = { name: '任務', priority: 'P0' };
    const prompt = buildPrompt(task);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('任務名稱缺失時有預設值', () => {
    const task = { priority: 'P1' };
    const prompt = buildPrompt(task);
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('（無名稱）');
  });
});

// ─── spawnSession — 遞迴防護 ─────────────────────────────────────────────────

describe('spawnSession 遞迴防護', () => {
  test('OVERTONE_SPAWNED=1 → { ok: false, error: "recursive spawn blocked" }', () => {
    const deps = {
      env: { OVERTONE_SPAWNED: '1', NOTION_TOKEN: 'tok', PATH: '/usr/bin' },
      spawn: () => { throw new Error('should not be called'); },
    };
    const result = spawnSession('test prompt', {}, deps);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('recursive spawn blocked');
  });

  test('OVERTONE_SPAWNED 未設定 → 允許 spawn', () => {
    let spawnCalled = false;
    const mockChild = {
      pid: 12345,
      stdin: { write: () => {}, end: () => {} },
      stdout: (async function* () { yield Buffer.from(''); })(),
      stderr: (async function* () {})(),
      exited: Promise.resolve(0),
      kill: () => {},
    };
    const deps = {
      env: { PATH: '/usr/bin' },
      spawn: () => { spawnCalled = true; return mockChild; },
    };
    const result = spawnSession('test prompt', {}, deps);
    expect(result.ok).toBe(true);
    expect(spawnCalled).toBe(true);
  });
});

// ─── spawnSession — env 過濾 ─────────────────────────────────────────────────

describe('spawnSession env 過濾', () => {
  test('保留 NOTION_TOKEN', () => {
    let capturedEnv = null;
    const mockChild = {
      stdin: { write: () => {}, end: () => {} },
      stdout: (async function* () { yield Buffer.from(''); })(),
      exited: Promise.resolve(0),
      kill: () => {},
    };
    const deps = {
      env: { NOTION_TOKEN: 'secret_token', PATH: '/usr/bin' },
      spawn: (cmd, opts) => { capturedEnv = opts.env; return mockChild; },
    };
    spawnSession('prompt', {}, deps);
    expect(capturedEnv.NOTION_TOKEN).toBe('secret_token');
  });

  test('保留 ANTHROPIC_API_KEY', () => {
    let capturedEnv = null;
    const mockChild = {
      stdin: { write: () => {}, end: () => {} },
      stdout: (async function* () { yield Buffer.from(''); })(),
      exited: Promise.resolve(0),
      kill: () => {},
    };
    const deps = {
      env: { ANTHROPIC_API_KEY: 'sk-ant-xxx', PATH: '/usr/bin' },
      spawn: (cmd, opts) => { capturedEnv = opts.env; return mockChild; },
    };
    spawnSession('prompt', {}, deps);
    expect(capturedEnv.ANTHROPIC_API_KEY).toBe('sk-ant-xxx');
  });

  test('移除 MAINTAINER_BG', () => {
    let capturedEnv = null;
    const mockChild = {
      stdin: { write: () => {}, end: () => {} },
      stdout: (async function* () { yield Buffer.from(''); })(),
      exited: Promise.resolve(0),
      kill: () => {},
    };
    const deps = {
      env: { MAINTAINER_BG: '1', PATH: '/usr/bin' },
      spawn: (cmd, opts) => { capturedEnv = opts.env; return mockChild; },
    };
    spawnSession('prompt', {}, deps);
    expect(capturedEnv.MAINTAINER_BG).toBeUndefined();
  });

  test('移除 LEARNER_BG', () => {
    let capturedEnv = null;
    const mockChild = {
      stdin: { write: () => {}, end: () => {} },
      stdout: (async function* () { yield Buffer.from(''); })(),
      exited: Promise.resolve(0),
      kill: () => {},
    };
    const deps = {
      env: { LEARNER_BG: '1', PATH: '/usr/bin' },
      spawn: (cmd, opts) => { capturedEnv = opts.env; return mockChild; },
    };
    spawnSession('prompt', {}, deps);
    expect(capturedEnv.LEARNER_BG).toBeUndefined();
  });

  test('設定 OVERTONE_SPAWNED=1 在子進程 env', () => {
    let capturedEnv = null;
    const mockChild = {
      stdin: { write: () => {}, end: () => {} },
      stdout: (async function* () { yield Buffer.from(''); })(),
      exited: Promise.resolve(0),
      kill: () => {},
    };
    const deps = {
      env: { PATH: '/usr/bin' },
      spawn: (cmd, opts) => { capturedEnv = opts.env; return mockChild; },
    };
    spawnSession('prompt', {}, deps);
    expect(capturedEnv.OVERTONE_SPAWNED).toBe('1');
  });
});

// ─── parseStreamJson ─────────────────────────────────────────────────────────

describe('parseStreamJson', () => {
  test('解析正常 result 行', () => {
    const stdout = JSON.stringify({ type: 'result', result: 'success' });
    const r = parseStreamJson(stdout);
    expect(r.success).toBe(true);
    expect(r.result).toBe('success');
  });

  test('解析 error 行', () => {
    const stdout = JSON.stringify({ type: 'error', error: 'something failed' });
    const r = parseStreamJson(stdout);
    expect(r.success).toBe(false);
    expect(r.error).toBe('something failed');
  });

  test('空 stdout → { success: false }', () => {
    const r = parseStreamJson('');
    expect(r.success).toBe(false);
  });

  test('null stdout → { success: false }', () => {
    const r = parseStreamJson(null);
    expect(r.success).toBe(false);
  });

  test('多行：取最後一個 result', () => {
    const lines = [
      JSON.stringify({ type: 'text', text: 'hello' }),
      JSON.stringify({ type: 'result', result: 'first' }),
      JSON.stringify({ type: 'result', result: 'final' }),
    ].join('\n');
    const r = parseStreamJson(lines);
    expect(r.success).toBe(true);
    expect(r.result).toBe('final');
  });

  test('錯誤行優先於其他行', () => {
    const lines = [
      JSON.stringify({ type: 'result', result: 'some result' }),
      JSON.stringify({ type: 'error', error: 'fatal error' }),
    ].join('\n');
    const r = parseStreamJson(lines);
    expect(r.success).toBe(false);
    expect(r.error).toBe('fatal error');
  });

  test('非 JSON 行不崩潰', () => {
    const stdout = 'plain text output\nmore text';
    const r = parseStreamJson(stdout);
    expect(typeof r.success).toBe('boolean');
  });
});
