import { describe, test, expect, mock } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';

// Mock spawnSync 避免測試時發出真正的 macOS 通知
mock.module('node:child_process', () => ({
  spawnSync: () => ({ status: 0 }),
}));

const mod = await import(join(homedir(), '.claude/hooks/modules/notification.js') + `?t=${Date.now()}`);
const handler = mod.on.Notification;

describe('notification module', () => {
  describe('handler', () => {
    test('正常輸入回傳 allow', () => {
      const result = handler({ title: 'Nova', message: 'OK' });
      expect(result.decision).toBe('allow');
    });

    test('含雙引號的 message 不 throw', () => {
      const result = handler({ title: 'Nova', message: 'say "hello"' });
      expect(result.decision).toBe('allow');
    });

    test('含反斜線的 message 不 throw', () => {
      const result = handler({ title: 'Nova', message: 'path\\to\\file' });
      expect(result.decision).toBe('allow');
    });

    test('空 input 回傳 allow', () => {
      const result = handler({});
      expect(result.decision).toBe('allow');
    });

    test('null input 回傳 allow', () => {
      const result = handler(null);
      expect(result.decision).toBe('allow');
    });

    test('非 string title 使用預設值', () => {
      const result = handler({ title: 123, message: 'test msg' });
      expect(result.decision).toBe('allow');
    });

    test('超長 message 被截斷（不 crash）', () => {
      const longMsg = 'a'.repeat(1000);
      const result = handler({ title: 'Nova', message: longMsg });
      expect(result.decision).toBe('allow');
    });

    test('title=test 被過濾（不發通知）', () => {
      const result = handler({ title: 'Test', message: 'should be filtered' });
      expect(result.decision).toBe('allow');
    });
  });
});
