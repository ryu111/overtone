'use strict';
/**
 * fail-retry-path.test.js — BDD F5：fail-retry 完整路徑 E2E 測試
 *
 * 驗證 TEST FAIL → DEBUG → DEV → TEST PASS 的 retry 路徑：
 *   - TEST FAIL 第一次：failCount 遞增並提示 DEBUGGER
 *   - retry 路徑中 debugger 完成：hook 正常執行，failCount 不遞增
 *   - retry 路徑中 developer 完成：hook 正常執行，failCount 不遞增
 *   - TEST 修復後 PASS：TEST completed，failCount 保留歷史（不歸零）
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runOnStart, runInitWorkflow, runPreTask, runSubagentStop } = require('../helpers/hook-runner');

const paths    = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));

// 跨 describe 共用的唯一 sessionId
const SESSION_ID = `e2e-fail-retry-${Date.now()}`;

afterAll(() => {
  rmSync(paths.sessionDir(SESSION_ID), { recursive: true, force: true });
});

// ── 前置：建立 quick workflow 並完成 DEV + 啟動 TEST ──
beforeAll(() => {
  runOnStart(SESSION_ID);
  runInitWorkflow('quick', SESSION_ID);

  // DEV PASS
  runPreTask(SESSION_ID, { description: '委派 developer 實作功能' });
  runSubagentStop(SESSION_ID, 'ot:developer', 'VERDICT: pass 開發完成');

  // 委派並行組並只啟動 TEST（REVIEW 不啟動，避免並行干擾）
  // 直接設定 TEST 為 active
  stateLib.updateStateAtomic(SESSION_ID, (s) => {
    s.stages['REVIEW'].status = 'completed';
    s.stages['REVIEW'].result = 'pass';
    s.stages['TEST'].status = 'active';
    s.currentStage = 'TEST';
    return s;
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F5 Scenario 1：TEST FAIL 第一次 — failCount 遞增並提示 DEBUGGER
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F5：TEST FAIL 第一次 — failCount 遞增並提示 DEBUGGER', () => {
  let result;

  beforeAll(() => {
    // tester 報告失敗
    result = runSubagentStop(SESSION_ID, 'ot:tester', '3 tests failed with assertion errors');
  });

  test('result 含 ❌', () => {
    expect(result.parsed?.result).toContain('❌');
  });

  test('workflow.json 中 failCount 為 1', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.failCount).toBe(1);
  });

  test('result 含 DEBUGGER（不分大小寫）', () => {
    expect(result.parsed?.result.toUpperCase()).toContain('DEBUGGER');
  });

  test('timeline.jsonl 包含 stage:retry 事件', () => {
    const events = timeline.query(SESSION_ID, { type: 'stage:retry' });
    expect(events.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F5 Scenario 2：retry 路徑 — debugger 完成分析（不追蹤額外 stage）
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F5：retry 路徑 — debugger 完成分析（不追蹤額外 stage）', () => {
  let result;

  beforeAll(() => {
    // debugger 完成分析（不屬於原始 workflow stages）
    result = runSubagentStop(SESSION_ID, 'ot:debugger', 'VERDICT: pass 根因分析完成，已找到問題所在');
  });

  test('hook 正常執行（exit code 0）', () => {
    expect(result.exitCode).toBe(0);
  });

  test('result 不為 null', () => {
    expect(result.parsed).not.toBeNull();
  });

  test('failCount 仍為 1（debugger 不屬於原始 workflow stages，不記計數）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.failCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F5 Scenario 3：retry 路徑 — developer 完成修復（不追蹤額外 stage）
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F5：retry 路徑 — developer 完成修復（不追蹤額外 stage）', () => {
  let result;

  beforeAll(() => {
    // developer 完成修復（retry 路徑，不屬於原始 workflow stages 的 DEV）
    // 注意：DEV 已 completed，所以這個 on-stop 對應不到 active stage，hook 會跳過
    // 但 hook 仍應正常執行（exit code 0）
    result = runSubagentStop(SESSION_ID, 'ot:developer', 'VERDICT: pass 修復完成');
  });

  test('hook 正常執行（exit code 0）', () => {
    expect(result.exitCode).toBe(0);
  });

  test('failCount 仍為 1', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.failCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F5 Scenario 4：TEST 修復後 PASS — failCount 保留歷史但 TEST 進入 completed
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F5：TEST 修復後 PASS — failCount 保留歷史', () => {
  let result;

  beforeAll(() => {
    // 重新將 TEST 設為 active（模擬 retry 後再次委派）
    stateLib.updateStateAtomic(SESSION_ID, (s) => {
      s.stages['TEST'].status = 'active';
      return s;
    });

    // tester 這次通過
    result = runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass 所有測試通過，修復有效');
  });

  test('TEST.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].status).toBe('completed');
  });

  test('result 含 ✅', () => {
    expect(result.parsed?.result).toContain('✅');
  });

  test('failCount 仍為 1（歷史保留，不歸零）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.failCount).toBe(1);
  });
});
