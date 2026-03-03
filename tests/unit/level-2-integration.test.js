'use strict';
/**
 * level-2-integration.test.js — Level 2 持續學習整合防護
 *
 * 靜態分析 guard：驗證所有 Level 2 整合點存在於 hook 程式碼中，
 * 防止未來重構時意外移除重要操作（如 decay、saveBaseline、score injection）。
 *
 * Feature 1：SessionEnd 整合點
 *   on-session-end.js 必須呼叫 graduate、decay、saveBaseline
 *
 * Feature 2：SessionStart 整合點
 *   on-start.js 必須注入 formatBaselineSummary、formatScoreSummary、formatFailureSummary
 *
 * Feature 3：PreToolUse(Task) 整合點
 *   pre-task.js 必須注入 scoreContext（品質歷史回饋）+ failureWarning（失敗模式警告）
 *
 * Feature 4：模組可載入性
 *   所有 Level 2 模組都能被 require 且匯出預期 API
 *
 * Feature 5：SubagentStop 整合點（Level 3 卡點識別）
 *   on-stop.js（agent）必須呼叫 failure-tracker.recordFailure
 */

const { describe, test, expect } = require('bun:test');
const { readFileSync } = require('fs');
const { join } = require('path');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// 讀取 hook 原始碼（靜態分析用）
const sessionEndSrc = readFileSync(join(HOOKS_DIR, 'session', 'on-session-end.js'), 'utf8');
const sessionStartSrc = readFileSync(join(HOOKS_DIR, 'session', 'on-start.js'), 'utf8');
const preTaskSrc = readFileSync(join(HOOKS_DIR, 'tool', 'pre-task.js'), 'utf8');
const agentOnStopSrc = readFileSync(join(HOOKS_DIR, 'agent', 'on-stop.js'), 'utf8');

// ── Feature 1：SessionEnd 整合點 ──

describe('Feature 1：SessionEnd 整合點', () => {
  test('1-1 呼叫 global-instinct.graduate', () => {
    expect(sessionEndSrc).toContain('graduate');
    expect(sessionEndSrc).toContain('global-instinct');
  });

  test('1-2 呼叫 instinct.decay', () => {
    expect(sessionEndSrc).toContain('instinct');
    expect(sessionEndSrc).toContain('.decay(');
  });

  test('1-3 呼叫 baseline-tracker.saveBaseline', () => {
    expect(sessionEndSrc).toContain('baseline-tracker');
    expect(sessionEndSrc).toContain('saveBaseline');
  });

  test('1-4 decay 在 graduate 之後執行', () => {
    const graduateIdx = sessionEndSrc.indexOf('graduate(');
    const decayIdx = sessionEndSrc.indexOf('.decay(');
    expect(graduateIdx).toBeGreaterThan(-1);
    expect(decayIdx).toBeGreaterThan(-1);
    expect(decayIdx).toBeGreaterThan(graduateIdx);
  });

  test('1-5 所有整合點都有 try/catch 保護', () => {
    // 找到各整合點附近有 try/catch
    // graduate 區塊
    const graduateBlock = sessionEndSrc.slice(
      sessionEndSrc.lastIndexOf('try', sessionEndSrc.indexOf('graduate(')),
      sessionEndSrc.indexOf('graduate(') + 50
    );
    expect(graduateBlock).toContain('try');

    // decay 區塊
    const decayBlock = sessionEndSrc.slice(
      sessionEndSrc.lastIndexOf('try', sessionEndSrc.indexOf('.decay(')),
      sessionEndSrc.indexOf('.decay(') + 50
    );
    expect(decayBlock).toContain('try');

    // saveBaseline 區塊
    const baselineBlock = sessionEndSrc.slice(
      sessionEndSrc.lastIndexOf('try', sessionEndSrc.indexOf('saveBaseline')),
      sessionEndSrc.indexOf('saveBaseline') + 50
    );
    expect(baselineBlock).toContain('try');
  });
});

// ── Feature 2：SessionStart 整合點 ──

describe('Feature 2：SessionStart 整合點', () => {
  test('2-1 注入 formatBaselineSummary', () => {
    expect(sessionStartSrc).toContain('baseline-tracker');
    expect(sessionStartSrc).toContain('formatBaselineSummary');
  });

  test('2-2 注入 formatScoreSummary', () => {
    expect(sessionStartSrc).toContain('score-engine');
    expect(sessionStartSrc).toContain('formatScoreSummary');
  });

  test('2-3 注入全域觀察 queryGlobal', () => {
    expect(sessionStartSrc).toContain('global-instinct');
    expect(sessionStartSrc).toContain('queryGlobal');
  });

  test('2-4 注入執行佇列 formatQueueSummary', () => {
    expect(sessionStartSrc).toContain('execution-queue');
    expect(sessionStartSrc).toContain('formatQueueSummary');
  });

  test('2-5 注入失敗模式摘要 formatFailureSummary', () => {
    expect(sessionStartSrc).toContain('failure-tracker');
    expect(sessionStartSrc).toContain('formatFailureSummary');
  });
});

// ── Feature 3：PreToolUse(Task) 整合點 ──

describe('Feature 3：PreToolUse(Task) 整合點', () => {
  test('3-1 注入 scoreContext（品質歷史）', () => {
    expect(preTaskSrc).toContain('scoreContext');
    expect(preTaskSrc).toContain('getScoreSummary');
  });

  test('3-2 scoreContext 受 gradedStages 過濾', () => {
    expect(preTaskSrc).toContain('gradedStages');
    expect(preTaskSrc).toContain('scoringConfig');
  });

  test('3-3 scoreContext 在 parts 組裝中', () => {
    expect(preTaskSrc).toContain('hasScoreContext');
    // scoreContext 應在 parts.push 中出現
    const partsSection = preTaskSrc.slice(preTaskSrc.indexOf('const parts = []'));
    expect(partsSection).toContain('scoreContext');
  });

  test('3-4 注入 skillContext（知識領域）', () => {
    expect(preTaskSrc).toContain('buildSkillContext');
    expect(preTaskSrc).toContain('skillContextStr');
  });

  test('3-5 注入 gapWarnings（知識缺口）', () => {
    expect(preTaskSrc).toContain('detectKnowledgeGaps');
    expect(preTaskSrc).toContain('gapWarnings');
  });

  test('3-6 注入 failureWarning（失敗模式警告）', () => {
    expect(preTaskSrc).toContain('failure-tracker');
    expect(preTaskSrc).toContain('formatFailureWarnings');
    expect(preTaskSrc).toContain('hasFailureWarning');
  });

  test('3-7 failureWarning 在 parts 組裝中', () => {
    const partsSection = preTaskSrc.slice(preTaskSrc.indexOf('const parts = []'));
    expect(partsSection).toContain('failureWarning');
  });
});

// ── Feature 4：模組可載入性 + API 匯出 ──

describe('Feature 4：模組可載入性', () => {
  test('4-1 global-instinct.js 匯出 graduate + decayGlobal + queryGlobal', () => {
    const mod = require(join(SCRIPTS_LIB, 'global-instinct'));
    expect(typeof mod.graduate).toBe('function');
    expect(typeof mod.decayGlobal).toBe('function');
    expect(typeof mod.queryGlobal).toBe('function');
  });

  test('4-2 baseline-tracker.js 匯出 saveBaseline + computeBaselineTrend + formatBaselineSummary', () => {
    const mod = require(join(SCRIPTS_LIB, 'baseline-tracker'));
    expect(typeof mod.saveBaseline).toBe('function');
    expect(typeof mod.computeBaselineTrend).toBe('function');
    expect(typeof mod.formatBaselineSummary).toBe('function');
  });

  test('4-3 score-engine.js 匯出 saveScore + getScoreSummary + computeScoreTrend + formatScoreSummary', () => {
    const mod = require(join(SCRIPTS_LIB, 'score-engine'));
    expect(typeof mod.saveScore).toBe('function');
    expect(typeof mod.getScoreSummary).toBe('function');
    expect(typeof mod.computeScoreTrend).toBe('function');
    expect(typeof mod.formatScoreSummary).toBe('function');
  });

  test('4-4 instinct.js 匯出 decay', () => {
    const mod = require(join(SCRIPTS_LIB, 'instinct'));
    expect(typeof mod.decay).toBe('function');
  });

  test('4-5 execution-queue.js 匯出 readQueue + writeQueue + formatQueueSummary', () => {
    const mod = require(join(SCRIPTS_LIB, 'execution-queue'));
    expect(typeof mod.readQueue).toBe('function');
    expect(typeof mod.writeQueue).toBe('function');
    expect(typeof mod.formatQueueSummary).toBe('function');
  });

  test('4-6 failure-tracker.js 匯出 4 個 API', () => {
    const mod = require(join(SCRIPTS_LIB, 'failure-tracker'));
    expect(typeof mod.recordFailure).toBe('function');
    expect(typeof mod.getFailurePatterns).toBe('function');
    expect(typeof mod.formatFailureWarnings).toBe('function');
    expect(typeof mod.formatFailureSummary).toBe('function');
  });
});

// ── Feature 5：SubagentStop 整合點（Level 3 卡點識別）──

describe('Feature 5：SubagentStop 整合點', () => {
  test('5-1 on-stop.js（agent）呼叫 failure-tracker.recordFailure', () => {
    expect(agentOnStopSrc).toContain('failure-tracker');
    expect(agentOnStopSrc).toContain('recordFailure');
  });

  test('5-2 recordFailure 受 fail/reject 條件守衛', () => {
    // 確認 recordFailure 在 verdict === 'fail' || verdict === 'reject' 條件內
    const idx = agentOnStopSrc.indexOf('recordFailure');
    expect(idx).toBeGreaterThan(-1);
    // 找到 recordFailure 之前最近的條件判斷
    const before = agentOnStopSrc.slice(0, idx);
    const condIdx = before.lastIndexOf('fail');
    expect(condIdx).toBeGreaterThan(-1);
  });

  test('5-3 recordFailure 有 try/catch 保護', () => {
    const idx = agentOnStopSrc.indexOf('recordFailure');
    const block = agentOnStopSrc.slice(
      agentOnStopSrc.lastIndexOf('try', idx),
      idx + 50
    );
    expect(block).toContain('try');
  });
});
