import { describe, test, expect } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
const { evaluate } = await import(join(homedir(), '.claude/hooks/scripts/notification/on-notification.js'));

describe('on-notification', () => {
  test('回傳完整通知格式', () => {
    const result = evaluate({
      title: 'Task Complete',
      message: 'Build succeeded',
    });

    expect(result).toEqual({
      sound: 'Glass',
      title: 'Task Complete',
      message: 'Build succeeded',
    });
  });

  test('預設 title 和 message', () => {
    const result = evaluate({});

    expect(result.sound).toBe('Glass');
    expect(result.title).toBe('Claude Code');
    expect(result.message).toBe('');
  });

  test('空 input', () => {
    const result = evaluate({});

    expect(result).toHaveProperty('sound');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('message');
  });
});
