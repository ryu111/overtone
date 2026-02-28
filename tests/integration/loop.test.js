'use strict';
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const TEST_SESSION = `test_loop_${Date.now()}`;
const SESSION_DIR = join(homedir(), '.overtone', 'sessions', TEST_SESSION);

const loop = require(join(SCRIPTS_LIB, 'loop'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

beforeEach(() => {
  mkdirSync(SESSION_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(SESSION_DIR, { recursive: true, force: true });
});

describe('readLoop', () => {
  test('不存在時自動初始化', () => {
    const result = loop.readLoop(TEST_SESSION);
    expect(result.iteration).toBe(0);
    expect(result.stopped).toBe(false);
    expect(result.consecutiveErrors).toBe(0);
    expect(result.startedAt).toBeDefined();
  });

  test('初始化後檔案可讀回', () => {
    loop.readLoop(TEST_SESSION); // 觸發初始化
    const result = loop.readLoop(TEST_SESSION); // 讀回
    expect(result.iteration).toBe(0);
  });
});

describe('writeLoop', () => {
  test('寫入後可正確讀回', () => {
    const data = { iteration: 5, stopped: false, consecutiveErrors: 1, startedAt: new Date().toISOString() };
    loop.writeLoop(TEST_SESSION, data);
    const result = loop.readLoop(TEST_SESSION);
    expect(result.iteration).toBe(5);
    expect(result.consecutiveErrors).toBe(1);
  });

  test('不留殘餘 tmp 檔案', () => {
    loop.writeLoop(TEST_SESSION, { iteration: 0, stopped: false });
    const files = require('fs').readdirSync(SESSION_DIR);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);
  });
});

describe('exitLoop', () => {
  test('設定 stopped 並記錄原因', () => {
    const loopData = { iteration: 3, stopped: false, consecutiveErrors: 0, startedAt: new Date().toISOString() };
    loop.writeLoop(TEST_SESSION, loopData);
    loop.exitLoop(TEST_SESSION, loopData, '工作流完成');

    expect(loopData.stopped).toBe(true);
    expect(loopData.stopReason).toBe('工作流完成');
    expect(loopData.stoppedAt).toBeDefined();

    const saved = loop.readLoop(TEST_SESSION);
    expect(saved.stopped).toBe(true);
  });
});

describe('readTasksStatus', () => {
  test('不存在的路徑回傳 null', () => {
    expect(loop.readTasksStatus('/nonexistent/path')).toBeNull();
  });

  test('null 輸入回傳 null', () => {
    expect(loop.readTasksStatus(null)).toBeNull();
  });

  test('無 in-progress feature 時回傳 null', () => {
    // SESSION_DIR 下沒有 specs/features/in-progress/ → null
    expect(loop.readTasksStatus(SESSION_DIR)).toBeNull();
  });

  test('有 in-progress feature 且有 checkbox 的 tasks.md 正確計數', () => {
    const featureDir = join(SESSION_DIR, 'specs', 'features', 'in-progress', 'my-feature');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'tasks.md'), [
      '---',
      'feature: my-feature',
      'status: in-progress',
      'workflow: standard',
      'created: 2026-02-26T00:00:00Z',
      '---',
      '',
      '## Tasks',
      '',
      '- [x] 完成設計',
      '- [x] 寫測試',
      '- [ ] 實作功能',
      '- [ ] 驗收',
    ].join('\n'));

    const result = loop.readTasksStatus(SESSION_DIR);
    expect(result).not.toBeNull();
    expect(result.total).toBe(4);
    expect(result.checked).toBe(2);
    expect(result.allChecked).toBe(false);
  });

  test('全部完成回傳 allChecked = true', () => {
    const featureDir = join(SESSION_DIR, 'specs', 'features', 'in-progress', 'my-feature');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'tasks.md'), [
      '---',
      'feature: my-feature',
      'status: in-progress',
      'workflow: standard',
      'created: 2026-02-26T00:00:00Z',
      '---',
      '',
      '## Tasks',
      '',
      '- [x] Done',
      '- [x] Also done',
    ].join('\n'));

    const result = loop.readTasksStatus(SESSION_DIR);
    expect(result).not.toBeNull();
    expect(result.allChecked).toBe(true);
  });

  test('無 checkbox 的純文字回傳 null', () => {
    const featureDir = join(SESSION_DIR, 'specs', 'features', 'in-progress', 'my-feature');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'tasks.md'), [
      '---',
      'feature: my-feature',
      'status: in-progress',
      'workflow: standard',
      'created: 2026-02-26T00:00:00Z',
      '---',
      '',
      '## Tasks',
      '',
      '# Just prose',
      'No checkboxes here.',
    ].join('\n'));

    expect(loop.readTasksStatus(SESSION_DIR)).toBeNull();
  });

  test('featureName 參數直接定位正確的 feature', () => {
    // 建立兩個 in-progress feature（模擬多 session 並行）
    const featureA = join(SESSION_DIR, 'specs', 'features', 'in-progress', 'aaa-first');
    const featureB = join(SESSION_DIR, 'specs', 'features', 'in-progress', 'zzz-second');
    mkdirSync(featureA, { recursive: true });
    mkdirSync(featureB, { recursive: true });

    // aaa-first：0/2 未完成
    writeFileSync(join(featureA, 'tasks.md'), [
      '---', 'feature: aaa-first', 'status: in-progress', 'workflow: standard', 'created: 2026-02-26T00:00:00Z', '---',
      '', '## Tasks', '', '- [ ] task1', '- [ ] task2',
    ].join('\n'));

    // zzz-second：2/2 全完成
    writeFileSync(join(featureB, 'tasks.md'), [
      '---', 'feature: zzz-second', 'status: in-progress', 'workflow: quick', 'created: 2026-02-26T00:00:00Z', '---',
      '', '## Tasks', '', '- [x] task1', '- [x] task2',
    ].join('\n'));

    // 不帶 featureName → 取字母序第一個（aaa-first）→ allChecked: false
    const withoutName = loop.readTasksStatus(SESSION_DIR);
    expect(withoutName).not.toBeNull();
    expect(withoutName.allChecked).toBe(false);

    // 帶 featureName='zzz-second' → 直接定位 → allChecked: true
    const withName = loop.readTasksStatus(SESSION_DIR, 'zzz-second');
    expect(withName).not.toBeNull();
    expect(withName.allChecked).toBe(true);
  });

  test('featureName 指向不存在的 feature 回傳 null', () => {
    expect(loop.readTasksStatus(SESSION_DIR, 'nonexistent-feature')).toBeNull();
  });

  test('featureName 指向無 tasks.md 的 feature 回傳 null', () => {
    const featureDir = join(SESSION_DIR, 'specs', 'features', 'in-progress', 'no-tasks');
    mkdirSync(featureDir, { recursive: true });
    // 只有 proposal.md，沒有 tasks.md
    writeFileSync(join(featureDir, 'proposal.md'), '# Proposal\nSome content');

    expect(loop.readTasksStatus(SESSION_DIR, 'no-tasks')).toBeNull();
  });
});
