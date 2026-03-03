'use strict';
/**
 * statusline-ttl.test.js — statusline.js activeAgents TTL 過濾測試
 *
 * 測試範圍：
 *   - buildAgentDisplay activeAgents fallback 的 TTL 過濾邏輯
 *   - 過期 entry（無 active stage + 超過 30 分鐘）→ 不顯示
 *   - 有 active stage 的 entry → 永遠顯示（不受 TTL 影響）
 *   - 新鮮 entry（5 分鐘內）→ 正常顯示
 *   - 所有 stages completed + activeAgents 有殘留 → 顯示單行模式（不誤顯示 agent）
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
  const sessionDir = join(tmpHome, '.overtone', 'sessions', sessionId);
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

// ── Feature 1: 過期殘留 entry 不顯示 ──

describe('activeAgents TTL 過濾 — 過期 entry', () => {

  it('Scenario TTL-1: 超過 30 分鐘的 entry 且無 active stage → 不顯示（回到單行模式）', () => {
    const expiredTime = new Date(Date.now() - 31 * 60 * 1000).toISOString(); // 31 分鐘前

    const { tmpHome, sessionId, cleanup } = setupTmpSession({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'completed', result: 'pass' },
        REVIEW: { status: 'completed', result: 'pass' },
      },
      activeAgents: {
        'developer:stale001-xxxx': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: expiredTime,
        },
      },
    });

    try {
      const result = runStatuslineWithSession(sessionId, tmpHome);
      const plain = stripAnsi(result.stdout || '');
      const lines = plain.split('\n').filter(l => l.trim());
      // 單行模式（無 agent 顯示）
      expect(lines.length).toBe(1);
      // 不包含 developer（過期 entry 被過濾）
      expect(plain).not.toContain('developer');
      // 包含基礎 metrics
      expect(plain).toContain('ctx');
    } finally {
      cleanup();
    }
  });

  it('Scenario TTL-2: 有 active stage 的 entry → 永遠顯示（不受 TTL 限制）', () => {
    const expiredTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 60 分鐘前（超過 TTL）

    const { tmpHome, sessionId, cleanup } = setupTmpSession({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'active' }, // 仍 active
      },
      activeAgents: {
        'developer:old001-xxxx': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: expiredTime, // 很舊，但 stage 仍 active
        },
      },
    });

    try {
      const result = runStatuslineWithSession(sessionId, tmpHome);
      const plain = stripAnsi(result.stdout || '');
      const lines = plain.split('\n').filter(l => l.trim());
      // 雙行模式（agent 顯示 + metrics）— 有 active stage，TTL 不過期
      expect(lines.length).toBe(2);
      // 注意：有 active stage 時，會走 stages.status==='active' 路徑，而非 activeAgents fallback
      // 所以 developer 仍然顯示
      expect(plain).toContain('developer');
    } finally {
      cleanup();
    }
  });

  it('Scenario TTL-3: 5 分鐘內的新鮮 entry 且無 active stage → 正常顯示（TTL 未過期）', () => {
    const freshTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 分鐘前

    const { tmpHome, sessionId, cleanup } = setupTmpSession({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'completed', result: 'pass' },
      },
      activeAgents: {
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
      // 雙行模式（TTL 未過期，entry 仍顯示）
      expect(lines.length).toBe(2);
      expect(plain).toContain('developer');
    } finally {
      cleanup();
    }
  });

  it('Scenario TTL-4: 所有 stages completed + activeAgents 有過期殘留 → 顯示單行模式', () => {
    const expiredTime = new Date(Date.now() - 45 * 60 * 1000).toISOString(); // 45 分鐘前

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
        // DEV 已 completed，entry 過期
        'developer:stale001-aaaa': { agentName: 'developer', stage: 'DEV', startedAt: expiredTime },
      },
    });

    try {
      const result = runStatuslineWithSession(sessionId, tmpHome);
      const plain = stripAnsi(result.stdout || '');
      const lines = plain.split('\n').filter(l => l.trim());
      // 單行（全部 completed，過期殘留被過濾）
      expect(lines.length).toBe(1);
      expect(plain).not.toContain('developer');
      expect(plain).toContain('ctx');
    } finally {
      cleanup();
    }
  });
});
