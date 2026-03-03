'use strict';
/**
 * guard-system.test.js — 守衛體系整合入口單元測試
 *
 * 測試 guard-system.js 的核心行為：
 *
 * Feature 1: evalDocsSyncStatus — docsSync 結果狀態判斷
 * Feature 2: evalTestQualityStatus — testQuality 結果狀態判斷
 * Feature 3: evalDeadCodeStatus — deadCode 結果狀態判斷
 * Feature 4: evalComponentRepairStatus — componentRepair 結果狀態判斷
 * Feature 5: evalHookDiagnosticStatus — hookDiagnostic 結果狀態判斷
 * Feature 6: runFullGuardCheck — summary 彙總邏輯
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const GUARD_SYSTEM = join(SCRIPTS_LIB, 'guard-system.js');

const {
  evalDocsSyncStatus,
  evalTestQualityStatus,
  evalDeadCodeStatus,
  evalComponentRepairStatus,
  evalHookDiagnosticStatus,
  runFullGuardCheck,
} = require(GUARD_SYSTEM);

// ─────────────────────────────────────────────────────────────────────────────
// Feature 1: evalDocsSyncStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature 1: evalDocsSyncStatus', () => {

  test('Scenario 1-1: null 回傳 fail', () => {
    expect(evalDocsSyncStatus(null)).toBe('fail');
  });

  test('Scenario 1-2: __error 欄位回傳 fail', () => {
    expect(evalDocsSyncStatus({ __error: 'some error' })).toBe('fail');
  });

  test('Scenario 1-3: errors 非空回傳 warn', () => {
    expect(evalDocsSyncStatus({ errors: ['err1'] })).toBe('warn');
  });

  test('Scenario 1-4: errors 空陣列回傳 pass', () => {
    expect(evalDocsSyncStatus({ errors: [] })).toBe('pass');
  });

  test('Scenario 1-5: 無 errors 欄位回傳 pass', () => {
    expect(evalDocsSyncStatus({ wasClean: true })).toBe('pass');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Feature 2: evalTestQualityStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature 2: evalTestQualityStatus', () => {

  test('Scenario 2-1: null 回傳 fail', () => {
    expect(evalTestQualityStatus(null)).toBe('fail');
  });

  test('Scenario 2-2: __error 欄位回傳 fail', () => {
    expect(evalTestQualityStatus({ __error: 'scan error' })).toBe('fail');
  });

  test('Scenario 2-3: summary 不存在回傳 warn', () => {
    expect(evalTestQualityStatus({ issues: [] })).toBe('warn');
  });

  test('Scenario 2-4: summary.total > 0 回傳 warn', () => {
    expect(evalTestQualityStatus({ summary: { total: 3 } })).toBe('warn');
  });

  test('Scenario 2-5: summary.total === 0 回傳 pass', () => {
    expect(evalTestQualityStatus({ summary: { total: 0 } })).toBe('pass');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Feature 3: evalDeadCodeStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature 3: evalDeadCodeStatus', () => {

  test('Scenario 3-1: null 回傳 fail', () => {
    expect(evalDeadCodeStatus(null)).toBe('fail');
  });

  test('Scenario 3-2: __error 欄位回傳 fail', () => {
    expect(evalDeadCodeStatus({ __error: 'scan error' })).toBe('fail');
  });

  test('Scenario 3-3: summary 不存在回傳 warn', () => {
    expect(evalDeadCodeStatus({ unusedExports: [] })).toBe('warn');
  });

  test('Scenario 3-4: summary.total > 0 回傳 warn', () => {
    expect(evalDeadCodeStatus({ summary: { total: 5 } })).toBe('warn');
  });

  test('Scenario 3-5: summary.total === 0 回傳 pass', () => {
    expect(evalDeadCodeStatus({ summary: { total: 0 } })).toBe('pass');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Feature 4: evalComponentRepairStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature 4: evalComponentRepairStatus', () => {

  test('Scenario 4-1: null 回傳 fail', () => {
    expect(evalComponentRepairStatus(null)).toBe('fail');
  });

  test('Scenario 4-2: __error 欄位回傳 fail', () => {
    expect(evalComponentRepairStatus({ __error: 'repair error' })).toBe('fail');
  });

  test('Scenario 4-3: scan.summary 不存在回傳 warn', () => {
    expect(evalComponentRepairStatus({ scan: {} })).toBe('warn');
  });

  test('Scenario 4-4: repair.errors 非空回傳 fail（修復失敗比掃描到問題更嚴重）', () => {
    expect(evalComponentRepairStatus({
      scan: { summary: { total: 0 } },
      repair: { errors: ['fix failed'] },
    })).toBe('fail');
  });

  test('Scenario 4-5: scan.summary.total > 0 回傳 warn', () => {
    expect(evalComponentRepairStatus({
      scan: { summary: { total: 2 } },
    })).toBe('warn');
  });

  test('Scenario 4-6: scan.summary.total === 0 且無 repair.errors 回傳 pass', () => {
    expect(evalComponentRepairStatus({
      scan: { summary: { total: 0 } },
      repair: { errors: [] },
    })).toBe('pass');
  });

  test('Scenario 4-7: scan 欄位缺失回傳 warn', () => {
    expect(evalComponentRepairStatus({})).toBe('warn');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Feature 5: evalHookDiagnosticStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature 5: evalHookDiagnosticStatus', () => {

  test('Scenario 5-1: null 回傳 fail', () => {
    expect(evalHookDiagnosticStatus(null)).toBe('fail');
  });

  test('Scenario 5-2: __error 欄位回傳 fail', () => {
    expect(evalHookDiagnosticStatus({ __error: 'diag error' })).toBe('fail');
  });

  test('Scenario 5-3: summary 不存在回傳 warn', () => {
    expect(evalHookDiagnosticStatus({ checks: [] })).toBe('warn');
  });

  test('Scenario 5-4: summary.fail > 0 回傳 fail', () => {
    expect(evalHookDiagnosticStatus({ summary: { fail: 1, warn: 0 } })).toBe('fail');
  });

  test('Scenario 5-5: summary.fail === 0 且 warn > 0 回傳 warn', () => {
    expect(evalHookDiagnosticStatus({ summary: { fail: 0, warn: 2 } })).toBe('warn');
  });

  test('Scenario 5-6: summary.fail === 0 且 warn === 0 回傳 pass', () => {
    expect(evalHookDiagnosticStatus({ summary: { fail: 0, warn: 0 } })).toBe('pass');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Feature 6: runFullGuardCheck — summary 彙總邏輯
// ─────────────────────────────────────────────────────────────────────────────

describe('Feature 6: runFullGuardCheck — 結構驗證', () => {

  test('Scenario 6-1: 回傳物件包含所有子系統 key', () => {
    const result = runFullGuardCheck();
    expect(result).toHaveProperty('docsSync');
    expect(result).toHaveProperty('testQuality');
    expect(result).toHaveProperty('deadCode');
    expect(result).toHaveProperty('componentRepair');
    expect(result).toHaveProperty('hookDiagnostic');
    expect(result).toHaveProperty('summary');
  });

  test('Scenario 6-2: summary 包含正確欄位', () => {
    const result = runFullGuardCheck();
    expect(typeof result.summary.total).toBe('number');
    expect(typeof result.summary.pass).toBe('number');
    expect(typeof result.summary.warn).toBe('number');
    expect(typeof result.summary.fail).toBe('number');
  });

  test('Scenario 6-3: summary.total 等於子系統數量（5）', () => {
    const result = runFullGuardCheck();
    expect(result.summary.total).toBe(5);
  });

  test('Scenario 6-4: summary.pass + warn + fail 等於 total', () => {
    const result = runFullGuardCheck();
    const { total, pass, warn, fail } = result.summary;
    expect(pass + warn + fail).toBe(total);
  });

  test('Scenario 6-5: 所有 pass 值非負', () => {
    const result = runFullGuardCheck();
    expect(result.summary.pass).toBeGreaterThanOrEqual(0);
    expect(result.summary.warn).toBeGreaterThanOrEqual(0);
    expect(result.summary.fail).toBeGreaterThanOrEqual(0);
  });

});
