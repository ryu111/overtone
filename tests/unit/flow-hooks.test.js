import { describe, test, expect, beforeEach } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';

const { getEventsFilePath } = await import(join(homedir(), '.claude/scripts/flow/event-writer.js'));
const EVENTS_FILE = getEventsFilePath();

const { evaluate: evaluateStart } = await import(
  join(homedir(), '.claude/hooks/scripts/session/on-start-flow.js')
);
const { evaluate: evaluateAgent, parseAgentFrontmatter, parseExtraSkills } = await import(
  join(homedir(), '.claude/hooks/scripts/tool/pre-agent-flow.js')
);
const { evaluate: evaluateStop } = await import(
  join(homedir(), '.claude/hooks/scripts/session/on-stop-flow.js')
);
const { readRecentEvents } = await import(
  join(homedir(), '.claude/scripts/flow/event-writer.js')
);

describe('on-start-flow.js（SessionStart）', () => {
  beforeEach(() => {
    writeFileSync(EVENTS_FILE, '');
  });

  test('evaluate 回傳 { decision: "allow" }', () => {
    const result = evaluateStart({
      session_id: 'test-123',
      model: 'opus',
      cwd: '/tmp',
      source: 'cli',
    });
    expect(result).toEqual({ decision: 'allow' });
  });

  test('呼叫後 readRecentEvents 最後一筆 type === "session_start"', () => {
    evaluateStart({
      session_id: 'test-123',
      model: 'opus',
      cwd: '/tmp',
      source: 'cli',
    });
    const events = readRecentEvents();
    const last = events[events.length - 1];
    expect(last.type).toBe('session_start');
  });
});

describe('pre-agent-flow.js（PreToolUse Agent）', () => {
  beforeEach(() => {
    writeFileSync(EVENTS_FILE, '');
  });

  test('evaluate 回傳 { decision: "allow" }', () => {
    const result = evaluateAgent({
      tool_input: {
        subagent_type: 'executor',
        description: 'test',
        prompt: 'do something',
      },
    });
    expect(result).toEqual({ decision: 'allow' });
  });

  test('呼叫後 readRecentEvents 最後一筆 type === "agent_dispatch"', () => {
    evaluateAgent({
      tool_input: {
        subagent_type: 'executor',
        description: 'test',
        prompt: 'do something',
      },
    });
    const events = readRecentEvents();
    const last = events[events.length - 1];
    expect(last.type).toBe('agent_dispatch');
  });

  test('parseAgentFrontmatter("executor") 回傳 { model: "sonnet", skills: [...] }（skills 非空陣列）', () => {
    const result = parseAgentFrontmatter('executor');
    expect(result).not.toBeNull();
    expect(result.model).toBe('sonnet');
    expect(Array.isArray(result.skills)).toBe(true);
    expect(result.skills.length).toBeGreaterThan(0);
  });

  test('parseAgentFrontmatter("nonexistent") 回傳 null', () => {
    const result = parseAgentFrontmatter('nonexistent');
    expect(result).toBeNull();
  });

  test('parseExtraSkills 解析 [EXTRA_SKILLS: ...] 前綴', () => {
    expect(parseExtraSkills('[EXTRA_SKILLS: security-kb, database]\n請審查 PR'))
      .toEqual(['security-kb', 'database']);
  });

  test('parseExtraSkills 無前綴回傳空陣列', () => {
    expect(parseExtraSkills('普通 prompt')).toEqual([]);
  });

  test('parseExtraSkills null/undefined 回傳空陣列', () => {
    expect(parseExtraSkills(null)).toEqual([]);
    expect(parseExtraSkills(undefined)).toEqual([]);
  });

  test('EXTRA_SKILLS 與 frontmatter skills 合併去重', () => {
    writeFileSync(EVENTS_FILE, '');
    evaluateAgent({
      tool_input: {
        subagent_type: 'executor',
        description: 'test',
        prompt: '[EXTRA_SKILLS: security-kb, new-skill]\ndo something',
      },
    });
    const events = readRecentEvents();
    const dispatch = events.find(e => e.type === 'agent_dispatch');
    // executor 已有 security-kb，合併後不重複
    expect(dispatch.skills).toContain('security-kb');
    expect(dispatch.skills).toContain('new-skill');
    expect(dispatch.skills.filter(s => s === 'security-kb').length).toBe(1);
  });
});

describe('on-stop-flow.js（SubagentStop）', () => {
  beforeEach(() => {
    writeFileSync(EVENTS_FILE, '');
  });

  test('evaluate 回傳 { decision: "allow" }', () => {
    const result = evaluateStop({
      agent_type: 'executor',
      stop_reason: 'done',
    });
    expect(result).toEqual({ decision: 'allow' });
  });

  test('呼叫後 readRecentEvents 最後一筆 type === "agent_complete"', () => {
    evaluateStop({
      agent_type: 'executor',
      stop_reason: 'done',
    });
    const events = readRecentEvents();
    const last = events[events.length - 1];
    expect(last.type).toBe('agent_complete');
  });
});
