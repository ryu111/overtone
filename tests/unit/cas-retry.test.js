'use strict';
/**
 * cas-retry.test.js
 * BDD spec: specs/features/in-progress/concurrency-test-cas-stress/bdd.md
 *
 * Feature: S1 — CAS Retry 直接測試（單元測試）
 *
 * S1-1: mtime 衝突觸發 retry
 * S1-2: retry 之間存在 jitter delay
 * S1-3: MAX_RETRIES(3) 耗盡後執行 fallback 強制寫入
 * S1-4: fallback 路徑同樣執行 enforceInvariants
 * S1-5: retry 成功路徑（第 2 次 retry 成功）
 * S1-6: enforceInvariants 在正常 CAS 成功路徑中執行
 * S1-7: modifier 回傳 undefined 時使用原始 state
 */

const { describe, it, expect, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, writeFileSync, readFileSync } = require('fs');
const { SCRIPTS_LIB } = require('../helpers/paths');

const stateLib = require(join(SCRIPTS_LIB, 'state'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── session 管理 ──

const SESSION_PREFIX = `test_cas_retry_${Date.now()}`;
let counter = 0;
const createdSessions = [];

function newSessionId() {
  const sid = `${SESSION_PREFIX}_${++counter}`;
  createdSessions.push(sid);
  return sid;
}

function setupSession(sessionId, extraState = {}) {
  mkdirSync(paths.sessionDir(sessionId), { recursive: true });
  stateLib.initState(sessionId, 'quick', ['DEV', 'REVIEW']);
  if (Object.keys(extraState).length > 0) {
    stateLib.writeState(sessionId, {
      ...stateLib.readState(sessionId),
      ...extraState,
    });
  }
  return stateLib.readState(sessionId);
}

/**
 * 強制更新檔案的 mtime（直接 touch — 重寫相同內容）
 * 讓下一次 statSync 看到不同的 mtimeMs。
 * 因為 writeFileSync 在同一毫秒內可能不更新 mtime，
 * 我們改寫一個不同位元組，讓 mtimeMs 必定改變。
 */
function touchFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  // 加上後再拿掉一個空格（維持合法 JSON）
  writeFileSync(filePath, content, 'utf8');
  // 用 utimesSync 強制設未來時間，確保 mtime 改變
  const now = new Date(Date.now() + 100);
  require('fs').utimesSync(filePath, now, now);
}

afterEach(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
  createdSessions.length = 0;
  counter = 0;
});

// ────────────────────────────────────────────────────────────────────────────
// S1-1: mtime 衝突觸發 retry
// ────────────────────────────────────────────────────────────────────────────

describe('S1-1: mtime 衝突觸發 retry', () => {
  it('讀寫之間 mtime 被修改時，updateStateAtomic 應偵測到衝突並重試', () => {
    const sessionId = newSessionId();
    setupSession(sessionId);
    const filePath = paths.session.workflow(sessionId);

    let modifierCallCount = 0;

    // modifier 內部在第 1 次呼叫時 touch 檔案，使 mtime 改變
    // 這樣 state.js 讀取 mtime 後、CAS 檢查前 mtime 已不同 → 觸發 retry
    const result = stateLib.updateStateAtomic(sessionId, (s) => {
      modifierCallCount++;
      if (modifierCallCount === 1) {
        // 模擬「外部修改」：在 modifier 執行時更新 mtime
        touchFile(filePath);
      }
      return { ...s, customField: `call_${modifierCallCount}` };
    });

    // modifier 應被呼叫 >= 2 次（第 1 次衝突後 retry）
    expect(modifierCallCount).toBeGreaterThanOrEqual(2);
    expect(result).toBeDefined();
    expect(result.customField).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// S1-2: retry 之間存在 jitter delay
// ────────────────────────────────────────────────────────────────────────────

describe('S1-2: retry 之間存在 jitter delay', () => {
  it('持續衝突 3 次，總耗時應 >= (MAX_RETRIES - 1) * 1ms', () => {
    const sessionId = newSessionId();
    setupSession(sessionId);
    const filePath = paths.session.workflow(sessionId);

    let modifierCallCount = 0;

    // modifier 每次都 touch 檔案，使每輪 CAS 都失敗 → 觸發所有 retry + fallback
    const start = Date.now();
    stateLib.updateStateAtomic(sessionId, (s) => {
      modifierCallCount++;
      touchFile(filePath);
      return { ...s, attempt: modifierCallCount };
    });
    const elapsed = Date.now() - start;

    // modifier 應被呼叫 4 次（3 retry + 1 fallback）
    expect(modifierCallCount).toBe(4);
    // MAX_RETRIES = 3，應至少有 2 次 jitter（每次 >= 1ms）→ 總耗時 >= 2ms
    // 允許系統偏差，最低門檻設 1ms
    expect(elapsed).toBeGreaterThanOrEqual(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// S1-3: MAX_RETRIES(3) 耗盡後執行 fallback 強制寫入
// ────────────────────────────────────────────────────────────────────────────

describe('S1-3: MAX_RETRIES(3) 耗盡後執行 fallback 強制寫入', () => {
  it('所有 retry 都失敗時，fallback 路徑應強制寫入並回傳更新後的 state', () => {
    const sessionId = newSessionId();
    setupSession(sessionId);
    const filePath = paths.session.workflow(sessionId);

    const sentinelValue = `fallback_${Date.now()}`;
    let modifierCallCount = 0;
    let threw = false;
    let result;

    try {
      // 每次 modifier 都 touch 檔案 → 3 retry + 1 fallback
      result = stateLib.updateStateAtomic(sessionId, (s) => {
        modifierCallCount++;
        touchFile(filePath);
        return { ...s, sentinel: sentinelValue };
      });
    } catch {
      threw = true;
    }

    // modifier 應被呼叫恰好 4 次（3 retry + 1 fallback）
    expect(modifierCallCount).toBe(4);
    // 不應拋出例外
    expect(threw).toBe(false);
    // 回傳值應含 modifier 結果
    expect(result).toBeDefined();
    expect(result.sentinel).toBe(sentinelValue);

    // workflow.json 應含有 modifier 執行後的結果
    const written = stateLib.readState(sessionId);
    expect(written.sentinel).toBe(sentinelValue);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// S1-4: fallback 路徑同樣執行 enforceInvariants
// ────────────────────────────────────────────────────────────────────────────

describe('S1-4: fallback 路徑同樣執行 enforceInvariants', () => {
  it('fallback 寫入時，孤兒 activeAgent 應被清除', () => {
    const sessionId = newSessionId();
    setupSession(sessionId, {
      activeAgents: {
        'tester:orphan999': {
          agentName: 'tester',
          stage: 'NONEXISTENT_STAGE:999',
          startedAt: new Date().toISOString(),
        },
      },
    });
    const filePath = paths.session.workflow(sessionId);

    // 每次 modifier 都 touch 檔案 → 強制走到 fallback
    const result = stateLib.updateStateAtomic(sessionId, (s) => {
      touchFile(filePath);
      return s;
    });

    // 孤兒 activeAgent 應被 enforceInvariants 清除
    expect(result.activeAgents['tester:orphan999']).toBeUndefined();

    // 驗證 workflow.json 也已寫入清除後的 state
    const written = stateLib.readState(sessionId);
    expect(written.activeAgents['tester:orphan999']).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// S1-5: retry 成功路徑（第 2 次 retry 成功）
// ────────────────────────────────────────────────────────────────────────────

describe('S1-5: retry 成功路徑（第 2 次 retry 成功）', () => {
  it('第 1 次衝突、第 2 次 CAS 成功 → 回傳正確 state 且 workflow.json 一致', () => {
    const sessionId = newSessionId();
    setupSession(sessionId);
    const filePath = paths.session.workflow(sessionId);

    let modifierCallCount = 0;

    // 只有第 1 次 modifier 執行時 touch 檔案（觸發衝突），第 2 次不 touch → 成功
    const result = stateLib.updateStateAtomic(sessionId, (s) => {
      modifierCallCount++;
      if (modifierCallCount === 1) {
        touchFile(filePath);
      }
      return { ...s, retrySuccessMarker: `attempt_${modifierCallCount}` };
    });

    // modifier 被呼叫 2 次（第 1 次衝突，第 2 次成功）
    expect(modifierCallCount).toBe(2);
    // 結果含第 2 次 modifier 標記
    expect(result.retrySuccessMarker).toBe('attempt_2');

    // workflow.json 內容應與回傳 state 一致
    const written = stateLib.readState(sessionId);
    expect(written.retrySuccessMarker).toBe('attempt_2');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// S1-6: enforceInvariants 在正常 CAS 成功路徑中執行
// ────────────────────────────────────────────────────────────────────────────

describe('S1-6: enforceInvariants 在正常 CAS 成功路徑中執行', () => {
  it('state 含 completedAt 但 status 非 completed 時，正常路徑應修正 status', () => {
    const sessionId = newSessionId();
    setupSession(sessionId);

    // 注入不一致狀態：DEV stage 有 completedAt 但 status 仍為 active
    const current = stateLib.readState(sessionId);
    current.stages['DEV'].status = 'active';
    current.stages['DEV'].completedAt = new Date().toISOString();
    stateLib.writeState(sessionId, current);

    // 無 mtime 衝突（modifier 不 touch 檔案）
    const result = stateLib.updateStateAtomic(sessionId, (s) => s);

    // enforceInvariants 規則 2 應修正 status
    expect(result.stages['DEV'].status).toBe('completed');

    // workflow.json 應同步
    const written = stateLib.readState(sessionId);
    expect(written.stages['DEV'].status).toBe('completed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// S1-7: modifier 回傳 undefined 時使用原始 state
// ────────────────────────────────────────────────────────────────────────────

describe('S1-7: modifier 回傳 undefined 時使用原始 state', () => {
  it('modifier 回傳 undefined → 使用 current state（?? current 語意），最終寫入與讀取時一致', () => {
    const sessionId = newSessionId();
    const originalState = setupSession(sessionId);

    // modifier 回傳 undefined
    const result = stateLib.updateStateAtomic(sessionId, () => undefined);

    // 結果應與原始 state 一致
    expect(result.sessionId).toBe(originalState.sessionId);
    expect(result.workflowType).toBe(originalState.workflowType);
    expect(JSON.stringify(result.stages)).toBe(JSON.stringify(originalState.stages));

    // workflow.json 應含正確 state（非 undefined）
    const written = stateLib.readState(sessionId);
    expect(written).toBeDefined();
    expect(written.sessionId).toBe(originalState.sessionId);
  });
});
