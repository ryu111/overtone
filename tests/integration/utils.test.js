'use strict';
const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { atomicWrite } = require(join(SCRIPTS_LIB, 'utils'));
const { mkdirSync, rmSync, readFileSync, readdirSync } = require('fs');
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
