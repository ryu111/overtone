'use strict';
/**
 * agent-stop-handler.test.js
 *
 * 測試 agent-stop-handler.js 的 handleAgentStop 基本功能：
 *   - 無 sessionId → 靜默退出
 *   - agentName 不在 stages 清單 → 靜默退出
 *   - 無 workflow state → 靜默退出
 *   - 模組可正常 require（無 side effect）
 */

const { describe, test, expect } = require('bun:test');
const { handleAgentStop } = require('../../plugins/overtone/scripts/lib/agent-stop-handler');

// ── 模組介面 ──────────────────────────────────────────────────────────────

describe('agent-stop-handler 模組介面', () => {
  test('可正常 require，匯出 handleAgentStop 函數', () => {
    expect(typeof handleAgentStop).toBe('function');
  });
});

// ── handleAgentStop 邊界情況 ─────────────────────────────────────────────

describe('handleAgentStop 邊界情況', () => {
  test('無 sessionId → 回傳 { output: { result: "" } }', () => {
    const result = handleAgentStop({ agent_type: 'developer', last_assistant_message: '' }, null);
    expect(result).toEqual({ output: { result: '' } });
  });

  test('sessionId 為空字串 → 回傳 { output: { result: "" } }', () => {
    const result = handleAgentStop({ agent_type: 'developer', last_assistant_message: '' }, '');
    expect(result).toEqual({ output: { result: '' } });
  });

  test('agentName 不在 stages 清單中 → 回傳 { output: { result: "" } }', () => {
    // "unknown-agent" 不對應任何已知 stage
    const result = handleAgentStop(
      { agent_type: 'unknown-agent', last_assistant_message: 'some output' },
      'fake-session-id'
    );
    expect(result).toEqual({ output: { result: '' } });
  });

  test('agentName 為空字串 → 回傳 { output: { result: "" } }', () => {
    const result = handleAgentStop({ agent_type: '', last_assistant_message: '' }, 'fake-session-id');
    expect(result).toEqual({ output: { result: '' } });
  });

  test('回傳值有 output 欄位且可 JSON 序列化', () => {
    const result = handleAgentStop({ agent_type: '', last_assistant_message: '' }, null);
    expect(() => JSON.stringify(result)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(result));
    expect(typeof parsed.output).toBe('object');
  });
});
