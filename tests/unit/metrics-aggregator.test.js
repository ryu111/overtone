import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, existsSync, readFileSync, unlinkSync, renameSync } from 'fs';
import {
  readFlowEvents,
  aggregateHookMetrics,
  aggregateSkillMetrics,
  aggregateAgentMetrics,
  aggregateCommandMetrics,
  aggregateWorkflowMetrics,
  aggregateUserCorrections,
} from '/Users/sbu/.claude/scripts/lib/metrics-aggregator.js';

const EVENTS_PATH = '/tmp/nova-flow-events.jsonl';
const BACKUP_PATH = '/tmp/nova-flow-events.jsonl.test-backup';

/** 將事件陣列寫入 JSONL */
function writeEvents(events) {
  writeFileSync(EVENTS_PATH, events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
}

beforeEach(() => {
  // 備份現有檔案（若存在）
  if (existsSync(EVENTS_PATH)) {
    renameSync(EVENTS_PATH, BACKUP_PATH);
  }
});

afterEach(() => {
  // 清除測試寫入的檔案
  if (existsSync(EVENTS_PATH)) {
    unlinkSync(EVENTS_PATH);
  }
  // 恢復備份
  if (existsSync(BACKUP_PATH)) {
    renameSync(BACKUP_PATH, EVENTS_PATH);
  }
});

// ─── readFlowEvents ────────────────────────────────────────────────────────

describe('readFlowEvents', () => {
  test('檔案不存在時回傳空陣列', () => {
    const result = readFlowEvents();
    expect(result).toEqual([]);
  });

  test('正確解析 JSONL 格式', () => {
    const events = [
      { ts: 1000, type: 'PreToolUse', module: 'guards' },
      { ts: 2000, type: 'PostToolUse', module: 'flow-observer' },
    ];
    writeEvents(events);
    const result = readFlowEvents();
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('PreToolUse');
    expect(result[1].type).toBe('PostToolUse');
  });

  test('since 過濾：只回傳 ts >= since 的事件', () => {
    writeEvents([
      { ts: 1000, type: 'hook_event' },
      { ts: 2000, type: 'hook_event' },
      { ts: 3000, type: 'hook_event' },
    ]);
    const result = readFlowEvents(2000);
    expect(result).toHaveLength(2);
    expect(result.every(e => e.ts >= 2000)).toBe(true);
  });

  test('跳過 malformed JSON 行', () => {
    writeFileSync(EVENTS_PATH, '{"ts":1,"type":"ok"}\nNOT_JSON\n{"ts":2,"type":"ok2"}\n', 'utf8');
    const result = readFlowEvents();
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('ok');
    expect(result[1].type).toBe('ok2');
  });

  test('空檔案回傳空陣列', () => {
    writeFileSync(EVENTS_PATH, '', 'utf8');
    const result = readFlowEvents();
    expect(result).toEqual([]);
  });
});

// ─── aggregateHookMetrics ─────────────────────────────────────────────────

describe('aggregateHookMetrics', () => {
  test('按 module 統計觸發次數', () => {
    writeEvents([
      { ts: 1000, type: 'PreToolUse', module: 'guards' },
      { ts: 2000, type: 'PostToolUse', module: 'guards' },
      { ts: 3000, type: 'hook_event', module: 'flow-observer' },
    ]);
    const { metric_name, count, details } = aggregateHookMetrics();
    expect(metric_name).toBe('hook_metrics');
    expect(count).toBe(3);
    const guards = details.find(d => d.module === 'guards');
    expect(guards.triggers).toBe(2);
    const observer = details.find(d => d.module === 'flow-observer');
    expect(observer.triggers).toBe(1);
  });

  test('統計 block 次數', () => {
    writeEvents([
      { ts: 1000, type: 'PreToolUse', module: 'guards', decision: 'block' },
      { ts: 2000, type: 'PreToolUse', module: 'guards', decision: 'allow' },
    ]);
    const { details } = aggregateHookMetrics();
    const guards = details.find(d => d.module === 'guards');
    expect(guards.blocks).toBe(1);
  });

  test('統計 error 次數', () => {
    writeEvents([
      { ts: 1000, type: 'hook_event', module: 'context-injector', error: 'ENOENT' },
      { ts: 2000, type: 'hook_event', module: 'context-injector' },
    ]);
    const { details } = aggregateHookMetrics();
    const injector = details.find(d => d.module === 'context-injector');
    expect(injector.errors).toBe(1);
  });

  test('非 hook 事件不計入', () => {
    writeEvents([
      { ts: 1000, type: 'user_prompt', module: 'some-module' },
      { ts: 2000, type: 'session_start', module: 'some-module' },
    ]);
    const { count } = aggregateHookMetrics();
    expect(count).toBe(0);
  });

  test('空資料不 crash', () => {
    const { count, details } = aggregateHookMetrics();
    expect(count).toBe(0);
    expect(details).toEqual([]);
  });
});

// ─── aggregateSkillMetrics ────────────────────────────────────────────────

describe('aggregateSkillMetrics', () => {
  test('按 skill 統計消費次數', () => {
    writeEvents([
      { ts: 1000, type: 'agent_call', skill: 'nova-test' },
      { ts: 2000, type: 'agent_call', skill: 'nova-test' },
      { ts: 3000, type: 'agent_call', skill: 'commit-convention' },
    ]);
    const { metric_name, count, details } = aggregateSkillMetrics();
    expect(metric_name).toBe('skill_metrics');
    expect(count).toBe(3);
    const novaTest = details.find(d => d.skill === 'nova-test');
    expect(novaTest.count).toBe(2);
    const commitConv = details.find(d => d.skill === 'commit-convention');
    expect(commitConv.count).toBe(1);
  });

  test('沒有 skill 欄位的事件不計入', () => {
    writeEvents([
      { ts: 1000, type: 'PreToolUse', module: 'guards' },
    ]);
    const { count } = aggregateSkillMetrics();
    expect(count).toBe(0);
  });

  test('空資料不 crash', () => {
    const { count, details } = aggregateSkillMetrics();
    expect(count).toBe(0);
    expect(details).toEqual([]);
  });

  test('since 過濾正確', () => {
    writeEvents([
      { ts: 500,  type: 'agent_call', skill: 'old-skill' },
      { ts: 1500, type: 'agent_call', skill: 'new-skill' },
    ]);
    const { count, details } = aggregateSkillMetrics(1000);
    expect(count).toBe(1);
    expect(details[0].skill).toBe('new-skill');
  });
});

// ─── aggregateAgentMetrics ────────────────────────────────────────────────

describe('aggregateAgentMetrics', () => {
  test('按 agent_type 統計完成率', () => {
    writeEvents([
      { ts: 1000, type: 'agent_done', agent_type: 'executor', exitCode: 0 },
      { ts: 2000, type: 'agent_done', agent_type: 'executor', exitCode: 1 },
      { ts: 3000, type: 'agent_done', agent_type: 'executor' }, // 無 exitCode = 未完成
      { ts: 4000, type: 'agent_done', agent_type: 'reviewer', exitCode: 0 },
    ]);
    const { metric_name, count, details } = aggregateAgentMetrics();
    expect(metric_name).toBe('agent_metrics');
    expect(count).toBe(4);
    const executor = details.find(d => d.agent_type === 'executor');
    expect(executor.total).toBe(3);
    expect(executor.completed).toBe(2);
    expect(executor.completionRate).toBeCloseTo(2 / 3);
  });

  test('計算平均耗時', () => {
    writeEvents([
      { ts: 1000, type: 'agent_done', agent_type: 'executor', duration: 100 },
      { ts: 2000, type: 'agent_done', agent_type: 'executor', duration: 200 },
    ]);
    const { details } = aggregateAgentMetrics();
    const executor = details.find(d => d.agent_type === 'executor');
    expect(executor.avgDuration).toBe(150);
  });

  test('無 duration 資料時 avgDuration 為 null', () => {
    writeEvents([
      { ts: 1000, type: 'agent_done', agent_type: 'planner' },
    ]);
    const { details } = aggregateAgentMetrics();
    const planner = details.find(d => d.agent_type === 'planner');
    expect(planner.avgDuration).toBeNull();
  });

  test('空資料不 crash', () => {
    const { count, details } = aggregateAgentMetrics();
    expect(count).toBe(0);
    expect(details).toEqual([]);
  });

  test('回傳格式含 metric_name + count + details', () => {
    writeEvents([{ ts: 1000, type: 'agent_done', agent_type: 'executor' }]);
    const result = aggregateAgentMetrics();
    expect(result).toHaveProperty('metric_name', 'agent_metrics');
    expect(result).toHaveProperty('count');
    expect(result).toHaveProperty('details');
    expect(Array.isArray(result.details)).toBe(true);
  });
});

// ─── aggregateCommandMetrics ──────────────────────────────────────────────

describe('aggregateCommandMetrics', () => {
  test('按 command 統計觸發次數', () => {
    writeEvents([
      { ts: 1000, type: 'command_trigger', command: 'ask' },
      { ts: 2000, type: 'command_trigger', command: 'ask' },
      { ts: 3000, type: 'command_trigger', command: 'audit' },
    ]);
    const { metric_name, count, details } = aggregateCommandMetrics();
    expect(metric_name).toBe('command_metrics');
    expect(count).toBe(3);
    const ask = details.find(d => d.command === 'ask');
    expect(ask.count).toBe(2);
    const audit = details.find(d => d.command === 'audit');
    expect(audit.count).toBe(1);
  });

  test('沒有 command 欄位的事件不計入', () => {
    writeEvents([{ ts: 1000, type: 'PreToolUse', module: 'guards' }]);
    const { count } = aggregateCommandMetrics();
    expect(count).toBe(0);
  });

  test('空資料不 crash', () => {
    const { count, details } = aggregateCommandMetrics();
    expect(count).toBe(0);
    expect(details).toEqual([]);
  });
});

// ─── aggregateWorkflowMetrics ─────────────────────────────────────────────

describe('aggregateWorkflowMetrics', () => {
  test('統計 test 通過率', () => {
    writeEvents([
      { ts: 1000, type: 'test_run', exitCode: 0 },
      { ts: 2000, type: 'test_run', exitCode: 0 },
      { ts: 3000, type: 'test_run', exitCode: 1 },
    ]);
    const { metric_name, details } = aggregateWorkflowMetrics();
    expect(metric_name).toBe('workflow_metrics');
    const testMetric = details.find(d => d.metric === 'test_pass_rate');
    expect(testMetric.testTotal).toBe(3);
    expect(testMetric.testPassed).toBe(2);
    expect(testMetric.rate).toBeCloseTo(2 / 3);
  });

  test('無 test 事件時 test_pass_rate 為 null', () => {
    writeEvents([{ ts: 1000, type: 'hook_event', module: 'guards' }]);
    const { details } = aggregateWorkflowMetrics();
    const testMetric = details.find(d => d.metric === 'test_pass_rate');
    expect(testMetric.rate).toBeNull();
  });

  test('空資料不 crash', () => {
    const result = aggregateWorkflowMetrics();
    expect(result.metric_name).toBe('workflow_metrics');
    expect(Array.isArray(result.details)).toBe(true);
  });

  test('self-review 率：SubagentStop 後緊接著 Read/diff 工具', () => {
    writeEvents([
      { ts: 1000, type: 'SubagentStop' },
      { ts: 2000, type: 'PostToolUse', tool_name: 'Read' },
      { ts: 3000, type: 'SubagentStop' },
      { ts: 4000, type: 'PostToolUse', tool_name: 'Bash' }, // 不算 self-review
    ]);
    const { details } = aggregateWorkflowMetrics();
    const selfReview = details.find(d => d.metric === 'self_review_rate');
    expect(selfReview.agentCompleteCount).toBe(2);
    expect(selfReview.selfReviewCount).toBe(1);
    expect(selfReview.rate).toBe(0.5);
  });
});

// ─── aggregateUserCorrections ─────────────────────────────────────────────

describe('aggregateUserCorrections', () => {
  test('偵測含否定詞的 prompt', () => {
    writeEvents([
      { ts: 1000, type: 'UserPromptSubmit', prompt: '不是這個意思，重做' },
      { ts: 2000, type: 'UserPromptSubmit', prompt: '繼續做下去' },
      { ts: 3000, type: 'UserPromptSubmit', prompt: 'no that is wrong' },
    ]);
    const { metric_name, count, details } = aggregateUserCorrections();
    expect(metric_name).toBe('user_corrections');
    expect(count).toBe(2);
    const rateMetric = details[0];
    expect(rateMetric.promptTotal).toBe(3);
    expect(rateMetric.correctionCount).toBe(2);
    expect(rateMetric.rate).toBeCloseTo(2 / 3);
  });

  test('無 prompt 欄位的事件不計入', () => {
    writeEvents([{ ts: 1000, type: 'PreToolUse', module: 'guards' }]);
    const { count } = aggregateUserCorrections();
    expect(count).toBe(0);
  });

  test('空資料不 crash', () => {
    const result = aggregateUserCorrections();
    expect(result.metric_name).toBe('user_corrections');
    expect(result.count).toBe(0);
    const rateMetric = result.details[0];
    expect(rateMetric.rate).toBeNull();
  });

  test('since 過濾正確', () => {
    writeEvents([
      { ts: 500,  type: 'UserPromptSubmit', prompt: '不要這樣' },
      { ts: 1500, type: 'UserPromptSubmit', prompt: 'redo this' },
    ]);
    const { count } = aggregateUserCorrections(1000);
    expect(count).toBe(1);
  });

  test('回傳格式含 metric_name + count + details', () => {
    const result = aggregateUserCorrections();
    expect(result).toHaveProperty('metric_name');
    expect(result).toHaveProperty('count');
    expect(result).toHaveProperty('details');
    expect(Array.isArray(result.details)).toBe(true);
  });
});
