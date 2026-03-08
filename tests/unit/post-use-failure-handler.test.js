'use strict';
/**
 * post-use-failure-handler.test.js — handlePostUseFailure 測試
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { handlePostUseFailure, CRITICAL_TOOLS } = require(join(SCRIPTS_LIB, 'post-use-failure-handler'));

describe('handlePostUseFailure', () => {
  it('Scenario 1: 無 sessionId 時回傳空 output', () => {
    const result = handlePostUseFailure({ tool_name: 'Task', error: 'some error' });
    expect(result).toEqual({ output: {} });
  });

  it('Scenario 2: is_interrupt=true 時回傳空 output（使用者手動中斷）', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Task',
      error: 'interrupted',
      is_interrupt: true,
    });
    expect(result).toEqual({ output: {} });
  });

  it('Scenario 3: Task 失敗 → 回傳 agent 委派失敗提示', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Task',
      error: 'subagent not found',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('agent 委派失敗');
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('subagent_type');
  });

  it('Scenario 4: Write 失敗 → 回傳檔案操作失敗提示', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Write',
      error: 'permission denied',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('檔案操作失敗');
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('寫入權限');
  });

  it('Scenario 5: Edit 失敗 → 回傳檔案操作失敗提示', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Edit',
      error: 'file not found',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('檔案操作失敗');
  });

  it('Scenario 6: Bash 失敗 → 只記錄，回傳空 output', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Bash',
      error: 'command not found',
      is_interrupt: false,
    });
    expect(result).toEqual({ output: {} });
  });

  it('Scenario 7: 未知工具失敗 → 只記錄，回傳空 output', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Grep',
      error: 'internal error',
      is_interrupt: false,
    });
    expect(result).toEqual({ output: {} });
  });
});

describe('CRITICAL_TOOLS', () => {
  it('包含 Task、Write、Edit', () => {
    expect(CRITICAL_TOOLS).toContain('Task');
    expect(CRITICAL_TOOLS).toContain('Write');
    expect(CRITICAL_TOOLS).toContain('Edit');
  });

  it('共有 3 個重大工具（Task、Write、Edit）', () => {
    expect(CRITICAL_TOOLS).toHaveLength(3);
  });
});

describe('handlePostUseFailure — 進階行為', () => {
  it('Scenario 8: error 超過 120 字元時截斷至 120 字元', () => {
    const longError = 'E'.repeat(200);
    const result = handlePostUseFailure({
      session_id: 'test-sess-trunc',
      tool_name: 'Task',
      error: longError,
      is_interrupt: false,
    });
    // 回傳訊息中的錯誤摘要應截斷（120 字）
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('E'.repeat(120));
    expect(result.output.hookSpecificOutput?.additionalContext).not.toContain('E'.repeat(200));
  });

  it('Scenario 9: error 為空字串時 Task 失敗仍回傳提示訊息', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-empty-err',
      tool_name: 'Task',
      error: '',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('agent 委派失敗');
  });

  it('Scenario 10: Bash 失敗也記錄（Instinct emit）— 回傳空 output', () => {
    // Bash 屬於 shouldEmitTimeline 但不屬於 CRITICAL_TOOLS → 不注入 systemMessage
    const result = handlePostUseFailure({
      session_id: 'test-sess-bash-fail',
      tool_name: 'Bash',
      error: 'command not found: xyz',
      is_interrupt: false,
    });
    // 重要：回傳空 output（不注入訊息，無 hookSpecificOutput）
    expect(result.output.hookSpecificOutput?.additionalContext).toBeUndefined();
    expect(result.output.hookSpecificOutput).toBeUndefined();
  });

  it('Scenario 11: tool_name 為空字串時不注入（非 CRITICAL_TOOLS）', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-notool',
      tool_name: '',
      error: 'some error',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput?.additionalContext).toBeUndefined();
  });

  it('Scenario 12: Write 失敗訊息包含路徑相關提示', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-write',
      tool_name: 'Write',
      error: 'EACCES: permission denied, open "/protected/file.txt"',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('Write');
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('路徑');
  });

  it('Scenario 13: Edit 失敗訊息包含磁碟空間提示', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-edit',
      tool_name: 'Edit',
      error: 'ENOSPC: no space left on device',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('磁碟空間');
  });

  it('Scenario 14: Task 失敗訊息包含重試建議', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-retry',
      tool_name: 'Task',
      error: 'timeout waiting for subagent',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('重試');
  });

  it('Scenario 15: is_interrupt 未傳（undefined）時視為 false，正常處理', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-no-interrupt',
      tool_name: 'Task',
      error: 'unknown failure',
      // is_interrupt 未傳
    });
    // 應正常處理（不因缺少 is_interrupt 而靜默退出）
    expect(result.output.hookSpecificOutput?.additionalContext).toContain('agent 委派失敗');
  });

  it('Scenario 16: 重複相同工具失敗時仍正常處理（無爆炸）', () => {
    const input = {
      session_id: 'test-sess-repeat',
      tool_name: 'Task',
      error: 'repeated failure',
      is_interrupt: false,
    };
    expect(() => {
      handlePostUseFailure(input);
      handlePostUseFailure(input);
    }).not.toThrow();
  });

  it('Scenario 17: 非重大工具（Grep）不產生 systemMessage', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-grep',
      tool_name: 'Grep',
      error: 'pattern too complex',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput?.additionalContext).toBeUndefined();
    expect(result.output.hookSpecificOutput).toBeUndefined();
  });

  it('Scenario 18: Read 工具失敗 → 回傳空 output', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-read',
      tool_name: 'Read',
      error: 'file not found',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput?.additionalContext).toBeUndefined();
  });
});

describe('handlePostUseFailure — hookSpecificOutput 格式驗證', () => {
  // HO-1: CRITICAL_TOOLS 失敗有 hookSpecificOutput
  it('HO-1: CRITICAL_TOOLS 失敗時 output 含 hookSpecificOutput', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-ho1',
      tool_name: 'Task',
      error: 'subagent failed',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput).toBeDefined();
  });

  // HO-2: hookEventName 為 'PostToolUseFailure'
  it('HO-2: hookSpecificOutput.hookEventName 為 PostToolUseFailure', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-ho2',
      tool_name: 'Write',
      error: 'permission denied',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput.hookEventName).toBe('PostToolUseFailure');
  });

  // HO-3: additionalContext 是非空字串（包含錯誤提示訊息）
  it('HO-3: hookSpecificOutput.additionalContext 為非空字串', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-ho3',
      tool_name: 'Edit',
      error: 'file locked',
      is_interrupt: false,
    });
    expect(typeof result.output.hookSpecificOutput.additionalContext).toBe('string');
    expect(result.output.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
  });

  // HO-4: 非 CRITICAL_TOOLS 不含 hookSpecificOutput
  it('HO-4: 非 CRITICAL_TOOLS（Bash）不含 hookSpecificOutput', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-ho4',
      tool_name: 'Bash',
      error: 'command not found',
      is_interrupt: false,
    });
    expect(result.output.hookSpecificOutput).toBeUndefined();
  });

  // HO-5: is_interrupt=true 不含 hookSpecificOutput
  it('HO-5: is_interrupt=true 路徑不含 hookSpecificOutput', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess-ho5',
      tool_name: 'Task',
      error: 'interrupted',
      is_interrupt: true,
    });
    expect(result.output.hookSpecificOutput).toBeUndefined();
  });
});
