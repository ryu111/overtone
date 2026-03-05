'use strict';
/**
 * smoke.test.js — 系統級冒煙測試
 *
 * 驗證 Overtone 核心功能端對端可用性：
 *
 * Scenario 1：CLI 工具可執行性
 *   - health-check.js / validate-agents.js / evolution.js / queue.js / data.js 可正常執行
 *
 * Scenario 2：核心模組 require 成功
 *   - registry / state / timeline / paths / execution-queue 不拋錯
 *
 * Scenario 3：元件一致性
 *   - validate-agents 通過 / health-check 無 error
 */

const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { PROJECT_ROOT, PLUGIN_ROOT, SCRIPTS_LIB, SCRIPTS_DIR } = require('../helpers/paths');

const SPAWN_TIMEOUT = 30_000;

// ── 輔助函式 ────────────────────────────────────────────────────────────────

/**
 * 同步 spawn 子進程，回傳 { exitCode, stdout, stderr }
 */
function spawnSync(args, opts = {}) {
  const proc = Bun.spawnSync(args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, OVERTONE_NO_DASHBOARD: '1', OVERTONE_TEST: '1' },
    timeout: SPAWN_TIMEOUT,
    ...opts,
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1：CLI 工具可執行性
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 1：CLI 工具可執行性', () => {

  test('health-check.js 可執行（exit 0）', () => {
    const result = spawnSync(['bun', join(SCRIPTS_DIR, 'health-check.js')]);
    // health-check 只允許 exit 0（warnings 不阻擋）
    expect(result.exitCode).toBe(0);
  }, SPAWN_TIMEOUT);

  test('validate-agents.js 可執行（exit 0）', () => {
    const result = spawnSync(['bun', join(SCRIPTS_DIR, 'validate-agents.js')]);
    expect(result.exitCode).toBe(0);
  }, SPAWN_TIMEOUT);

  test('evolution.js --help 可執行（exit 0）', () => {
    const result = spawnSync(['bun', join(SCRIPTS_DIR, 'evolution.js'), '--help']);
    expect(result.exitCode).toBe(0);
  }, SPAWN_TIMEOUT);

  test('evolution.js status 可執行（exit 0）', () => {
    const result = spawnSync(['bun', join(SCRIPTS_DIR, 'evolution.js'), 'status']);
    expect(result.exitCode).toBe(0);
  }, SPAWN_TIMEOUT);

  test('queue.js list 可執行（exit 0 或 exit 1 代表空佇列）', () => {
    const result = spawnSync(['bun', join(SCRIPTS_DIR, 'queue.js'), 'list']);
    // exit 0 = 有佇列，exit 1 = 空佇列（兩者皆為正常狀態）
    expect([0, 1]).toContain(result.exitCode);
  }, SPAWN_TIMEOUT);

  test('data.js stats --global 可執行（exit 0）', () => {
    const result = spawnSync(['bun', join(SCRIPTS_DIR, 'data.js'), 'stats', '--global']);
    expect(result.exitCode).toBe(0);
  }, SPAWN_TIMEOUT);

});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 2：核心模組 require 成功
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 2：核心模組 require 成功', () => {

  const CORE_MODULES = [
    { name: 'registry', path: 'registry' },
    { name: 'state', path: 'state' },
    { name: 'timeline', path: 'timeline' },
    { name: 'paths', path: 'paths' },
    { name: 'execution-queue', path: 'execution-queue' },
  ];

  for (const { name, path } of CORE_MODULES) {
    test(`require('scripts/lib/${name}') 不拋錯`, () => {
      let mod;
      let threw = false;
      try {
        mod = require(join(SCRIPTS_LIB, path));
      } catch (err) {
        threw = true;
      }
      expect(threw).toBe(false);
      expect(mod).toBeDefined();
    });
  }

  test('registry 匯出 workflows（核心欄位存在）', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    expect(typeof registry.workflows).toBe('object');
    expect(Array.isArray(Object.keys(registry.workflows))).toBe(true);
  });

  test('state 匯出 readState / writeState（核心 API 存在）', () => {
    const state = require(join(SCRIPTS_LIB, 'state'));
    expect(typeof state.readState).toBe('function');
    expect(typeof state.writeState).toBe('function');
  });

  test('timeline 匯出 emit（核心 API 存在）', () => {
    const timeline = require(join(SCRIPTS_LIB, 'timeline'));
    expect(typeof timeline.emit).toBe('function');
  });

  test('paths 匯出 sessionDir（核心 API 存在）', () => {
    const paths = require(join(SCRIPTS_LIB, 'paths'));
    expect(typeof paths.sessionDir).toBe('function');
  });

  test('execution-queue 匯出 readQueue / writeQueue（核心 API 存在）', () => {
    const queue = require(join(SCRIPTS_LIB, 'execution-queue'));
    expect(typeof queue.readQueue).toBe('function');
    expect(typeof queue.writeQueue).toBe('function');
  });

});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3：元件一致性
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 3：元件一致性', () => {

  test('validate-agents.js 通過（exit 0，無驗證錯誤）', () => {
    const result = spawnSync(['bun', join(SCRIPTS_DIR, 'validate-agents.js')]);
    if (result.exitCode !== 0) {
      throw new Error(`validate-agents 驗證失敗：\n${result.stdout}\n${result.stderr}`);
    }
    expect(result.exitCode).toBe(0);
  }, SPAWN_TIMEOUT);

  test('health-check.js 無 error（warnings 允許）', () => {
    const result = spawnSync(['bun', join(SCRIPTS_DIR, 'health-check.js')]);
    if (result.exitCode !== 0) {
      throw new Error(`health-check 偵測到 error：\n${result.stdout}\n${result.stderr}`);
    }
    expect(result.exitCode).toBe(0);
  }, SPAWN_TIMEOUT);

});
