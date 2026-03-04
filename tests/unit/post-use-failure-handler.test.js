'use strict';
/**
 * post-use-failure-handler.test.js — handlePostUseFailure 測試
 */

const { describe, it, expect } = require('bun:test');
const { handlePostUseFailure, CRITICAL_TOOLS } = require('../../plugins/overtone/scripts/lib/post-use-failure-handler');

describe('handlePostUseFailure', () => {
  it('Scenario 1: 無 sessionId 時回傳空 result', () => {
    const result = handlePostUseFailure({ tool_name: 'Task', error: 'some error' });
    expect(result).toEqual({ output: { result: '' } });
  });

  it('Scenario 2: is_interrupt=true 時回傳空 result（使用者手動中斷）', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Task',
      error: 'interrupted',
      is_interrupt: true,
    });
    expect(result).toEqual({ output: { result: '' } });
  });

  it('Scenario 3: Task 失敗 → 回傳 agent 委派失敗提示', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Task',
      error: 'subagent not found',
      is_interrupt: false,
    });
    expect(result.output.result).toContain('agent 委派失敗');
    expect(result.output.result).toContain('subagent_type');
  });

  it('Scenario 4: Write 失敗 → 回傳檔案操作失敗提示', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Write',
      error: 'permission denied',
      is_interrupt: false,
    });
    expect(result.output.result).toContain('檔案操作失敗');
    expect(result.output.result).toContain('寫入權限');
  });

  it('Scenario 5: Edit 失敗 → 回傳檔案操作失敗提示', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Edit',
      error: 'file not found',
      is_interrupt: false,
    });
    expect(result.output.result).toContain('檔案操作失敗');
  });

  it('Scenario 6: Bash 失敗 → 只記錄，回傳空 result', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Bash',
      error: 'command not found',
      is_interrupt: false,
    });
    expect(result).toEqual({ output: { result: '' } });
  });

  it('Scenario 7: 未知工具失敗 → 只記錄，回傳空 result', () => {
    const result = handlePostUseFailure({
      session_id: 'test-sess',
      tool_name: 'Grep',
      error: 'internal error',
      is_interrupt: false,
    });
    expect(result).toEqual({ output: { result: '' } });
  });
});

describe('CRITICAL_TOOLS', () => {
  it('包含 Task、Write、Edit', () => {
    expect(CRITICAL_TOOLS).toContain('Task');
    expect(CRITICAL_TOOLS).toContain('Write');
    expect(CRITICAL_TOOLS).toContain('Edit');
  });
});
