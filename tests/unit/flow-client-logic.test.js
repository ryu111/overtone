import { describe, test, expect } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';

const { VALID_TYPES, getEventMeta, getOrbitPath, splitFlows } = await import(join(homedir(), '.claude/scripts/flow/client-logic.js'));

// ── VALID_TYPES（2）──────────────────────────────

describe('VALID_TYPES', () => {
  test('長度 10', () => {
    expect(VALID_TYPES.length).toBe(10);
  });

  test('無重複', () => {
    expect(new Set(VALID_TYPES).size).toBe(VALID_TYPES.length);
  });
});

// ── getEventMeta（5）─────────────────────────────

describe('getEventMeta', () => {
  test('agent_dispatch 回傳 agent_type + model', () => {
    expect(getEventMeta({ type: 'agent_dispatch', agent_type: 'coder', model: 'sonnet' }))
      .toBe('coder (sonnet)');
  });

  test('agent_complete 回傳 agent_type + stop_reason', () => {
    expect(getEventMeta({ type: 'agent_complete', agent_type: 'coder', stop_reason: 'done' }))
      .toBe('coder — done');
  });

  test('session_start 回傳 model @ cwd', () => {
    expect(getEventMeta({ type: 'session_start', model: 'opus', cwd: '/tmp' }))
      .toBe('opus @ /tmp');
  });

  test('prompt_submit 回傳 prompt_preview', () => {
    expect(getEventMeta({ type: 'prompt_submit', prompt_preview: 'hello' }))
      .toBe('hello');
  });

  test('未知 type 回傳空字串', () => {
    expect(getEventMeta({ type: 'unknown_event' })).toBe('');
  });
});

// ── getOrbitPath（6）─────────────────────────────

describe('getOrbitPath', () => {
  test('diamond path 以 Z 閉合', () => {
    expect(getOrbitPath('diamond', 10, 2)).toMatch(/Z$/);
  });

  test('hexagon path 以 Z 閉合', () => {
    expect(getOrbitPath('hexagon', 10, 2)).toMatch(/Z$/);
  });

  test('roundrect path 以 Z 閉合', () => {
    expect(getOrbitPath('roundrect', 10, 2)).toMatch(/Z$/);
  });

  test('trapezoid path 以 Z 閉合', () => {
    expect(getOrbitPath('trapezoid', 10, 2)).toMatch(/Z$/);
  });

  test('pill path 以 Z 閉合', () => {
    expect(getOrbitPath('pill', 10, 2)).toMatch(/Z$/);
  });

  test('circle(default) path 使用 Arc 閉合', () => {
    const p = getOrbitPath('circle', 10, 2);
    expect(p).toMatch(/^M /);
    expect(p).toContain('A ');
  });
});

// ── splitFlows（5）───────────────────────────────

describe('splitFlows', () => {
  test('空陣列回傳 1 個 session flow', () => {
    const result = splitFlows([]);
    expect(result.length).toBe(1);
    expect(result[0].prompt).toBe('(session)');
  });

  test('無 prompt_submit 回傳整個 session', () => {
    const events = [{ type: 'session_start', ts: 1 }, { type: 'tool_use', ts: 2 }];
    const result = splitFlows(events);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ startIdx: 0, endIdx: 1, prompt: '(session)', ts: 1 });
  });

  test('單 prompt_submit 分割', () => {
    const events = [
      { type: 'session_start', ts: 1 },
      { type: 'prompt_submit', ts: 2, prompt_preview: 'hello' },
      { type: 'tool_use', ts: 3 },
    ];
    const result = splitFlows(events);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ startIdx: 1, endIdx: 2, prompt: 'hello', ts: 2 });
  });

  test('多 prompt_submit 分割為多個 flow', () => {
    const events = [
      { type: 'prompt_submit', ts: 1, prompt_preview: 'a' },
      { type: 'tool_use', ts: 2 },
      { type: 'prompt_submit', ts: 3, prompt_preview: 'b' },
      { type: 'tool_use', ts: 4 },
    ];
    const result = splitFlows(events);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({ startIdx: 0, endIdx: 1, prompt: 'a', ts: 1 });
    expect(result[1]).toEqual({ startIdx: 2, endIdx: 3, prompt: 'b', ts: 3 });
  });

  test('缺 prompt_preview 使用 fallback "..."', () => {
    const events = [{ type: 'prompt_submit', ts: 1 }];
    const result = splitFlows(events);
    expect(result[0].prompt).toBe('...');
  });
});
