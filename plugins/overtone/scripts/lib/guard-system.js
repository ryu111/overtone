'use strict';
/**
 * guard-system.js — 守衛體系統一整合入口
 *
 * 彙整所有守衛子系統的掃描結果，提供統一的健康檢查入口。
 *
 * 核心 API：
 *   runFullGuardCheck(options?) — 執行完整守衛體系健康檢查
 *
 * 回傳格式：
 * {
 *   docsSync:        { wasClean, drifts, fixed, skipped, errors },
 *   testQuality:     { issues, summary },
 *   deadCode:        { unusedExports, orphanFiles, summary },
 *   componentRepair: { scan, repair, summary },
 *   hookDiagnostic:  { checks, summary },
 *   summary:         { total, pass, warn, fail }
 * }
 *
 * 三層觸發架構：
 *   Layer A（Session 級）— session-cleanup：session 結束時清理過期 session
 *   Layer B（Stage 級）  — docs-sync-engine + dead-code-scanner：每個 stage 完成後
 *   Layer C（Test 級）   — guard tests：每次 bun test 執行時
 */

const { join } = require('path');

// ── 子系統載入 ────────────────────────────────────────────────────────────

// 靜態 require（讓 dead-code-scanner 可偵測到模組引用）
const docsSync        = require('./docs-sync-engine');
const testQuality     = require('./test-quality-scanner');
const deadCode        = require('./dead-code-scanner');
const componentRepair = require('./component-repair');
const hookDiagnostic  = require('./hook-diagnostic');

function loadModules() {
  return { docsSync, testQuality, deadCode, componentRepair, hookDiagnostic };
}

// ── 子系統狀態判斷 ────────────────────────────────────────────────────────

/**
 * 判斷 docsSync 結果的健康狀態
 * @param {object} result
 * @returns {'pass'|'warn'|'fail'}
 */
function evalDocsSyncStatus(result) {
  if (!result || result.__error) return 'fail';
  if (result.errors && result.errors.length > 0) return 'warn';
  return 'pass';
}

/**
 * 判斷 testQuality 結果的健康狀態
 * @param {object} result
 * @returns {'pass'|'warn'|'fail'}
 */
function evalTestQualityStatus(result) {
  if (!result || result.__error) return 'fail';
  if (!result.summary) return 'warn';
  if (result.summary.total > 0) return 'warn';
  return 'pass';
}

/**
 * 判斷 deadCode 結果的健康狀態
 * @param {object} result
 * @returns {'pass'|'warn'|'fail'}
 */
function evalDeadCodeStatus(result) {
  if (!result || result.__error) return 'fail';
  if (!result.summary) return 'warn';
  if (result.summary.total > 0) return 'warn';
  return 'pass';
}

/**
 * 判斷 componentRepair 結果的健康狀態
 * @param {object} result
 * @returns {'pass'|'warn'|'fail'}
 */
function evalComponentRepairStatus(result) {
  if (!result || result.__error) return 'fail';
  if (!result.scan || !result.scan.summary) return 'warn';
  // repair.errors 表示修復失敗（較嚴重）
  if (result.repair && result.repair.errors && result.repair.errors.length > 0) return 'fail';
  if (result.scan.summary.total > 0) return 'warn';
  return 'pass';
}

/**
 * 判斷 hookDiagnostic 結果的健康狀態
 * @param {object} result
 * @returns {'pass'|'warn'|'fail'}
 */
function evalHookDiagnosticStatus(result) {
  if (!result || result.__error) return 'fail';
  if (!result.summary) return 'warn';
  if (result.summary.fail > 0) return 'fail';
  if (result.summary.warn > 0) return 'warn';
  return 'pass';
}

// ── 主入口 ────────────────────────────────────────────────────────────────

/**
 * 執行完整守衛體系健康檢查
 *
 * @param {object} [options] - 選用參數（主要供測試注入）
 * @param {object} [options.paths] - 路徑注入（傳遞給子系統）
 * @returns {{
 *   docsSync:        object,
 *   testQuality:     object,
 *   deadCode:        object,
 *   componentRepair: object,
 *   hookDiagnostic:  object,
 *   summary:         { total: number, pass: number, warn: number, fail: number }
 * }}
 */
function runFullGuardCheck(options = {}) {
  const modules = loadModules();
  const results = {};

  // ── docsSync（Layer B：Stage 級）──────────────────────────────────────
  try {
    results.docsSync = modules.docsSync.runDocsSyncCheck();
  } catch (err) {
    results.docsSync = { __error: err.message };
  }

  // ── testQuality（Layer C：Test 級）───────────────────────────────────
  try {
    results.testQuality = modules.testQuality.scanTestQuality(
      options.paths && options.paths.testsDir ? options.paths.testsDir : undefined
    );
  } catch (err) {
    results.testQuality = { __error: err.message };
  }

  // ── deadCode（Layer B：Stage 級）─────────────────────────────────────
  try {
    const deadCodeOpts = {};
    if (options.paths && options.paths.libDir) deadCodeOpts.libDir = options.paths.libDir;
    if (options.paths && options.paths.searchDirs) deadCodeOpts.searchDirs = options.paths.searchDirs;
    results.deadCode = modules.deadCode.runDeadCodeScan(deadCodeOpts);
  } catch (err) {
    results.deadCode = { __error: err.message };
  }

  // ── componentRepair（Layer B：Stage 級）──────────────────────────────
  try {
    const repairPaths = (options.paths && options.paths.componentRepair) ? options.paths.componentRepair : {};
    results.componentRepair = modules.componentRepair.runComponentRepair(repairPaths);
  } catch (err) {
    results.componentRepair = { __error: err.message };
  }

  // ── hookDiagnostic（Layer B：Stage 級）───────────────────────────────
  try {
    const diagOpts = {};
    if (options.paths && options.paths.hookDiagnostic) diagOpts.paths = options.paths.hookDiagnostic;
    results.hookDiagnostic = modules.hookDiagnostic.runDiagnostic(diagOpts);
  } catch (err) {
    results.hookDiagnostic = { __error: err.message };
  }

  // ── 彙總 summary ──────────────────────────────────────────────────────
  const statuses = [
    evalDocsSyncStatus(results.docsSync),
    evalTestQualityStatus(results.testQuality),
    evalDeadCodeStatus(results.deadCode),
    evalComponentRepairStatus(results.componentRepair),
    evalHookDiagnosticStatus(results.hookDiagnostic),
  ];

  const summary = {
    total: statuses.length,
    pass:  statuses.filter(s => s === 'pass').length,
    warn:  statuses.filter(s => s === 'warn').length,
    fail:  statuses.filter(s => s === 'fail').length,
  };

  return {
    docsSync:        results.docsSync,
    testQuality:     results.testQuality,
    deadCode:        results.deadCode,
    componentRepair: results.componentRepair,
    hookDiagnostic:  results.hookDiagnostic,
    summary,
  };
}

// ── 匯出 ──────────────────────────────────────────────────────────────────

module.exports = {
  runFullGuardCheck,
  // 以下為測試用 export
  evalDocsSyncStatus,
  evalTestQualityStatus,
  evalDeadCodeStatus,
  evalComponentRepairStatus,
  evalHookDiagnosticStatus,
};
