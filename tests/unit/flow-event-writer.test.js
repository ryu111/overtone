import { describe, test, expect, beforeEach } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import { writeFileSync, existsSync } from 'fs';

const { writeFlowEvent, readRecentEvents, getEventsFilePath } = await import(
  join(homedir(), '.claude/scripts/flow/event-writer.js')
);

const EVENTS_FILE = getEventsFilePath();

function clearEventsFile() {
  if (existsSync(EVENTS_FILE)) {
    writeFileSync(EVENTS_FILE, '');
  }
}

describe('flow-event-writer', () => {
  beforeEach(() => {
    clearEventsFile();
  });

  test('writeFlowEvent 寫入後 readRecentEvents 能讀回', () => {
    writeFlowEvent({ type: 'test', payload: 'hello' });
    const events = readRecentEvents();
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('test');
    expect(events[0].payload).toBe('hello');
  });

  test('writeFlowEvent 自動補 ts 欄位（ISO string 格式）', () => {
    writeFlowEvent({ type: 'ts-check' });
    const events = readRecentEvents();
    expect(events.length).toBe(1);
    const ts = events[0].ts;
    expect(typeof ts).toBe('string');
    // ISO 8601 格式驗證
    expect(() => new Date(ts).toISOString()).not.toThrow();
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  test('readRecentEvents limit 參數：寫 5 條只讀 3 條', () => {
    for (let i = 0; i < 5; i++) {
      writeFlowEvent({ type: 'item', index: i });
    }
    const events = readRecentEvents(3);
    expect(events.length).toBe(3);
    // 回傳最後 3 條（index 2、3、4）
    expect(events[0].index).toBe(2);
    expect(events[1].index).toBe(3);
    expect(events[2].index).toBe(4);
  });

  test('readRecentEvents 空檔案回傳 []', () => {
    // beforeEach 已清空，直接讀取
    const events = readRecentEvents();
    expect(events).toEqual([]);
  });

  test('writeFlowEvent 保留所有傳入欄位', () => {
    const input = {
      type: 'full-check',
      agent: 'executor',
      taskId: 'abc-123',
      metadata: { step: 1, done: false },
    };
    const result = writeFlowEvent(input);
    expect(result).not.toBeNull();
    expect(result.type).toBe('full-check');
    expect(result.agent).toBe('executor');
    expect(result.taskId).toBe('abc-123');
    expect(result.metadata).toEqual({ step: 1, done: false });
    // ts 被補入
    expect(typeof result.ts).toBe('string');

    // 從檔案讀回也要一致
    const events = readRecentEvents();
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('full-check');
    expect(events[0].agent).toBe('executor');
    expect(events[0].taskId).toBe('abc-123');
    expect(events[0].metadata).toEqual({ step: 1, done: false });
  });
});
