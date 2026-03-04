'use strict';
/**
 * session-end-handler.test.js
 *
 * 測試 session-end-handler.js 的 handleSessionEnd 基本功能：
 *   - 無 sessionId → 靜默退出
 *   - 模組可正常 require（無 side effect）
 *   - 回傳格式符合規格
 */

const { describe, test, expect } = require('bun:test');
const { handleSessionEnd } = require('../../plugins/overtone/scripts/lib/session-end-handler');

// ── 模組介面 ──────────────────────────────────────────────────────────────

describe('session-end-handler 模組介面', () => {
  test('可正常 require，匯出 handleSessionEnd 函數', () => {
    expect(typeof handleSessionEnd).toBe('function');
  });
});

// ── handleSessionEnd 邊界情況 ────────────────────────────────────────────

describe('handleSessionEnd 邊界情況', () => {
  test('無 sessionId → 回傳 { output: { result: "" } }', () => {
    const result = handleSessionEnd({ reason: 'other' }, null);
    expect(result).toEqual({ output: { result: '' } });
  });

  test('sessionId 為空字串 → 回傳 { output: { result: "" } }', () => {
    const result = handleSessionEnd({ reason: 'other' }, '');
    expect(result).toEqual({ output: { result: '' } });
  });

  test('回傳值有 output.result 欄位（無 sessionId 情況）', () => {
    const result = handleSessionEnd({}, null);
    expect(typeof result.output).toBe('object');
    expect(result.output.result).toBe('');
  });

  test('回傳值可 JSON 序列化', () => {
    const result = handleSessionEnd({ reason: 'clear' }, null);
    expect(() => JSON.stringify(result)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(result));
    expect(typeof parsed.output).toBe('object');
    expect(typeof parsed.output.result).toBe('string');
  });
});
