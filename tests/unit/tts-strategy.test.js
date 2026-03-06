'use strict';
/**
 * tts-strategy.test.js — tts-strategy.js 單元測試
 *
 * 測試 shouldSpeak()、buildSpeakArgs()、readTtsConfig() 的各種場景。
 */

const { describe, test, expect } = require('bun:test');
const { shouldSpeak, buildSpeakArgs, readTtsConfig, TTS_LEVELS, LEVEL_EVENTS } = require('../../plugins/overtone/scripts/lib/tts-strategy');

// ── shouldSpeak() 測試 ──

describe('shouldSpeak()', () => {
  test('level=1（CRITICAL）時 error:fatal 應觸發朗讀', () => {
    expect(shouldSpeak('error:fatal', 1)).toBe(true);
  });

  test('level=1（CRITICAL）時 workflow:complete 應觸發朗讀', () => {
    expect(shouldSpeak('workflow:complete', 1)).toBe(true);
  });

  test('level=1（CRITICAL）時 notification:ask 應觸發朗讀', () => {
    expect(shouldSpeak('notification:ask', 1)).toBe(true);
  });

  test('level=1（CRITICAL）時 agent:complete 不觸發朗讀', () => {
    expect(shouldSpeak('agent:complete', 1)).toBe(false);
  });

  test('level=2（PROGRESS）累積涵蓋 level 1 事件 — error:fatal', () => {
    expect(shouldSpeak('error:fatal', 2)).toBe(true);
  });

  test('level=2（PROGRESS）加上 agent:complete', () => {
    expect(shouldSpeak('agent:complete', 2)).toBe(true);
  });

  test('level=2（PROGRESS）時 session:start 不觸發（屬於 level 3）', () => {
    expect(shouldSpeak('session:start', 2)).toBe(false);
  });

  test('level=3（VERBOSE）涵蓋所有事件 — session:start', () => {
    expect(shouldSpeak('session:start', 3)).toBe(true);
  });

  test('level=3（VERBOSE）涵蓋所有事件 — session:compact', () => {
    expect(shouldSpeak('session:compact', 3)).toBe(true);
  });

  test('level=3 也包含 level 1 和 level 2 的事件', () => {
    expect(shouldSpeak('error:fatal', 3)).toBe(true);
    expect(shouldSpeak('agent:complete', 3)).toBe(true);
    expect(shouldSpeak('loop:complete', 3)).toBe(true);
  });

  test('level=0（SILENT）任何事件均不觸發 — error:fatal', () => {
    expect(shouldSpeak('error:fatal', 0)).toBe(false);
  });

  test('level=0（SILENT）任何事件均不觸發 — workflow:complete', () => {
    expect(shouldSpeak('workflow:complete', 0)).toBe(false);
  });

  test('level=0（SILENT）任何事件均不觸發 — agent:complete', () => {
    expect(shouldSpeak('agent:complete', 0)).toBe(false);
  });

  test('未知事件鍵任何 level 都不觸發', () => {
    expect(shouldSpeak('unknown:event', 3)).toBe(false);
  });

  test('stage:retry 在 level=2 觸發', () => {
    expect(shouldSpeak('stage:retry', 2)).toBe(true);
  });

  test('parallel:converge 在 level=2 觸發', () => {
    expect(shouldSpeak('parallel:converge', 2)).toBe(true);
  });
});

// ── buildSpeakArgs() 測試 ──

describe('buildSpeakArgs()', () => {
  test('回傳已插值的 text 和 opts', () => {
    const result = buildSpeakArgs('agent:complete', { stage: 'DEV' }, { voice: 'Mei-Jia', rate: 250 });

    expect(result).not.toBeNull();
    expect(result.text).toBe('DEV 完成');
    expect(result.opts).toMatchObject({ voice: 'Mei-Jia', rate: 250 });
  });

  test('對未知事件鍵回傳 null', () => {
    const result = buildSpeakArgs('unknown:event', {}, {});

    expect(result).toBeNull();
  });

  test('不帶語音和語速時 opts 為空物件', () => {
    const result = buildSpeakArgs('agent:complete', { stage: 'DEV' }, {});

    expect(result).not.toBeNull();
    expect(result.text).toBe('DEV 完成');
    expect(result.opts).toEqual({});
  });

  test('workflow:complete 無插值參數', () => {
    const result = buildSpeakArgs('workflow:complete', {}, { voice: 'Alex' });

    expect(result).not.toBeNull();
    expect(result.text).toBe('工作流程完成');
    expect(result.opts.voice).toBe('Alex');
  });

  test('notification:ask 觸發成功', () => {
    const result = buildSpeakArgs('notification:ask', {}, {});

    expect(result).not.toBeNull();
    expect(result.text).toBe('需要你的決定');
  });

  test('config 僅有 voice 時 opts 只含 voice', () => {
    const result = buildSpeakArgs('error:fatal', {}, { voice: 'Samantha' });

    expect(result.opts).toEqual({ voice: 'Samantha' });
    expect(result.opts.rate).toBeUndefined();
  });

  test('config 僅有 rate 時 opts 只含 rate', () => {
    const result = buildSpeakArgs('error:fatal', {}, { rate: 180 });

    expect(result.opts).toEqual({ rate: 180 });
    expect(result.opts.voice).toBeUndefined();
  });
});

// ── readTtsConfig() 測試 ──

describe('readTtsConfig()', () => {
  test('無設定檔時回傳預設值（_deps.readConfig 拋出例外）', () => {
    const deps = {
      readConfig: () => { throw new Error('ENOENT: file not found'); },
    };
    const config = readTtsConfig(deps);

    expect(config).toEqual({ enabled: false, level: 1, voice: null, rate: 200 });
  });

  test('讀取自訂設定並回傳', () => {
    const customConfig = { enabled: true, level: 2, voice: 'Alex', rate: 300 };
    const deps = {
      readConfig: () => customConfig,
    };
    const config = readTtsConfig(deps);

    expect(config).toEqual({ enabled: true, level: 2, voice: 'Alex', rate: 300 });
  });

  test('部分設定值存在時合併預設值', () => {
    const deps = {
      readConfig: () => ({ enabled: true }),
    };
    const config = readTtsConfig(deps);

    expect(config.enabled).toBe(true);
    expect(config.level).toBe(1);
    expect(config.voice).toBeNull();
    expect(config.rate).toBe(200);
  });

  test('enabled 欄位轉為 boolean', () => {
    const deps = {
      readConfig: () => ({ enabled: 1 }),
    };
    const config = readTtsConfig(deps);

    expect(typeof config.enabled).toBe('boolean');
    expect(config.enabled).toBe(true);
  });

  test('level 欄位轉為 number', () => {
    const deps = {
      readConfig: () => ({ level: '2' }),
    };
    const config = readTtsConfig(deps);

    expect(typeof config.level).toBe('number');
    expect(config.level).toBe(2);
  });
});

// ── 常數驗證 ──

describe('TTS_LEVELS 常數', () => {
  test('包含 SILENT、CRITICAL、PROGRESS、VERBOSE', () => {
    expect(TTS_LEVELS.SILENT).toBe(0);
    expect(TTS_LEVELS.CRITICAL).toBe(1);
    expect(TTS_LEVELS.PROGRESS).toBe(2);
    expect(TTS_LEVELS.VERBOSE).toBe(3);
  });
});

describe('LEVEL_EVENTS 常數', () => {
  test('level 1 包含關鍵事件', () => {
    expect(LEVEL_EVENTS[1]).toContain('error:fatal');
    expect(LEVEL_EVENTS[1]).toContain('workflow:complete');
    expect(LEVEL_EVENTS[1]).toContain('notification:ask');
  });

  test('level 2 包含進度事件', () => {
    expect(LEVEL_EVENTS[2]).toContain('agent:complete');
    expect(LEVEL_EVENTS[2]).toContain('stage:complete');
  });

  test('level 3 包含 session 事件', () => {
    expect(LEVEL_EVENTS[3]).toContain('session:start');
    expect(LEVEL_EVENTS[3]).toContain('session:compact');
  });
});
