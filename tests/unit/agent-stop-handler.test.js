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
const { handleAgentStop, _parseQueueTable } = require('../../plugins/overtone/scripts/lib/agent-stop-handler');

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

// ── _parseQueueTable 佇列表格解析 ──────────────────────────────────────────

describe('_parseQueueTable 佇列表格解析', () => {
  test('解析標準 PM 輸出的佇列表格', () => {
    const output = `
## HANDOFF

**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
| 1 | claudecode-env-filter | single | session-spawner 加入過濾 |
| 2 | pm-queue-auto-write | quick | agent-stop-handler 整合 |
| 3 | telegram-run-command | quick | Telegram /run 命令 |

Some other text after.
`;
    const items = _parseQueueTable(output);
    expect(items).toEqual([
      { name: 'claudecode-env-filter', workflow: 'single' },
      { name: 'pm-queue-auto-write', workflow: 'quick' },
      { name: 'telegram-run-command', workflow: 'quick' },
    ]);
  });

  test('無佇列表格 → 回傳空陣列', () => {
    const output = '## HANDOFF\n\nSome analysis without queue table.';
    expect(_parseQueueTable(output)).toEqual([]);
  });

  test('佇列表格為空（只有表頭）→ 回傳空陣列', () => {
    const output = `
**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
`;
    expect(_parseQueueTable(output)).toEqual([]);
  });

  test('單項佇列', () => {
    const output = `
**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
| 1 | fix-bug | single | 修 bug |
`;
    const items = _parseQueueTable(output);
    expect(items).toEqual([{ name: 'fix-bug', workflow: 'single' }]);
  });

  test('佇列表格後有其他內容不影響解析', () => {
    const output = `
**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
| 1 | task-a | standard | 任務 A |

### Open Questions
1. Some question
`;
    const items = _parseQueueTable(output);
    expect(items).toEqual([{ name: 'task-a', workflow: 'standard' }]);
  });
});
