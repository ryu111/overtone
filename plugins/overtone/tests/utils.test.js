'use strict';
const { test, expect, describe } = require('bun:test');
const { atomicWrite, escapeHtml } = require('../scripts/lib/utils');
const { mkdirSync, rmSync, readFileSync, readdirSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const TEST_DIR = join(tmpdir(), `overtone-utils-test-${Date.now()}`);

describe('atomicWrite', () => {
  test('object 自動 JSON.stringify', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const filePath = join(TEST_DIR, 'test.json');
    atomicWrite(filePath, { key: 'value' });

    const content = readFileSync(filePath, 'utf8');
    expect(JSON.parse(content)).toEqual({ key: 'value' });
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('string 直接寫入', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const filePath = join(TEST_DIR, 'test.txt');
    atomicWrite(filePath, 'hello\n');

    expect(readFileSync(filePath, 'utf8')).toBe('hello\n');
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('不留殘餘 tmp 檔案', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    atomicWrite(join(TEST_DIR, 'a.json'), { a: 1 });
    atomicWrite(join(TEST_DIR, 'b.json'), { b: 2 });

    const files = readdirSync(TEST_DIR);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('自動建立不存在的目錄', () => {
    const deepPath = join(TEST_DIR, 'deep', 'nested', 'file.json');
    atomicWrite(deepPath, { nested: true });

    expect(JSON.parse(readFileSync(deepPath, 'utf8'))).toEqual({ nested: true });
    rmSync(TEST_DIR, { recursive: true, force: true });
  });
});

describe('escapeHtml', () => {
  test('轉義 HTML 特殊字元', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  test('轉義 & 符號', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  test('轉義單引號', () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  test('非字串回傳空字串', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(123)).toBe('');
  });

  test('正常字串不變', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});
