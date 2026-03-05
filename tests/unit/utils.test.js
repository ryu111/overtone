'use strict';
/**
 * utils.test.js — atomicWrite 和 formatSize 的單元測試
 *
 * 注意：clamp 函式已由 tests/unit/clamp.test.js 完整覆蓋，此檔不重複。
 */
const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { atomicWrite, formatSize } = require('../../plugins/overtone/scripts/lib/utils');

let tmpDir;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-test-'));
});
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('atomicWrite', () => {
  test('寫入字串 → 讀回相同內容', () => {
    const file = path.join(tmpDir, 'string.txt');
    atomicWrite(file, 'hello world');
    expect(fs.readFileSync(file, 'utf8')).toBe('hello world');
  });

  test('寫入物件 → JSON stringify 後加換行', () => {
    const file = path.join(tmpDir, 'obj.json');
    atomicWrite(file, { key: 'value', num: 42 });
    const content = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.key).toBe('value');
    expect(parsed.num).toBe(42);
    expect(content.endsWith('\n')).toBe(true);
  });

  test('目標目錄不存在時自動建立', () => {
    const file = path.join(tmpDir, 'nested/deep/dir/data.json');
    atomicWrite(file, { created: true });
    expect(fs.existsSync(file)).toBe(true);
  });

  test('覆寫已存在的檔案', () => {
    const file = path.join(tmpDir, 'overwrite.txt');
    atomicWrite(file, 'first');
    atomicWrite(file, 'second');
    expect(fs.readFileSync(file, 'utf8')).toBe('second');
  });

  test('不留下 .tmp 暫存檔', () => {
    const file = path.join(tmpDir, 'notmp.txt');
    atomicWrite(file, 'content');
    const dir = path.dirname(file);
    const tmpFiles = fs.readdirSync(dir).filter(f => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);
  });

  test('連續呼叫計數器遞增（不互相覆蓋）', () => {
    // 兩次快速呼叫最終都要成功寫入（後者覆蓋前者），無殘留 .tmp
    const file = path.join(tmpDir, 'counter.txt');
    atomicWrite(file, 'a');
    atomicWrite(file, 'b');
    expect(fs.readFileSync(file, 'utf8')).toBe('b');
  });

  test('空字串也能正常寫入', () => {
    const file = path.join(tmpDir, 'empty.txt');
    atomicWrite(file, '');
    expect(fs.readFileSync(file, 'utf8')).toBe('');
  });

  test('空物件寫入後可解析', () => {
    const file = path.join(tmpDir, 'empty-obj.json');
    atomicWrite(file, {});
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({});
  });
});

describe('formatSize', () => {
  describe('null / undefined → --', () => {
    test('null → --', () => {
      expect(formatSize(null)).toBe('--');
    });

    test('undefined → --', () => {
      expect(formatSize(undefined)).toBe('--');
    });
  });

  describe('>= 1MB', () => {
    test('1000000 → 1.0MB', () => {
      expect(formatSize(1_000_000)).toBe('1.0MB');
    });

    test('6500000 → 6.5MB', () => {
      expect(formatSize(6_500_000)).toBe('6.5MB');
    });

    test('10000000 → 10.0MB', () => {
      expect(formatSize(10_000_000)).toBe('10.0MB');
    });
  });

  describe('>= 1KB 且 < 1MB', () => {
    test('1000 → 1KB', () => {
      expect(formatSize(1_000)).toBe('1KB');
    });

    test('800000 → 800KB', () => {
      expect(formatSize(800_000)).toBe('800KB');
    });

    test('999999 → 1000KB', () => {
      // Math.round(999999 / 1000) = 1000
      expect(formatSize(999_999)).toBe('1000KB');
    });

    test('1500 → 2KB（四捨五入）', () => {
      expect(formatSize(1_500)).toBe('2KB');
    });
  });

  describe('< 1KB', () => {
    test('0 → 0B', () => {
      expect(formatSize(0)).toBe('0B');
    });

    test('500 → 500B', () => {
      expect(formatSize(500)).toBe('500B');
    });

    test('999 → 999B', () => {
      expect(formatSize(999)).toBe('999B');
    });
  });
});
