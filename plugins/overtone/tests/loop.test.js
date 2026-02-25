'use strict';
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const TEST_SESSION = `test_loop_${Date.now()}`;
const SESSION_DIR = join(homedir(), '.overtone', 'sessions', TEST_SESSION);

const loop = require('../scripts/lib/loop');
const paths = require('../scripts/lib/paths');

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

  test('有 checkbox 的 tasks.md 正確計數', () => {
    const tasksDir = join(SESSION_DIR, 'openspec', 'changes');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'tasks.md'), [
      '# Tasks',
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
    const tasksDir = join(SESSION_DIR, 'openspec', 'changes');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'tasks.md'), '- [x] Done\n- [X] Also done\n');

    const result = loop.readTasksStatus(SESSION_DIR);
    expect(result.allChecked).toBe(true);
  });

  test('無 checkbox 的純文字回傳 null', () => {
    const tasksDir = join(SESSION_DIR, 'openspec', 'changes');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'tasks.md'), '# Just prose\nNo checkboxes here.\n');

    expect(loop.readTasksStatus(SESSION_DIR)).toBeNull();
  });
});
