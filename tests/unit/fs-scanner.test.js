// tests/unit/fs-scanner.test.js
// BDD 骨架測試 — fs-scanner.js 行為規格
// 注意：受測模組尚未建立，此階段執行會 fail（預期行為）

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

// 受測模組（尚未建立）
const fsScanner = require(join(SCRIPTS_LIB, 'fs-scanner'));

describe('collectJsFiles', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'fs-scanner-test-'));
    fsScanner.clearCache();
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('Scenario 1: GIVEN 一個含有 .js 檔案的目錄 WHEN 呼叫 collectJsFiles THEN 回傳所有 .js 檔案的絕對路徑', () => {
    // GIVEN
    writeFileSync(join(sandbox, 'a.js'), 'const a = 1;');
    writeFileSync(join(sandbox, 'b.js'), 'const b = 2;');
    writeFileSync(join(sandbox, 'c.txt'), 'not js');

    // WHEN
    const result = fsScanner.collectJsFiles(sandbox);

    // THEN
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result.every(f => f.endsWith('.js'))).toBe(true);
    expect(result.every(f => f.startsWith('/'))).toBe(true);
  });

  it('Scenario 2: GIVEN 一個含有 node_modules 子目錄的目錄 WHEN 呼叫 collectJsFiles THEN 結果不包含 node_modules 內的檔案', () => {
    // GIVEN
    writeFileSync(join(sandbox, 'app.js'), 'const app = 1;');
    const nm = join(sandbox, 'node_modules', 'some-pkg');
    mkdirSync(nm, { recursive: true });
    writeFileSync(join(nm, 'index.js'), 'module.exports = {};');

    // WHEN
    const result = fsScanner.collectJsFiles(sandbox);

    // THEN
    expect(result.some(f => f.includes('node_modules'))).toBe(false);
    expect(result.some(f => f.endsWith('app.js'))).toBe(true);
  });

  it('Scenario 3: GIVEN 一個不存在的目錄 WHEN 呼叫 collectJsFiles THEN 回傳空陣列（不拋錯）', () => {
    // GIVEN
    const nonExistent = join(sandbox, 'does-not-exist');

    // WHEN / THEN
    expect(() => {
      const result = fsScanner.collectJsFiles(nonExistent);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    }).not.toThrow();
  });

  it('Scenario 4: GIVEN 巢狀子目錄結構 WHEN 呼叫 collectJsFiles THEN 遞迴收集所有層級的 .js 檔案', () => {
    // GIVEN
    writeFileSync(join(sandbox, 'root.js'), '');
    const sub = join(sandbox, 'sub');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'child.js'), '');
    const deep = join(sub, 'deep');
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, 'grandchild.js'), '');

    // WHEN
    const result = fsScanner.collectJsFiles(sandbox);

    // THEN
    expect(result.length).toBe(3);
    expect(result.some(f => f.endsWith('root.js'))).toBe(true);
    expect(result.some(f => f.endsWith('child.js'))).toBe(true);
    expect(result.some(f => f.endsWith('grandchild.js'))).toBe(true);
  });
});

describe('collectMdFiles', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'fs-scanner-md-test-'));
    fsScanner.clearCache();
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('Scenario 5: GIVEN 一個含有 .md 檔案的目錄 WHEN 呼叫 collectMdFiles THEN 回傳所有 .md 檔案的絕對路徑', () => {
    // GIVEN
    writeFileSync(join(sandbox, 'README.md'), '# README');
    writeFileSync(join(sandbox, 'NOTES.md'), '# Notes');
    writeFileSync(join(sandbox, 'script.js'), '// not md');

    // WHEN
    const result = fsScanner.collectMdFiles(sandbox);

    // THEN
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result.every(f => f.endsWith('.md'))).toBe(true);
    expect(result.every(f => f.startsWith('/'))).toBe(true);
  });

  it('Scenario 6: GIVEN node_modules 子目錄 WHEN 呼叫 collectMdFiles THEN 排除 node_modules 內的檔案', () => {
    // GIVEN
    writeFileSync(join(sandbox, 'docs.md'), '# docs');
    const nm = join(sandbox, 'node_modules', 'some-pkg');
    mkdirSync(nm, { recursive: true });
    writeFileSync(join(nm, 'README.md'), '# pkg readme');

    // WHEN
    const result = fsScanner.collectMdFiles(sandbox);

    // THEN
    expect(result.some(f => f.includes('node_modules'))).toBe(false);
    expect(result.some(f => f.endsWith('docs.md'))).toBe(true);
  });
});

describe('safeRead', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'fs-scanner-safe-test-'));
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('Scenario 7: GIVEN 一個存在的檔案 WHEN 呼叫 safeRead THEN 回傳檔案內容字串', () => {
    // GIVEN
    const filePath = join(sandbox, 'hello.txt');
    writeFileSync(filePath, 'hello world');

    // WHEN
    const result = fsScanner.safeRead(filePath);

    // THEN
    expect(typeof result).toBe('string');
    expect(result).toBe('hello world');
  });

  it('Scenario 8: GIVEN 一個不存在的路徑 WHEN 呼叫 safeRead THEN 回傳空字串', () => {
    // GIVEN
    const nonExistent = join(sandbox, 'no-such-file.txt');

    // WHEN
    const result = fsScanner.safeRead(nonExistent);

    // THEN
    expect(result).toBe('');
  });
});

describe('cache 機制', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'fs-scanner-cache-test-'));
    fsScanner.clearCache();
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('Scenario 9: GIVEN 同一目錄被呼叫兩次 collectJsFiles WHEN 第二次呼叫 THEN 回傳與第一次完全相同的陣列參考（toBe）', () => {
    // GIVEN
    writeFileSync(join(sandbox, 'a.js'), '');

    // WHEN
    const first = fsScanner.collectJsFiles(sandbox);
    const second = fsScanner.collectJsFiles(sandbox);

    // THEN — 相同陣列參考（cache 命中）
    expect(second).toBe(first);
  });

  it('Scenario 10: GIVEN cache 中有資料 WHEN 呼叫 clearCache 後再呼叫 collectJsFiles THEN 回傳新的陣列參考（不是快取的）', () => {
    // GIVEN
    writeFileSync(join(sandbox, 'a.js'), '');
    const first = fsScanner.collectJsFiles(sandbox);

    // WHEN
    fsScanner.clearCache();
    const second = fsScanner.collectJsFiles(sandbox);

    // THEN — 不同陣列參考（cache 已清除）
    expect(second).not.toBe(first);
    expect(second).toEqual(first); // 內容一樣但不是同一個物件
  });

  it('Scenario 11: GIVEN collectJsFiles 使用了 cache WHEN 在沙盒目錄新增檔案後再呼叫（不 clearCache）THEN 結果不含新檔案（cache 生效）', () => {
    // GIVEN — 先建立一個檔案並呼叫（建立 cache）
    writeFileSync(join(sandbox, 'original.js'), '');
    const cached = fsScanner.collectJsFiles(sandbox);
    expect(cached.length).toBe(1);

    // WHEN — 新增檔案，但不清除 cache
    writeFileSync(join(sandbox, 'new-file.js'), '');
    const result = fsScanner.collectJsFiles(sandbox);

    // THEN — 仍回傳 cache 的結果（不含新檔案）
    expect(result).toBe(cached);
    expect(result.length).toBe(1);
    expect(result.some(f => f.endsWith('new-file.js'))).toBe(false);
  });
});
