'use strict';
require('../helpers/setup');

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, writeFileSync, rmSync, mkdtempSync } = require('fs');
const { join } = require('path');
const os = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const SessionContext = require(join(SCRIPTS_LIB, 'session-context'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── 測試用臨時目錄 ──

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), 'ot-ctx-test-'));
});

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 清理失敗不阻塞 */ }
});

// ── Constructor ──

describe('SessionContext constructor', () => {
  it('建立不可變 context', () => {
    const ctx = new SessionContext(tmpDir, 'sess-1', 'wf-abc');
    expect(ctx.projectRoot).toBe(tmpDir);
    expect(ctx.sessionId).toBe('sess-1');
    expect(ctx.workflowId).toBe('wf-abc');
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it('workflowId 預設 null', () => {
    const ctx = new SessionContext(tmpDir, 'sess-1');
    expect(ctx.workflowId).toBeNull();
  });

  it('空字串 workflowId 正規化為 null', () => {
    const ctx = new SessionContext(tmpDir, 'sess-1', '');
    expect(ctx.workflowId).toBeNull();
  });

  it('缺少 projectRoot 拋錯', () => {
    expect(() => new SessionContext('', 'sess-1')).toThrow('projectRoot');
  });

  it('缺少 sessionId 拋錯', () => {
    expect(() => new SessionContext(tmpDir, '')).toThrow('sessionId');
  });

  it('null projectRoot 拋錯', () => {
    expect(() => new SessionContext(null, 'sess-1')).toThrow('projectRoot');
  });

  it('undefined sessionId 拋錯', () => {
    expect(() => new SessionContext(tmpDir, undefined)).toThrow('sessionId');
  });
});

// ── fromInput ──

describe('SessionContext.fromInput', () => {
  it('從 input.cwd 解析 projectRoot', () => {
    const ctx = SessionContext.fromInput(
      { cwd: tmpDir, session_id: 'sess-from-input' }
    );
    expect(ctx.projectRoot).toBe(tmpDir);
    expect(ctx.sessionId).toBe('sess-from-input');
    expect(ctx.workflowId).toBeNull();
  });

  it('sessionIdOverride 優先於 input.session_id', () => {
    const ctx = SessionContext.fromInput(
      { cwd: tmpDir, session_id: 'from-input' },
      'from-override'
    );
    expect(ctx.sessionId).toBe('from-override');
  });

  it('讀取 active-workflow-id', () => {
    const sessionDir = join(tmpDir, '.nova', 'sessions', 'sess-wf');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'active-workflow-id'), 'wf-123\n');

    const ctx = SessionContext.fromInput(
      { cwd: tmpDir, session_id: 'sess-wf' }
    );
    expect(ctx.workflowId).toBe('wf-123');
  });

  it('active-workflow-id 不存在 → workflowId 為 null', () => {
    const ctx = SessionContext.fromInput(
      { cwd: tmpDir, session_id: 'sess-no-wf' }
    );
    expect(ctx.workflowId).toBeNull();
  });

  it('從 env fallback 取得 sessionId', () => {
    const oldEnv = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'env-sess-id';
    try {
      const ctx = SessionContext.fromInput({ cwd: tmpDir });
      expect(ctx.sessionId).toBe('env-sess-id');
    } finally {
      if (oldEnv !== undefined) {
        process.env.CLAUDE_SESSION_ID = oldEnv;
      } else {
        delete process.env.CLAUDE_SESSION_ID;
      }
    }
  });
});

// ── withWorkflowId ──

describe('withWorkflowId', () => {
  it('建立新 context 保留 projectRoot 和 sessionId', () => {
    const ctx = new SessionContext(tmpDir, 'sess-1', 'wf-old');
    const newCtx = ctx.withWorkflowId('wf-new');
    expect(newCtx.projectRoot).toBe(tmpDir);
    expect(newCtx.sessionId).toBe('sess-1');
    expect(newCtx.workflowId).toBe('wf-new');
    // 原 context 不變
    expect(ctx.workflowId).toBe('wf-old');
  });

  it('null 清除 workflowId', () => {
    const ctx = new SessionContext(tmpDir, 'sess-1', 'wf-old');
    const newCtx = ctx.withWorkflowId(null);
    expect(newCtx.workflowId).toBeNull();
  });
});

// ── 路徑方法 ──

describe('路徑方法', () => {
  const pr = '/Users/test/project';
  const sid = 'sess-abc';
  const wfId = 'wf-xyz';

  describe('無 workflowId（session 層級）', () => {
    const ctx = new SessionContext(pr, sid);

    it('sessionDir', () => {
      expect(ctx.sessionDir()).toBe(paths.sessionDir(pr, sid));
    });

    it('workflowFile → session 層級 workflow.json', () => {
      expect(ctx.workflowFile()).toBe(paths.session.workflow(pr, sid));
    });

    it('timelineFile → session 層級 timeline.jsonl', () => {
      expect(ctx.timelineFile()).toBe(paths.session.timeline(pr, sid));
    });

    it('loopFile', () => {
      expect(ctx.loopFile()).toBe(paths.session.loop(pr, sid));
    });

    it('handoffFile', () => {
      expect(ctx.handoffFile('REVIEW')).toBe(paths.session.handoff(pr, sid, 'REVIEW'));
    });

    it('handoffsDir', () => {
      expect(ctx.handoffsDir()).toBe(paths.session.handoffsDir(pr, sid));
    });

    it('activeWorkflowIdFile', () => {
      expect(ctx.activeWorkflowIdFile()).toBe(paths.session.activeWorkflowId(pr, sid));
    });

    it('observationsFile', () => {
      expect(ctx.observationsFile()).toBe(paths.session.observations(pr, sid));
    });

    it('compactCountFile', () => {
      expect(ctx.compactCountFile()).toBe(paths.session.compactCount(pr, sid));
    });

    it('compactingFile', () => {
      expect(ctx.compactingFile()).toBe(paths.session.compacting(pr, sid));
    });

    it('agentMappingFile', () => {
      expect(ctx.agentMappingFile()).toBe(paths.session.agentMapping(pr, sid));
    });

    it('workflowDir → null（無 workflowId）', () => {
      expect(ctx.workflowDir()).toBeNull();
    });

    it('workflowsDir', () => {
      expect(ctx.workflowsDir()).toBe(paths.session.workflowsDir(pr, sid));
    });
  });

  describe('有 workflowId（workflow 層級）', () => {
    const ctx = new SessionContext(pr, sid, wfId);

    it('workflowFile → workflow 層級', () => {
      expect(ctx.workflowFile()).toBe(paths.session.workflowFile(pr, sid, wfId));
    });

    it('timelineFile → workflow 層級', () => {
      expect(ctx.timelineFile()).toBe(paths.session.workflowTimeline(pr, sid, wfId));
    });

    it('handoffFile → workflow 層級', () => {
      expect(ctx.handoffFile('DEV')).toBe(paths.session.workflowHandoff(pr, sid, wfId, 'DEV'));
    });

    it('handoffsDir → workflow 層級', () => {
      expect(ctx.handoffsDir()).toBe(paths.session.workflowHandoffsDir(pr, sid, wfId));
    });

    it('workflowDir', () => {
      expect(ctx.workflowDir()).toBe(paths.session.workflowDir(pr, sid, wfId));
    });

    it('loopFile 不受 workflowId 影響（session 層級）', () => {
      expect(ctx.loopFile()).toBe(paths.session.loop(pr, sid));
    });
  });
});
