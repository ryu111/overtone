import { describe, test, expect } from 'bun:test';
import { parseEtime } from '../../../../.claude/hooks/modules/watchdog.js';

describe('parseEtime — ps etime 格式解析', () => {
  test('MM:SS → 分鐘數', () => {
    expect(parseEtime('05:30')).toBe(5);
    expect(parseEtime('00:45')).toBe(0);
    expect(parseEtime('59:59')).toBe(59);
  });

  test('HH:MM:SS → 分鐘數', () => {
    expect(parseEtime('01:30:00')).toBe(90);
    expect(parseEtime('10:15:30')).toBe(615);
    expect(parseEtime('00:05:00')).toBe(5);
  });

  test('DD-HH:MM:SS → 分鐘數', () => {
    expect(parseEtime('1-00:00:00')).toBe(1440);  // 1 天
    expect(parseEtime('2-12:30:00')).toBe(3630);   // 2天12小時30分
  });

  test('空值或異常 → 0', () => {
    expect(parseEtime('')).toBe(0);
    expect(parseEtime('abc')).toBe(0);
  });
});

describe('殭屍偵測邏輯', () => {
  const ZOMBIE_PATTERNS = [
    { pattern: /bun\s+test/, maxMinutes: 10 },
    { pattern: /wrapup\.js/, maxMinutes: 30 },
  ];

  function isZombie(command, minutes, cpuPct) {
    for (const { pattern, maxMinutes } of ZOMBIE_PATTERNS) {
      if (pattern.test(command) && minutes > maxMinutes && cpuPct > 50) {
        return true;
      }
    }
    return false;
  }

  test('bun test 跑 5 分鐘 99% CPU → 不是殭屍（未超 10 分鐘）', () => {
    expect(isZombie('bun test ./tests/foo.test.js', 5, 99)).toBe(false);
  });

  test('bun test 跑 15 分鐘 99% CPU → 是殭屍', () => {
    expect(isZombie('bun test ./tests/foo.test.js', 15, 99)).toBe(true);
  });

  test('bun test 跑 15 分鐘但 CPU 低 → 不是殭屍（可能在等 I/O）', () => {
    expect(isZombie('bun test ./tests/foo.test.js', 15, 2)).toBe(false);
  });

  test('wrapup.js 跑 20 分鐘 → 不是殭屍（閾值 30 分鐘）', () => {
    expect(isZombie('bun wrapup.js A', 20, 80)).toBe(false);
  });

  test('wrapup.js 跑 45 分鐘 → 是殭屍', () => {
    expect(isZombie('bun wrapup.js A', 45, 80)).toBe(true);
  });

  test('正常 claude 進程 → 不是殭屍', () => {
    expect(isZombie('claude -c', 600, 15)).toBe(false);
  });

  test('nova-server → 不是殭屍', () => {
    expect(isZombie('nova-server server.js', 10000, 5)).toBe(false);
  });
});
