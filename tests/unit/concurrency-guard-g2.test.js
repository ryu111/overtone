'use strict';
/**
 * concurrency-guard-g2.test.js
 *
 * 覆蓋 BDD spec concurrency-guard-g2 所有 17 個 scenario：
 *   Feature A: detectAndCleanOrphans — 基本清理
 *   Feature B: detectAndCleanOrphans — 邊界條件
 *   Feature C: checkConcurrencyGuards — 靜態文件掃描
 *   Feature D: checkConcurrencyGuards — Runtime 掃描
 *   Feature E: agent:orphan-cleanup timeline 事件格式
 */

const { describe, test, expect, beforeAll, afterAll } = require('bun:test');
const fs = require('fs');
const path = require('path');
const { join } = path;
const os = require('os');
const { homedir } = require('os');
const { SCRIPTS_LIB, SCRIPTS_DIR } = require('../helpers/paths');

const stateLib = require(join(SCRIPTS_LIB, 'state'));
const loopLib = require(join(SCRIPTS_LIB, 'loop'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

const {
  detectAndCleanOrphans,
  ORPHAN_TTL_MS,
  handleSessionStop,
} = require(join(SCRIPTS_LIB, 'session-stop-handler'));

const {
  checkConcurrencyGuards,
} = require(join(SCRIPTS_DIR, 'health-check'));

// ── session 管理 ──

const SID_PREFIX = `test_ccg2_${Date.now()}`;
let sidCounter = 0;
const createdSessions = [];

function newSid() {
  const sid = `${SID_PREFIX}_${++sidCounter}`;
  createdSessions.push(sid);
  return sid;
}

function setupSession(sid, stageList, workflowType = 'quick', extra = {}) {
  const dir = paths.sessionDir(sid);
  fs.mkdirSync(dir, { recursive: true });
  return stateLib.initState(sid, workflowType, stageList, extra);
}

afterAll(() => {
  for (const sid of createdSessions) {
    try {
      fs.rmSync(paths.sessionDir(sid), { recursive: true, force: true });
    } catch { /* ignore */ }
  }
});

// ── Feature A: 基本清理 ──

describe('Feature A: detectAndCleanOrphans — 基本清理', () => {

  test('Scenario A-1: agent 超過 TTL 被識別為 orphan 並清除', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW']);

    const startedAt16MinAgo = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    stateLib.updateStateAtomic(sid, (s) => {
      s.activeAgents['developer:orphan1'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: startedAt16MinAgo,
      };
      return s;
    });

    const currentState = stateLib.readState(sid);
    const result = detectAndCleanOrphans(sid, currentState);

    // 清除後重新讀取 state 確認 entry 已移除
    const updatedState = stateLib.readState(sid);
    expect(result.cleaned.length).toBe(1);
    expect(result.cleaned[0].instanceId).toBe('developer:orphan1');
    expect(result.cleaned[0].agentName).toBe('developer');
    expect(typeof result.cleaned[0].ageMs).toBe('number');
    expect(result.cleaned[0].ageMs).toBeGreaterThan(ORPHAN_TTL_MS);
    expect(result.cleaned[0].ttlMs).toBe(ORPHAN_TTL_MS);
    expect(updatedState.activeAgents['developer:orphan1']).toBeUndefined();
  });

  test('Scenario A-2: agent 未超過 TTL 不被清除', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW']);

    const startedAt5MinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    stateLib.updateStateAtomic(sid, (s) => {
      s.activeAgents['developer:recent1'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: startedAt5MinAgo,
      };
      return s;
    });

    const currentState = stateLib.readState(sid);
    const result = detectAndCleanOrphans(sid, currentState);

    const updatedState = stateLib.readState(sid);
    expect(result.cleaned.length).toBe(0);
    expect(updatedState.activeAgents['developer:recent1']).toBeDefined();
  });

  test('Scenario A-3: 清除 orphan 後 loop 可正常繼續（不再 soft-release 卡住）', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW']);

    // DEV stage 設為 active + 有超時 orphan
    const startedAt20MinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    stateLib.updateStateAtomic(sid, (s) => {
      s.stages.DEV.status = 'active';
      s.activeAgents['developer:orphan2'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: startedAt20MinAgo,
      };
      return s;
    });

    loopLib.writeLoop(sid, {
      iteration: 1,
      stopped: false,
      consecutiveErrors: 0,
      startedAt: new Date().toISOString(),
    });

    const result = handleSessionStop({ cwd: '/tmp' }, sid);

    // orphan 清除後，DEV 仍為 active（orphan 清除不改 stage status），
    // 但 getNextStageHint 不再誤以為有 agent 在執行（activeAgents 已空）
    // → loop 應 block 而非 soft-release
    expect(result.output.decision).toBe('block');
    expect(result.output.result).toBeUndefined();
  });
});

// ── Feature B: 邊界條件 ──

describe('Feature B: detectAndCleanOrphans — 邊界條件', () => {

  test('Scenario B-1: entry 缺少 startedAt 欄位時跳過（不清除）', () => {
    const sid = newSid();
    setupSession(sid, ['DEV']);

    stateLib.updateStateAtomic(sid, (s) => {
      s.activeAgents['developer:no-start'] = {
        agentName: 'developer',
        stage: 'DEV',
        // startedAt 缺失
      };
      return s;
    });

    const currentState = stateLib.readState(sid);
    expect(() => detectAndCleanOrphans(sid, currentState)).not.toThrow();

    const result = detectAndCleanOrphans(sid, currentState);
    expect(result.cleaned.length).toBe(0);

    const updatedState = stateLib.readState(sid);
    expect(updatedState.activeAgents['developer:no-start']).toBeDefined();
  });

  test('Scenario B-2: entry 的 startedAt 為非法 ISO 字串時跳過', () => {
    const sid = newSid();
    setupSession(sid, ['DEV']);

    stateLib.updateStateAtomic(sid, (s) => {
      s.activeAgents['developer:bad-date'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: 'not-a-date',
      };
      return s;
    });

    const currentState = stateLib.readState(sid);
    expect(() => detectAndCleanOrphans(sid, currentState)).not.toThrow();

    const result = detectAndCleanOrphans(sid, currentState);
    expect(result.cleaned.length).toBe(0);
  });

  test('Scenario B-2b: startedAt 為 null 時跳過', () => {
    const sid = newSid();
    setupSession(sid, ['DEV']);

    stateLib.updateStateAtomic(sid, (s) => {
      s.activeAgents['developer:null-date'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: null,
      };
      return s;
    });

    const currentState = stateLib.readState(sid);
    expect(() => detectAndCleanOrphans(sid, currentState)).not.toThrow();

    const result = detectAndCleanOrphans(sid, currentState);
    expect(result.cleaned.length).toBe(0);
  });

  test('Scenario B-3: activeAgents 為空物件時回傳 { cleaned: [] }', () => {
    const sid = newSid();
    setupSession(sid, ['DEV']);

    const currentState = stateLib.readState(sid);
    // 確保 activeAgents 為空
    expect(Object.keys(currentState.activeAgents).length).toBe(0);

    const result = detectAndCleanOrphans(sid, currentState);
    expect(result).toEqual({ cleaned: [] });
  });

  test('Scenario B-4: 多筆 orphan 同時清除，回傳所有清除記錄', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW', 'TEST']);

    const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    stateLib.updateStateAtomic(sid, (s) => {
      s.activeAgents['developer:old1'] = { agentName: 'developer', stage: 'DEV', startedAt: oldTime };
      s.activeAgents['reviewer:old2'] = { agentName: 'reviewer', stage: 'REVIEW', startedAt: oldTime };
      s.activeAgents['tester:recent'] = { agentName: 'tester', stage: 'TEST', startedAt: recentTime };
      return s;
    });

    const currentState = stateLib.readState(sid);
    const result = detectAndCleanOrphans(sid, currentState);

    expect(result.cleaned.length).toBe(2);
    const cleanedIds = result.cleaned.map((c) => c.instanceId);
    expect(cleanedIds).toContain('developer:old1');
    expect(cleanedIds).toContain('reviewer:old2');

    const updatedState = stateLib.readState(sid);
    expect(updatedState.activeAgents['tester:recent']).toBeDefined();
    expect(updatedState.activeAgents['developer:old1']).toBeUndefined();
    expect(updatedState.activeAgents['reviewer:old2']).toBeUndefined();
  });

  test('Scenario B-5: 並行競爭 — 目標 key 已不存在時 delete 為 no-op', () => {
    const sid = newSid();
    setupSession(sid, ['DEV']);

    const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    // 建立 entry 再手動刪除（模擬 SubagentStop 先清除）
    stateLib.updateStateAtomic(sid, (s) => {
      s.activeAgents['developer:already-gone'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: oldTime,
      };
      return s;
    });

    // 模擬 SubagentStop 已先刪除
    stateLib.updateStateAtomic(sid, (s) => {
      delete s.activeAgents['developer:already-gone'];
      return s;
    });

    // 傳入舊 state（仍有此 entry）給 detectAndCleanOrphans
    const staleState = {
      activeAgents: {
        'developer:already-gone': { agentName: 'developer', stage: 'DEV', startedAt: oldTime },
      },
    };

    expect(() => detectAndCleanOrphans(sid, staleState)).not.toThrow();
    // delete 不存在的 key 為 no-op，不影響其他 entry
  });
});

// ── Feature C: 靜態文件掃描 ──

describe('Feature C: checkConcurrencyGuards — 靜態文件掃描', () => {
  let tmpDir;

  function makeTmpFsConMd(content) {
    const dir = path.join(os.tmpdir(), `ot-ccg2-static-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`);
    fs.mkdirSync(dir, { recursive: true });
    tmpDir = dir;
    const mdPath = path.join(dir, 'filesystem-concurrency.md');
    fs.writeFileSync(mdPath, content, 'utf8');
    return mdPath;
  }

  afterAll(() => {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  test('Scenario C-1: 包含完整 G1/G2/G3 記錄時靜態掃描回傳 0 findings', () => {
    const mdPath = makeTmpFsConMd('# 並發文件\n## G1 風險\n說明\n## G2 風險\n說明\n## G3 風險\n說明');
    const nonExistentSessionsDir = path.join(os.tmpdir(), `ot-no-sessions-${Date.now()}`);

    const findings = checkConcurrencyGuards({
      sessionsDirOverride: nonExistentSessionsDir,
      fsConMdOverride: mdPath,
    });

    const staticFindings = findings.filter((f) => f.message.includes('G1') || f.message.includes('G2') || f.message.includes('G3'));
    expect(staticFindings.length).toBe(0);
  });

  test('Scenario C-2: 缺少 G2 記錄時回傳 info finding 且 message 提及 G2', () => {
    const mdPath = makeTmpFsConMd('# 並發文件\n## G1 風險\n說明\n## G3 風險\n說明');
    const nonExistentSessionsDir = path.join(os.tmpdir(), `ot-no-sessions-${Date.now()}`);

    const findings = checkConcurrencyGuards({
      sessionsDirOverride: nonExistentSessionsDir,
      fsConMdOverride: mdPath,
    });

    const g2Findings = findings.filter((f) => f.message.includes('G2'));
    expect(g2Findings.length).toBeGreaterThanOrEqual(1);
    expect(g2Findings[0].severity).toBe('info');
  });

  test('Scenario C-3: filesystem-concurrency.md 不存在時不拋例外並回傳 info finding', () => {
    const nonExistentMd = path.join(os.tmpdir(), `ot-no-md-${Date.now()}.md`);
    const nonExistentSessionsDir = path.join(os.tmpdir(), `ot-no-sessions-${Date.now()}`);

    expect(() => checkConcurrencyGuards({
      sessionsDirOverride: nonExistentSessionsDir,
      fsConMdOverride: nonExistentMd,
    })).not.toThrow();

    const findings = checkConcurrencyGuards({
      sessionsDirOverride: nonExistentSessionsDir,
      fsConMdOverride: nonExistentMd,
    });

    const infoFindings = findings.filter((f) => f.severity === 'info');
    expect(infoFindings.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Feature D: Runtime 掃描 ──

describe('Feature D: checkConcurrencyGuards — Runtime 掃描', () => {
  let tmpSessionsDir;
  let fsConMdPath;

  beforeAll(() => {
    // 建立臨時 sessions 目錄
    tmpSessionsDir = path.join(os.tmpdir(), `ot-ccg2-sessions-${Date.now()}`);
    fs.mkdirSync(tmpSessionsDir, { recursive: true });

    // 建立完整的 filesystem-concurrency.md 避免靜態 findings 干擾
    const mdDir = path.join(os.tmpdir(), `ot-ccg2-md-${Date.now()}`);
    fs.mkdirSync(mdDir, { recursive: true });
    fsConMdPath = path.join(mdDir, 'filesystem-concurrency.md');
    fs.writeFileSync(fsConMdPath, '# G1 G2 G3', 'utf8');
  });

  afterAll(() => {
    try { fs.rmSync(tmpSessionsDir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(path.dirname(fsConMdPath), { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test('Scenario D-1: active session 有超時 orphan 時回傳 warning finding', () => {
    const sessionId = `d1-${Date.now()}`;
    const sessionDir = path.join(tmpSessionsDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const workflow = {
      workflowType: 'quick',
      activeAgents: {
        'developer:orphan-d1': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: oldTime,
        },
      },
    };
    fs.writeFileSync(path.join(sessionDir, 'workflow.json'), JSON.stringify(workflow), 'utf8');

    const findings = checkConcurrencyGuards({
      sessionsDirOverride: tmpSessionsDir,
      fsConMdOverride: fsConMdPath,
    });

    const warnings = findings.filter((f) => f.severity === 'warning');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    // finding 應包含 session 或 agent 識別資訊
    const orphanWarning = warnings.find((f) => f.message.includes('developer') || f.message.includes(sessionId));
    expect(orphanWarning).toBeDefined();
  });

  test('Scenario D-2: active session 無 orphan 時 runtime 掃描回傳 0 warning', () => {
    const sessionId = `d2-${Date.now()}`;
    const sessionDir = path.join(tmpSessionsDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const workflow = {
      workflowType: 'quick',
      activeAgents: {
        'developer:recent-d2': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: recentTime,
        },
      },
    };
    fs.writeFileSync(path.join(sessionDir, 'workflow.json'), JSON.stringify(workflow), 'utf8');

    const findings = checkConcurrencyGuards({
      sessionsDirOverride: tmpSessionsDir,
      fsConMdOverride: fsConMdPath,
    });

    // 只看此特定 session 的 warnings（排除 D-1 的殘留）
    const warningsForThisSession = findings.filter(
      (f) => f.severity === 'warning' && f.file && f.file.includes(sessionId),
    );
    expect(warningsForThisSession.length).toBe(0);
  });

  test('Scenario D-3: sessions 目錄不存在時靜默跳過不拋例外', () => {
    const nonExistentDir = path.join(os.tmpdir(), `ot-no-dir-${Date.now()}`);

    expect(() => checkConcurrencyGuards({
      sessionsDirOverride: nonExistentDir,
      fsConMdOverride: fsConMdPath,
    })).not.toThrow();

    const findings = checkConcurrencyGuards({
      sessionsDirOverride: nonExistentDir,
      fsConMdOverride: fsConMdPath,
    });

    const warnings = findings.filter((f) => f.severity === 'warning');
    expect(warnings.length).toBe(0);
  });

  test('Scenario D-4: workflow.json 損壞時靜默跳過', () => {
    const sessionId = `d4-${Date.now()}`;
    const sessionDir = path.join(tmpSessionsDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'workflow.json'), '{ broken json', 'utf8');

    expect(() => checkConcurrencyGuards({
      sessionsDirOverride: tmpSessionsDir,
      fsConMdOverride: fsConMdPath,
    })).not.toThrow();

    // 損壞的 session 不應產生 error finding（只 skip）
    const findings = checkConcurrencyGuards({
      sessionsDirOverride: tmpSessionsDir,
      fsConMdOverride: fsConMdPath,
    });
    const errorsForThis = findings.filter(
      (f) => f.severity === 'error' && f.file && f.file.includes(sessionId),
    );
    expect(errorsForThis.length).toBe(0);
  });

  test('Scenario D-5b: startedAt 為 null 時不產生 false positive warning', () => {
    const sessionId = `d5b-${Date.now()}`;
    const sessionDir = path.join(tmpSessionsDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'workflow.json'),
      JSON.stringify({
        workflowType: 'quick',
        activeAgents: {
          'developer:null-start': { agentName: 'developer', stage: 'DEV', startedAt: null },
        },
      }),
      'utf8',
    );

    const findings = checkConcurrencyGuards({
      sessionsDirOverride: tmpSessionsDir,
      fsConMdOverride: fsConMdPath,
    });

    const warningsForThis = findings.filter(
      (f) => f.severity === 'warning' && f.file && f.file.includes(sessionId),
    );
    expect(warningsForThis.length).toBe(0);
  });

  test('Scenario D-5: activeAgents 欄位缺失的 workflow.json 靜默跳過', () => {
    const sessionId = `d5-${Date.now()}`;
    const sessionDir = path.join(tmpSessionsDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'workflow.json'),
      JSON.stringify({ workflowType: 'quick' }),
      'utf8',
    );

    expect(() => checkConcurrencyGuards({
      sessionsDirOverride: tmpSessionsDir,
      fsConMdOverride: fsConMdPath,
    })).not.toThrow();

    const findings = checkConcurrencyGuards({
      sessionsDirOverride: tmpSessionsDir,
      fsConMdOverride: fsConMdPath,
    });
    const findingsForThis = findings.filter(
      (f) => f.file && f.file.includes(sessionId),
    );
    expect(findingsForThis.length).toBe(0);
  });
});

// ── Feature E: timeline 事件格式 ──

describe('Feature E: agent:orphan-cleanup timeline 事件格式', () => {

  test('Scenario E-1: 清除記錄包含所有必要欄位且值型別正確', () => {
    const sid = newSid();
    setupSession(sid, ['DEV']);

    const oldTime = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    stateLib.updateStateAtomic(sid, (s) => {
      s.activeAgents['developer:e1test'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: oldTime,
      };
      return s;
    });

    const currentState = stateLib.readState(sid);
    const result = detectAndCleanOrphans(sid, currentState);

    expect(result.cleaned.length).toBe(1);
    const entry = result.cleaned[0];

    expect(typeof entry.instanceId).toBe('string');
    expect(entry.instanceId).toBe('developer:e1test');
    expect(typeof entry.agentName).toBe('string');
    expect(entry.agentName).toBe('developer');
    expect(typeof entry.ageMs).toBe('number');
    expect(entry.ageMs).toBeGreaterThan(ORPHAN_TTL_MS);
    expect(typeof entry.ttlMs).toBe('number');
    expect(entry.ttlMs).toBe(900000); // 15 * 60 * 1000
  });

  test('Scenario E-2: ORPHAN_TTL_MS 常數值為 900000（15 分鐘）', () => {
    expect(ORPHAN_TTL_MS).toBe(900000);
  });

  test('Scenario E-2b: checkConcurrencyGuards 的 finding check 欄位為 "concurrency-guards"', () => {
    // 建立有 orphan 的測試場景
    const tmpDir = path.join(os.tmpdir(), `ot-ccg2-e2b-${Date.now()}`);
    const sessionsDir = path.join(tmpDir, 'sessions');
    const sessionDir = path.join(sessionsDir, 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const mdDir = path.join(tmpDir, 'md');
    fs.mkdirSync(mdDir, { recursive: true });
    const mdPath = path.join(mdDir, 'filesystem-concurrency.md');
    fs.writeFileSync(mdPath, '# G1 G2 G3', 'utf8');

    const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    fs.writeFileSync(
      path.join(sessionDir, 'workflow.json'),
      JSON.stringify({
        activeAgents: {
          'developer:e2b': { agentName: 'developer', stage: 'DEV', startedAt: oldTime },
        },
      }),
      'utf8',
    );

    const findings = checkConcurrencyGuards({
      sessionsDirOverride: sessionsDir,
      fsConMdOverride: mdPath,
    });

    for (const f of findings) {
      expect(f.check).toBe('concurrency-guards');
    }

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});
