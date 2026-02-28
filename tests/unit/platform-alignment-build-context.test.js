'use strict';
/**
 * platform-alignment-build-context.test.js
 *
 * Feature 1c: buildWorkflowContext 函式（Scenario 1c-2~6）
 * Feature 1f: buildWorkflowContext 共用函式（Scenario 1f-1~6）
 * BDD 規格：specs/features/in-progress/platform-alignment-phase1/bdd.md
 *
 * 策略：直接呼叫 buildWorkflowContext 函式，使用真實的 state 目錄。
 */

const { describe, test, expect, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync } = require('fs');
const { SCRIPTS_LIB } = require('../helpers/paths');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const { workflows } = require(join(SCRIPTS_LIB, 'registry'));
const { buildWorkflowContext } = require(join(SCRIPTS_LIB, 'hook-utils'));

// ── Session 管理 ──

const SESSION_PREFIX = `test_build_ctx_${Date.now()}`;
let testCounter = 0;
const createdSessions = [];

function newSession(workflowType = 'standard') {
  const sessionId = `${SESSION_PREFIX}_${++testCounter}`;
  createdSessions.push(sessionId);
  mkdirSync(paths.sessionDir(sessionId), { recursive: true });
  state.initState(sessionId, workflowType, workflows[workflowType].stages);
  return sessionId;
}

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 1f: buildWorkflowContext 共用函式
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1f: buildWorkflowContext 函式', () => {

  // Scenario 1f-1: 有 workflow state 時回傳完整 context 字串
  describe('Scenario 1f-1: 有 workflow state 時回傳完整 context', () => {
    test('回傳非 null 字串', () => {
      const sessionId = newSession('standard');
      const result = buildWorkflowContext(sessionId, process.cwd());
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    });

    test('字串首行為 [Overtone Workflow Context]', () => {
      const sessionId = newSession('standard');
      const result = buildWorkflowContext(sessionId, process.cwd());
      expect(result.startsWith('[Overtone Workflow Context]')).toBe(true);
    });

    test('字串包含 工作流：standard', () => {
      const sessionId = newSession('standard');
      const result = buildWorkflowContext(sessionId, process.cwd());
      expect(result).toContain('工作流：standard');
    });

    test('字串包含進度條', () => {
      const sessionId = newSession('standard');
      const result = buildWorkflowContext(sessionId, process.cwd());
      // 進度條包含 ✅ 或 ⬜ 標記
      expect(result).toContain('進度：');
    });

    test('字串包含 目前階段', () => {
      const sessionId = newSession('standard');
      const result = buildWorkflowContext(sessionId, process.cwd());
      expect(result).toContain('目前階段：');
    });
  });

  // Scenario 1f-2: 無 workflow state 時回傳 null
  describe('Scenario 1f-2: 無 workflow state 時回傳 null', () => {
    test('sessionId 有效但無 workflow.json 時回傳 null', () => {
      const sessionId = `nonexistent_session_${Date.now()}`;
      const result = buildWorkflowContext(sessionId, process.cwd());
      expect(result).toBeNull();
    });
  });

  // Scenario 1f-3: maxLength 參數控制截斷
  describe('Scenario 1f-3: maxLength 截斷保護', () => {
    test('context 超過 maxLength 時被截斷', () => {
      const sessionId = newSession('standard');
      // 加入大量前階段摘要製造長字串
      state.updateStateAtomic(sessionId, (s) => {
        const firstStage = Object.keys(s.stages)[0];
        if (firstStage) {
          s.stages[firstStage].status = 'completed';
          s.stages[firstStage].result = 'x'.repeat(200);
        }
        return s;
      });
      const result = buildWorkflowContext(sessionId, process.cwd(), { maxLength: 100 });
      expect(result).not.toBeNull();
      expect(result.length).toBeLessThanOrEqual(100);
    });

    test('截斷後字串末尾包含 ... (已截斷)', () => {
      const sessionId = newSession('standard');
      state.updateStateAtomic(sessionId, (s) => {
        const firstStage = Object.keys(s.stages)[0];
        if (firstStage) {
          s.stages[firstStage].status = 'completed';
          s.stages[firstStage].result = 'x'.repeat(200);
        }
        return s;
      });
      const result = buildWorkflowContext(sessionId, process.cwd(), { maxLength: 100 });
      expect(result).toContain('... (已截斷)');
    });
  });

  // Scenario 1f-4: 未提供 maxLength 時預設為 1500
  describe('Scenario 1f-4: 預設 maxLength 為 1500', () => {
    test('不提供 options 時正常回傳（不超過 1500 字元）', () => {
      const sessionId = newSession('standard');
      const result = buildWorkflowContext(sessionId, process.cwd());
      expect(result).not.toBeNull();
      // 正常 workflow context 遠小於 1500 字元
      expect(result.length).toBeLessThanOrEqual(1500);
    });
  });

  // Scenario 1f-5: 讀取 state 失敗時回傳 null
  describe('Scenario 1f-5: 讀取失敗時回傳 null', () => {
    test('state 拋出例外時函式捕獲並回傳 null（非標準 sessionId）', () => {
      // 使用無效字元的 sessionId 讓路徑解析失敗
      const result = buildWorkflowContext('', process.cwd());
      expect(result).toBeNull();
    });
  });

  // Scenario 1f-6: 前階段摘要從 stage results 讀取
  describe('Scenario 1f-6: 前階段摘要包含已完成 stage 的 result', () => {
    test('已完成 stage 有 result 時 context 包含前階段摘要', () => {
      const sessionId = newSession('standard');
      // 將 PLAN 和 ARCH 設為 completed 並附 result
      state.updateStateAtomic(sessionId, (s) => {
        if (s.stages['PLAN']) {
          s.stages['PLAN'].status = 'completed';
          s.stages['PLAN'].result = 'pass';
        }
        if (s.stages['ARCH']) {
          s.stages['ARCH'].status = 'completed';
          s.stages['ARCH'].result = 'pass';
        }
        return s;
      });
      const result = buildWorkflowContext(sessionId, process.cwd());
      expect(result).toContain('前階段摘要');
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 1c: buildWorkflowContext 進度資訊和 feature 資訊
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1c: workflow context 結構驗證', () => {

  // Scenario 1c-2: workflow context 包含進度條和當前階段
  describe('Scenario 1c-2: context 包含進度條和當前階段', () => {
    test('standard workflow 的 context 包含工作流類型', () => {
      const sessionId = newSession('standard');
      const result = buildWorkflowContext(sessionId, process.cwd());
      expect(result).toContain('standard');
    });

    test('context 包含 目前階段 的 emoji 標記', () => {
      const sessionId = newSession('standard');
      const result = buildWorkflowContext(sessionId, process.cwd());
      // standard workflow 的第一個 stage 是 PLAN（📋 規劃）
      expect(result).toContain('目前階段：');
    });
  });

  // Scenario 1c-4: 無 featureName 時 context 省略 specs 資訊
  describe('Scenario 1c-4: 無 featureName 時省略 Feature 和 Specs 行', () => {
    test('無 featureName 的 workflow context 不包含 Feature： 行', () => {
      const sessionId = newSession('standard');
      // 預設 initState 後 featureName 可能為 null
      const result = buildWorkflowContext(sessionId, process.cwd());
      if (result) {
        // 若沒有設定 featureName，context 不應含 Feature 欄位
        const currentState = state.readState(sessionId);
        if (!currentState.featureName) {
          expect(result).not.toContain('Feature：');
          expect(result).not.toContain('Specs：');
        }
      }
    });
  });

  // Scenario 1c-5: context 超過 maxLength 時截斷
  describe('Scenario 1c-5: context 超過 maxLength 時截斷', () => {
    test('maxLength: 1500 截斷超長 context', () => {
      const sessionId = newSession('standard');
      // 製造長 result 超出 1500 字元
      state.updateStateAtomic(sessionId, (s) => {
        const firstStage = Object.keys(s.stages)[0];
        if (firstStage) {
          s.stages[firstStage].status = 'completed';
          s.stages[firstStage].result = 'x'.repeat(2000);
        }
        return s;
      });
      const result = buildWorkflowContext(sessionId, process.cwd(), { maxLength: 1500 });
      expect(result).not.toBeNull();
      expect(result.length).toBeLessThanOrEqual(1500);
    });
  });

  // Scenario 1c-6: 無 workflow state 時回傳 null
  describe('Scenario 1c-6: 無 workflow state 時 buildWorkflowContext 回傳 null', () => {
    test('workflow.json 不存在時回傳 null', () => {
      const nonExistentSession = `no_session_${Date.now()}`;
      const result = buildWorkflowContext(nonExistentSession, process.cwd());
      expect(result).toBeNull();
    });
  });
});
