'use strict';
/**
 * statusline-ttl.test.js — statusline.js activeAgents 顯示邏輯測試
 *
 * 測試範圍：
 *   - buildAgentDisplay 只依賴 stages.status === 'active' 作為信號源
 *   - activeAgents 欄位不影響 statusline 顯示（TTL 機制已移除）
 *   - 有 active stage → 雙行顯示
 *   - 無 active stage（全 completed 或 pending）→ 單行顯示
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { spawnSync } = require('child_process');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { tmpdir, homedir: _homedir } = require('os');
const { SCRIPTS_DIR } = require('../helpers/paths');

const STATUSLINE_PATH = join(SCRIPTS_DIR, 'statusline.js');

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── 測試輔助：建立 tmpHome + session ──

function setupTmpSession(workflowData) {
  const tmpHome = join(tmpdir(), `statusline-ttl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const sessionId = `ttl-test-${Date.now()}`;
  const sessionDir = join(tmpHome, '.nova', 'sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'workflow.json'), JSON.stringify(workflowData));
  return { tmpHome, sessionId, sessionDir, cleanup: () => { try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* 靜默 */ } } };
}

function runStatuslineWithSession(sessionId, tmpHome, extraInput = {}) {
  return spawnSync('node', [STATUSLINE_PATH], {
    input: JSON.stringify({ session_id: sessionId, context_window: { used_percentage: 20 }, ...extraInput }),
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, HOME: tmpHome },
  });
}

// ── Feature 1: stages.status 是唯一 agent 顯示信號源 ──

describe('statusline agent 顯示 — stages.status 為唯一信號源', () => {

  it('Scenario SL-1: 無 active stage（全 completed）+ activeAgents 有殘留 → 單行模式', () => {
    const { tmpHome, sessionId, cleanup } = setupTmpSession({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'completed', result: 'pass' },
        REVIEW: { status: 'completed', result: 'pass' },
      },
      activeAgents: {
        // 殘留 entry，但 stages 無 active → 不顯示
        'developer:stale001-xxxx': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: new Date().toISOString(),
        },
      },
    });

    try {
      const result = runStatuslineWithSession(sessionId, tmpHome);
      const plain = stripAnsi(result.stdout || '');
      const lines = plain.split('\n').filter(l => l.trim());
      // 單行模式（無 active stage）
      expect(lines.length).toBe(1);
      // 不包含 developer（無 active stage，activeAgents 不作為信號）
      expect(plain).not.toContain('developer');
      // 包含基礎 metrics
      expect(plain).toContain('ctx');
    } finally {
      cleanup();
    }
  });

  it('Scenario SL-2: 有 active stage → 雙行顯示（stages.status 信號）', () => {
    const { tmpHome, sessionId, cleanup } = setupTmpSession({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'active' }, // 仍 active
      },
      activeAgents: {},
    });

    try {
      const result = runStatuslineWithSession(sessionId, tmpHome);
      const plain = stripAnsi(result.stdout || '');
      const lines = plain.split('\n').filter(l => l.trim());
      // 雙行模式（有 active stage）
      expect(lines.length).toBe(2);
      expect(plain).toContain('developer');
    } finally {
      cleanup();
    }
  });

  it('Scenario SL-3: 無 active stage（全 completed）+ activeAgents 有新鮮 entry → 仍為單行模式', () => {
    const freshTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 分鐘前

    const { tmpHome, sessionId, cleanup } = setupTmpSession({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'completed', result: 'pass' },
      },
      activeAgents: {
        // 新鮮 entry，但 stages 無 active → 不顯示（activeAgents fallback 已移除）
        'developer:fresh001-xxxx': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: freshTime,
        },
      },
    });

    try {
      const result = runStatuslineWithSession(sessionId, tmpHome);
      const plain = stripAnsi(result.stdout || '');
      const lines = plain.split('\n').filter(l => l.trim());
      // 單行模式（無 active stage，activeAgents 不再作為 fallback 信號）
      expect(lines.length).toBe(1);
      expect(plain).not.toContain('developer');
    } finally {
      cleanup();
    }
  });

  it('Scenario SL-4: 所有 stages completed + activeAgents 有殘留 → 顯示單行模式', () => {
    const { tmpHome, sessionId, cleanup } = setupTmpSession({
      workflowType: 'standard',
      stages: {
        PLAN:   { status: 'completed', result: 'pass' },
        ARCH:   { status: 'completed', result: 'pass' },
        DEV:    { status: 'completed', result: 'pass' },
        REVIEW: { status: 'completed', result: 'pass' },
        TEST:   { status: 'completed', result: 'pass' },
        RETRO:  { status: 'completed', result: 'pass' },
        DOCS:   { status: 'completed', result: 'pass' },
      },
      activeAgents: {
        'developer:stale001-aaaa': { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() },
      },
    });

    try {
      const result = runStatuslineWithSession(sessionId, tmpHome);
      const plain = stripAnsi(result.stdout || '');
      const lines = plain.split('\n').filter(l => l.trim());
      // 單行（全部 completed，activeAgents 不影響顯示）
      expect(lines.length).toBe(1);
      expect(plain).not.toContain('developer');
      expect(plain).toContain('ctx');
    } finally {
      cleanup();
    }
  });
});
