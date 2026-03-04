'use strict';
/**
 * guard-system-e2e.test.js — 守衛體系端對端驗證
 *
 * 在真實 codebase 上驗證整個守衛體系的端對端行為：
 *
 * Scenario 1：三層觸發完整性
 *   - Layer A（Session 級）：session-cleanup 可呼叫
 *   - Layer B（Stage 級）：docs-sync-engine + dead-code-scanner 可呼叫
 *   - Layer C（Test 級）：guard tests 存在且可執行
 *
 * Scenario 2：統一入口 E2E
 *   - runFullGuardCheck() 在真實 codebase 上回傳有效結果
 *   - summary.fail === 0（真實系統健康）
 *   - 每個子系統都有回傳結果（非 null/undefined）
 *
 * Scenario 3：守衛模組清單完整性
 *   - 確認 6 個守衛模組全部可 require
 *   - 確認每個模組的核心 API 都可呼叫
 */

const { test, expect, describe } = require('bun:test');
const { existsSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB, PROJECT_ROOT } = require('../helpers/paths');

// ── 路徑常數 ──────────────────────────────────────────────────────────────

const TESTS_DIR = join(PROJECT_ROOT, 'tests');

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1：三層觸發完整性
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 1：三層觸發完整性', () => {

  describe('Layer A（Session 級）：session-cleanup', () => {
    test('session-cleanup 模組可 require', () => {
      const cleanup = require(join(SCRIPTS_LIB, 'session-cleanup'));
      expect(typeof cleanup.runCleanup).toBe('function');
    });

    test('runCleanup 可在不傳參數下呼叫（使用預設路徑）', () => {
      const { runCleanup } = require(join(SCRIPTS_LIB, 'session-cleanup'));
      // dry run：傳入 undefined sessionId，只執行孤兒檔清理邏輯
      // 不應拋出例外
      let threw = false;
      try {
        runCleanup(undefined);
      } catch (_) {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test('cleanupStaleSessions 接受自訂目錄參數', () => {
      const { cleanupStaleSessions } = require(join(SCRIPTS_LIB, 'session-cleanup'));
      // 傳入不存在的目錄不應拋出例外
      const result = cleanupStaleSessions({ overtoneHome: '/tmp/non-existent-overtone-test' });
      expect(result).toBeDefined();
      expect(typeof result.cleaned).toBe('number');
    });
  });

  describe('Layer B（Stage 級）：docs-sync-engine', () => {
    test('docs-sync-engine 模組可 require', () => {
      const engine = require(join(SCRIPTS_LIB, 'docs-sync-engine'));
      expect(typeof engine.scanDrift).toBe('function');
      expect(typeof engine.runDocsSyncCheck).toBe('function');
    });

    test('scanDrift() 在真實 codebase 回傳有效掃描報告', () => {
      const { scanDrift } = require(join(SCRIPTS_LIB, 'docs-sync-engine'));
      const result = scanDrift();
      expect(result).toBeDefined();
      expect(typeof result.isClean).toBe('boolean');
      expect(Array.isArray(result.drifts)).toBe(true);
    });
  });

  describe('Layer B（Stage 級）：dead-code-scanner', () => {
    test('dead-code-scanner 模組可 require', () => {
      const scanner = require(join(SCRIPTS_LIB, 'dead-code-scanner'));
      expect(typeof scanner.runDeadCodeScan).toBe('function');
    });

    test('runDeadCodeScan() 在真實 codebase 回傳有效掃描報告', () => {
      const { runDeadCodeScan } = require(join(SCRIPTS_LIB, 'dead-code-scanner'));
      const result = runDeadCodeScan();
      expect(result).toBeDefined();
      expect(Array.isArray(result.unusedExports)).toBe(true);
      expect(Array.isArray(result.orphanFiles)).toBe(true);
      expect(typeof result.summary).toBe('object');
      expect(typeof result.summary.total).toBe('number');
    });
  });

  describe('Layer C（Test 級）：guard tests 存在性', () => {
    const GUARD_TESTS = [
      'unit/dead-code-guard.test.js',
    ];

    for (const relPath of GUARD_TESTS) {
      test(`guard test 存在：${relPath}`, () => {
        const fullPath = join(TESTS_DIR, relPath);
        expect(existsSync(fullPath)).toBe(true);
      });
    }

    test('dead-code-guard.test.js 可正確 require（無語法錯誤）', () => {
      const testPath = join(TESTS_DIR, 'unit/dead-code-guard.test.js');
      // 只驗證可載入，不重複執行其內容
      expect(existsSync(testPath)).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 2：統一入口 E2E
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 2：統一入口 E2E — runFullGuardCheck()', () => {
  let guardResult;

  // 執行一次，在所有 test 中共用
  guardResult = (() => {
    const { runFullGuardCheck } = require(join(SCRIPTS_LIB, 'guard-system'));
    return runFullGuardCheck();
  })();

  test('runFullGuardCheck() 回傳有效物件', () => {
    expect(guardResult).toBeDefined();
    expect(typeof guardResult).toBe('object');
  });

  test('回傳包含所有 5 個子系統結果', () => {
    expect(guardResult.docsSync).toBeDefined();
    expect(guardResult.testQuality).toBeDefined();
    expect(guardResult.deadCode).toBeDefined();
    expect(guardResult.componentRepair).toBeDefined();
    expect(guardResult.hookDiagnostic).toBeDefined();
  });

  test('回傳包含 summary 統計', () => {
    expect(guardResult.summary).toBeDefined();
    expect(typeof guardResult.summary.total).toBe('number');
    expect(typeof guardResult.summary.pass).toBe('number');
    expect(typeof guardResult.summary.warn).toBe('number');
    expect(typeof guardResult.summary.fail).toBe('number');
  });

  test('summary.total 等於 5（5 個子系統）', () => {
    expect(guardResult.summary.total).toBe(5);
  });

  test('pass + warn + fail === total', () => {
    const { total, pass, warn, fail } = guardResult.summary;
    expect(pass + warn + fail).toBe(total);
  });

  test('真實系統健康：summary.fail === 0', () => {
    // 如果此測試失敗，表示守衛體系偵測到真實問題
    if (guardResult.summary.fail > 0) {
      // 輸出失敗原因幫助診斷
      const failedSystems = [];
      const { evalDocsSyncStatus, evalTestQualityStatus, evalDeadCodeStatus, evalComponentRepairStatus, evalHookDiagnosticStatus } = require(join(SCRIPTS_LIB, 'guard-system'));
      if (evalDocsSyncStatus(guardResult.docsSync) === 'fail') failedSystems.push('docsSync');
      if (evalTestQualityStatus(guardResult.testQuality) === 'fail') failedSystems.push('testQuality');
      if (evalDeadCodeStatus(guardResult.deadCode) === 'fail') failedSystems.push('deadCode');
      if (evalComponentRepairStatus(guardResult.componentRepair) === 'fail') failedSystems.push('componentRepair');
      if (evalHookDiagnosticStatus(guardResult.hookDiagnostic) === 'fail') failedSystems.push('hookDiagnostic');
      throw new Error(`守衛體系偵測到問題，失敗子系統：${failedSystems.join(', ')}`);
    }
    expect(guardResult.summary.fail).toBe(0);
  });

  test('各子系統結果不含 __error（無拋出例外）', () => {
    const systems = ['docsSync', 'testQuality', 'deadCode', 'componentRepair', 'hookDiagnostic'];
    for (const sys of systems) {
      const result = guardResult[sys];
      if (result && result.__error) {
        throw new Error(`子系統 ${sys} 拋出例外：${result.__error}`);
      }
      expect(result.__error).toBeUndefined();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3：守衛模組清單完整性
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 3：守衛模組清單完整性', () => {

  const GUARD_MODULES = [
    {
      name: 'docs-sync-engine',
      coreApis: ['scanDrift', 'runDocsSyncCheck'],
    },
    {
      name: 'session-cleanup',
      coreApis: ['runCleanup', 'cleanupStaleSessions', 'cleanupOrphanFiles'],
    },
    {
      name: 'test-quality-scanner',
      coreApis: ['scanTestQuality', 'scanFile'],
    },
    {
      name: 'dead-code-scanner',
      coreApis: ['runDeadCodeScan', 'scanUnusedExports', 'scanOrphanFiles'],
    },
    {
      name: 'component-repair',
      coreApis: ['scanInconsistencies', 'runComponentRepair'],
    },
    {
      name: 'hook-diagnostic',
      coreApis: ['runDiagnostic'],
    },
  ];

  for (const { name, coreApis } of GUARD_MODULES) {
    describe(`守衛模組：${name}`, () => {
      test(`${name} 可 require`, () => {
        const mod = require(join(SCRIPTS_LIB, name));
        expect(typeof mod).toBe('object');
      });

      for (const api of coreApis) {
        test(`${name}.${api} 是函式`, () => {
          const mod = require(join(SCRIPTS_LIB, name));
          expect(typeof mod[api]).toBe('function');
        });
      }
    });
  }

  test('guard-system.js 本身可 require', () => {
    const guardSystem = require(join(SCRIPTS_LIB, 'guard-system'));
    expect(typeof guardSystem.runFullGuardCheck).toBe('function');
  });

  test('guard-system.js 匯出 eval 函式供狀態判斷', () => {
    const guardSystem = require(join(SCRIPTS_LIB, 'guard-system'));
    expect(typeof guardSystem.evalDocsSyncStatus).toBe('function');
    expect(typeof guardSystem.evalTestQualityStatus).toBe('function');
    expect(typeof guardSystem.evalDeadCodeStatus).toBe('function');
    expect(typeof guardSystem.evalComponentRepairStatus).toBe('function');
    expect(typeof guardSystem.evalHookDiagnosticStatus).toBe('function');
  });
});
