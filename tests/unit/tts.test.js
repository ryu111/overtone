'use strict';
/**
 * tts.test.js — tts.js 單元測試
 *
 * 測試 speak()、speakBackground()、listVoices() 的各種場景。
 * 所有 OS 呼叫透過 _deps 依賴注入 mock，不實際呼叫 `say`。
 */

const { describe, test, expect, beforeEach } = require('bun:test');
const { speak, speakBackground, listVoices } = require('../../plugins/overtone/scripts/os/tts');

// ── speak() 測試 ──

describe('speak()', () => {
  test('macOS 平台阻塞式朗讀成功', () => {
    let calledWith = null;
    const deps = {
      platform: 'darwin',
      execSync: (cmd) => { calledWith = cmd; },
    };
    const result = speak('你好', {}, deps);

    expect(result.ok).toBe(true);
    expect(result.text).toBe('你好');
    expect(typeof result.voice).toBe('string');
    expect(calledWith).toContain('say');
  });

  test('指定語音朗讀 — execSync 指令包含 -v Alex', () => {
    let calledWith = null;
    const deps = {
      platform: 'darwin',
      execSync: (cmd) => { calledWith = cmd; },
    };
    const result = speak('hello', { voice: 'Alex' }, deps);

    expect(result.ok).toBe(true);
    expect(calledWith).toContain('-v "Alex"');
  });

  test('指定語速朗讀 — execSync 指令包含 -r 300', () => {
    let calledWith = null;
    const deps = {
      platform: 'darwin',
      execSync: (cmd) => { calledWith = cmd; },
    };
    const result = speak('test', { rate: 300 }, deps);

    expect(result.ok).toBe(true);
    expect(calledWith).toContain('-r 300');
  });

  test('非 macOS 平台回傳 UNSUPPORTED_PLATFORM', () => {
    let execSyncCalled = false;
    const deps = {
      platform: 'linux',
      execSync: () => { execSyncCalled = true; },
    };
    const result = speak('test', {}, deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(typeof result.message).toBe('string');
    expect(execSyncCalled).toBe(false);
  });

  test('空字串朗讀回傳 INVALID_ARGUMENT', () => {
    let execSyncCalled = false;
    const deps = {
      platform: 'darwin',
      execSync: () => { execSyncCalled = true; },
    };
    const result = speak('', {}, deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(execSyncCalled).toBe(false);
  });

  test('空白字串朗讀回傳 INVALID_ARGUMENT', () => {
    const deps = { platform: 'darwin', execSync: () => {} };
    const result = speak('   ', {}, deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
  });

  test('execSync 拋出例外回傳 COMMAND_FAILED', () => {
    const deps = {
      platform: 'darwin',
      execSync: () => { throw new Error('say: command not found'); },
    };
    const result = speak('hello', {}, deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toContain('say: command not found');
  });
});

// ── speakBackground() 測試 ──

describe('speakBackground()', () => {
  test('背景朗讀成功 — spawn 被呼叫且 unref() 執行', () => {
    let spawnCalled = false;
    let unrefCalled = false;
    const mockChild = { unref: () => { unrefCalled = true; } };
    const deps = {
      platform: 'darwin',
      spawn: (cmd, args, opts) => {
        spawnCalled = true;
        expect(cmd).toBe('say');
        expect(Array.isArray(args)).toBe(true);
        expect(opts.detached).toBe(true);
        return mockChild;
      },
    };
    const result = speakBackground('系統啟動', {}, deps);

    expect(result.ok).toBe(true);
    expect(spawnCalled).toBe(true);
    expect(unrefCalled).toBe(true);
  });

  test('背景朗讀帶語音和語速選項', () => {
    let spawnArgs = null;
    const mockChild = { unref: () => {} };
    const deps = {
      platform: 'darwin',
      spawn: (cmd, args) => { spawnArgs = args; return mockChild; },
    };
    speakBackground('hello', { voice: 'Mei-Jia', rate: 150 }, deps);

    expect(spawnArgs).toContain('-v');
    expect(spawnArgs).toContain('Mei-Jia');
    expect(spawnArgs).toContain('-r');
    expect(spawnArgs).toContain('150');
  });

  test('非 macOS 平台回傳 UNSUPPORTED_PLATFORM，spawn 不被呼叫', () => {
    let spawnCalled = false;
    const deps = {
      platform: 'linux',
      spawn: () => { spawnCalled = true; },
    };
    const result = speakBackground('test', {}, deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(spawnCalled).toBe(false);
  });

  test('空字串回傳 INVALID_ARGUMENT', () => {
    const deps = { platform: 'darwin', spawn: () => ({ unref: () => {} }) };
    const result = speakBackground('', {}, deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
  });
});

// ── listVoices() 測試 ──

describe('listVoices()', () => {
  test('列出可用語音 — 解析 say -v ? 輸出格式', () => {
    const mockOutput = 'Alex   en_US  # Most people recognize Alex\nMei-Jia  zh_TW  # Mei-Jia is a female voice\n';
    const deps = {
      platform: 'darwin',
      execSync: () => mockOutput,
    };
    const result = listVoices(deps);

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.voices)).toBe(true);
    expect(result.voices.length).toBeGreaterThanOrEqual(2);
    expect(result.voices[0]).toMatchObject({ name: 'Alex', lang: 'en_US' });
    expect(result.voices[1]).toMatchObject({ name: 'Mei-Jia', lang: 'zh_TW' });
  });

  test('每個語音元素包含 name 和 lang 欄位', () => {
    const mockOutput = 'Ting-Ting  zh_CN  # Ting-Ting speaks Chinese\n';
    const deps = {
      platform: 'darwin',
      execSync: () => mockOutput,
    };
    const result = listVoices(deps);

    expect(result.ok).toBe(true);
    for (const voice of result.voices) {
      expect(typeof voice.name).toBe('string');
      expect(typeof voice.lang).toBe('string');
    }
  });

  test('空輸出回傳空陣列', () => {
    const deps = {
      platform: 'darwin',
      execSync: () => '',
    };
    const result = listVoices(deps);

    expect(result.ok).toBe(true);
    expect(result.voices).toEqual([]);
  });

  test('非 macOS 平台回傳 UNSUPPORTED_PLATFORM', () => {
    const deps = {
      platform: 'win32',
      execSync: () => '',
    };
    const result = listVoices(deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
  });

  test('execSync 拋出例外回傳 COMMAND_FAILED', () => {
    const deps = {
      platform: 'darwin',
      execSync: () => { throw new Error('say: not found'); },
    };
    const result = listVoices(deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
  });
});
