'use strict';
/**
 * s15b-cross-session-state.test.js — S15b 跨 Session 狀態管理驗證整合測試
 *
 * 覆蓋以下四個驗證面向：
 *   1. PreCompact Hook — Workflow Context 注入
 *      驗證 PreCompact hook 在有活躍 workflow 時正確注入 systemMessage，
 *      包含 currentStage、workflowType 等關鍵資訊；無 workflow 時回傳 { result: '' }
 *
 *   2. Loop Restart State Recovery
 *      驗證 Loop 系統在重啟後能正確讀取既有 loop state，
 *      以及 writeLoop/readLoop 的往返一致性
 *
 *   3. Compact-Count.json 精確度
 *      驗證 PreCompact hook 正確追蹤 auto/manual compact 計數，
 *      包含首次 compact、連續多次、不同 trigger 類型
 *
 *   4. SessionEnd 清理完整性
 *      驗證 SessionEnd hook 在 session 結束時正確設定 loop.json stopped，
 *      並在 stopped=false 時 emit session:end timeline 事件
 *
 * 測試策略：使用 Bun.spawnSync 執行真實 hook 子進程，
 * 同時搭配直接呼叫 lib API 驗證跨 session 狀態一致性。
 */

const { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } = require('bun:test');
const { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const PRE_COMPACT_PATH = join(HOOKS_DIR, 'session', 'pre-compact.js');
const SESSION_END_PATH = join(HOOKS_DIR, 'session', 'on-session-end.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));
const loopLib = require(join(SCRIPTS_LIB, 'loop'));

// ── 時戳前綴，確保測試 session ID 唯一 ──

const TS = Date.now();

// ── 輔助函式 ──

/**
 * 執行 pre-compact.js hook 子進程
 * @param {object} input - stdin JSON
 * @param {object} extraEnv - 額外環境變數
 */
function runPreCompact(input, extraEnv = {}) {
  const proc = Bun.spawnSync(['node', PRE_COMPACT_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: '',
      OVERTONE_NO_DASHBOARD: '1',
      ...extraEnv,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
  };
}

/**
 * 執行 on-session-end.js hook 子進程
 * @param {object} input - stdin JSON
 * @param {string} sessionId - session ID（設入 env）
 */
function runSessionEnd(input, sessionId) {
  const env = {
    ...process.env,
    OVERTONE_NO_DASHBOARD: '1',
  };
  // 顯式刪除後設定，避免殘餘值干擾
  delete env.CLAUDE_SESSION_ID;
  if (sessionId) env.CLAUDE_SESSION_ID = sessionId;

  const proc = Bun.spawnSync(['node', SESSION_END_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
    parsed: (() => {
      try {
        return JSON.parse(proc.stdout ? new TextDecoder().decode(proc.stdout) : '');
      } catch {
        return null;
      }
    })(),
  };
}

/**
 * 讀取 timeline.jsonl 並解析所有事件
 * @param {string} sessionId
 */
function readTimeline(sessionId) {
  const timelinePath = paths.session.timeline(sessionId);
  if (!existsSync(timelinePath)) return [];
  const raw = readFileSync(timelinePath, 'utf8');
  return raw.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

/**
 * 讀取 compact-count.json
 * @param {string} sessionId
 * @returns {{ auto: number, manual: number } | null}
 */
function readCompactCount(sessionId) {
  try {
    const raw = readFileSync(paths.session.compactCount(sessionId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════
// 1. PreCompact Hook — Workflow Context 注入
// ══════════════════════════════════════════════════════════════════

describe('1. PreCompact Hook — Workflow Context 注入', () => {
  const SESSION_WITH_WF   = `s15b-cs-precompact-wf-${TS}`;
  const SESSION_NO_WF     = `s15b-cs-precompact-nowf-${TS}`;
  const SESSION_PARTIAL   = `s15b-cs-precompact-partial-${TS}`;

  beforeAll(() => {
    // 初始化含 workflow 的 session（standard workflow，PLAN+ARCH completed）
    stateLib.initState(SESSION_WITH_WF, 'standard',
      ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    stateLib.updateStage(SESSION_WITH_WF, 'PLAN', { status: 'completed', result: 'pass' });
    stateLib.updateStage(SESSION_WITH_WF, 'ARCH', { status: 'completed', result: 'pass' });

    // 初始化只完成一半的 session（quick workflow，DEV only）
    stateLib.initState(SESSION_PARTIAL, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    // SESSION_NO_WF 刻意不初始化 workflow
  });

  afterAll(() => {
    rmSync(paths.sessionDir(SESSION_WITH_WF), { recursive: true, force: true });
    rmSync(paths.sessionDir(SESSION_NO_WF), { recursive: true, force: true });
    rmSync(paths.sessionDir(SESSION_PARTIAL), { recursive: true, force: true });
  });

  // Scenario 1a: 有 workflow 時 systemMessage 包含 workflowType
  test('有 workflow 時 systemMessage 包含 workflowType', () => {
    const result = runPreCompact({ session_id: SESSION_WITH_WF });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.systemMessage).toBeDefined();
    expect(output.systemMessage).toContain('工作流：standard');
  });

  // Scenario 1b: systemMessage 包含 currentStage（ARCH 完成後進入 TEST）
  test('有 workflow 時 systemMessage 包含 currentStage 資訊', () => {
    const result = runPreCompact({ session_id: SESSION_WITH_WF });
    const { systemMessage } = JSON.parse(result.stdout);
    // currentStage 是 TEST（PLAN、ARCH 完成後推進到 TEST:1）
    expect(systemMessage).toContain('目前階段');
  });

  // Scenario 1c: systemMessage 開頭標記
  test('有 workflow 時 systemMessage 以 [Overtone 狀態恢復（compact 後）] 開頭', () => {
    const result = runPreCompact({ session_id: SESSION_WITH_WF });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage.startsWith('[Overtone 狀態恢復（compact 後）]')).toBe(true);
  });

  // Scenario 1d: systemMessage 包含進度條（已完成 stage 有 emoji 標記）
  test('有 workflow 時 systemMessage 包含進度條，✅ 標記已完成 stage', () => {
    const result = runPreCompact({ session_id: SESSION_WITH_WF });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('進度：');
    expect(systemMessage).toContain('✅');
    expect(systemMessage).toContain('⬜');
  });

  // Scenario 1e: 無 workflow 時回傳 { result: '' }（無 systemMessage）
  test('無 workflow 時回傳 { result: "" }，不含 systemMessage', () => {
    const result = runPreCompact({ session_id: SESSION_NO_WF });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toEqual({ result: '' });
    expect(output.systemMessage).toBeUndefined();
  });

  // Scenario 1f: 無 session ID 時回傳 { result: '' }
  test('無 session_id 時回傳 { result: "" }', () => {
    const result = runPreCompact({});
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ result: '' });
  });

  // Scenario 1g: 含 featureName 的 workflow 在 systemMessage 中顯示
  test('workflow 有 featureName 時 systemMessage 包含 Feature 行', () => {
    const SESSION_FEAT = `s15b-cs-precompact-feat-${TS}`;
    stateLib.initState(SESSION_FEAT, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO'],
      { featureName: 'my-cross-session-feature' });
    try {
      const result = runPreCompact({ session_id: SESSION_FEAT });
      const { systemMessage } = JSON.parse(result.stdout);
      expect(systemMessage).toContain('Feature：my-cross-session-feature');
    } finally {
      rmSync(paths.sessionDir(SESSION_FEAT), { recursive: true, force: true });
    }
  });

  // Scenario 1h: quick workflow 部分完成時 systemMessage 包含正確的 workflowType
  test('quick workflow 部分完成時 systemMessage 包含 workflowType: quick', () => {
    const result = runPreCompact({ session_id: SESSION_PARTIAL });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('工作流：quick');
  });

  // Scenario 1i: systemMessage 包含行動指引
  test('有 workflow 時 systemMessage 末尾包含禁止詢問行動指引', () => {
    const result = runPreCompact({ session_id: SESSION_WITH_WF });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('⛔ 禁止詢問使用者「我該繼續嗎？」');
    expect(systemMessage).toContain('/ot:auto');
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. Loop Restart State Recovery
// ══════════════════════════════════════════════════════════════════

describe('2. Loop Restart State Recovery — 跨 session 狀態讀取', () => {
  const SESSION_LOOP = `s15b-cs-loop-${TS}`;
  const SESSION_DIR = paths.sessionDir(SESSION_LOOP);

  beforeEach(() => {
    mkdirSync(SESSION_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(SESSION_DIR, { recursive: true, force: true });
  });

  // Scenario 2a: 既有 loop.json 可被正確讀取
  test('預先寫入的 loop.json 可被 readLoop 正確讀取', () => {
    const loopData = {
      iteration: 7,
      stopped: false,
      consecutiveErrors: 2,
      startedAt: new Date().toISOString(),
    };
    writeFileSync(paths.session.loop(SESSION_LOOP), JSON.stringify(loopData, null, 2), 'utf8');

    // 模擬「重啟後」讀取 — readLoop 應直接回傳既有狀態
    const result = loopLib.readLoop(SESSION_LOOP);
    expect(result.iteration).toBe(7);
    expect(result.stopped).toBe(false);
    expect(result.consecutiveErrors).toBe(2);
  });

  // Scenario 2b: 多欄位的 loop state 完整保留
  test('writeLoop + readLoop 往返一致（所有欄位完整保留）', () => {
    const originalData = {
      iteration: 12,
      stopped: false,
      consecutiveErrors: 0,
      startedAt: '2026-03-01T10:00:00.000Z',
      stopReason: undefined,
    };
    loopLib.writeLoop(SESSION_LOOP, originalData);
    const readBack = loopLib.readLoop(SESSION_LOOP);

    expect(readBack.iteration).toBe(12);
    expect(readBack.stopped).toBe(false);
    expect(readBack.consecutiveErrors).toBe(0);
    expect(readBack.startedAt).toBe('2026-03-01T10:00:00.000Z');
  });

  // Scenario 2c: loop.json 不存在時自動初始化（模擬全新 session 重啟）
  test('loop.json 不存在時 readLoop 自動初始化並回傳正確預設值', () => {
    // SESSION_DIR 存在但無 loop.json
    const result = loopLib.readLoop(SESSION_LOOP);
    expect(result.iteration).toBe(0);
    expect(result.stopped).toBe(false);
    expect(result.consecutiveErrors).toBe(0);
    expect(typeof result.startedAt).toBe('string');
    // 自動寫入 loop.json
    expect(existsSync(paths.session.loop(SESSION_LOOP))).toBe(true);
  });

  // Scenario 2d: stopped=true 的既有狀態能被正確讀回（防止 loop 重啟後誤繼續）
  test('stopped=true 的既有 loop 狀態被 readLoop 正確讀回', () => {
    const stoppedData = {
      iteration: 5,
      stopped: true,
      consecutiveErrors: 0,
      startedAt: new Date().toISOString(),
      stoppedAt: new Date().toISOString(),
      stopReason: '工作流完成',
    };
    loopLib.writeLoop(SESSION_LOOP, stoppedData);
    const result = loopLib.readLoop(SESSION_LOOP);

    expect(result.stopped).toBe(true);
    expect(result.stopReason).toBe('工作流完成');
    expect(result.stoppedAt).toBeDefined();
  });

  // Scenario 2e: exitLoop 正確設定 stopped 狀態並 emit timeline 事件
  test('exitLoop 設定 stopped=true 並寫回 loop.json', () => {
    const loopData = {
      iteration: 3,
      stopped: false,
      consecutiveErrors: 0,
      startedAt: new Date().toISOString(),
    };
    loopLib.writeLoop(SESSION_LOOP, loopData);
    loopLib.exitLoop(SESSION_LOOP, loopData, '測試完成');

    // 確認 in-memory loopData 已被修改
    expect(loopData.stopped).toBe(true);
    expect(loopData.stopReason).toBe('測試完成');

    // 確認磁碟上的 loop.json 也已更新
    const savedData = loopLib.readLoop(SESSION_LOOP);
    expect(savedData.stopped).toBe(true);
    expect(savedData.stopReason).toBe('測試完成');
    expect(typeof savedData.stoppedAt).toBe('string');
  });

  // Scenario 2f: writeLoop 不留殘餘 .tmp 檔案（atomicWrite 行為）
  test('writeLoop 使用 atomic write，不留殘餘 .tmp 檔案', () => {
    loopLib.writeLoop(SESSION_LOOP, { iteration: 0, stopped: false });
    const files = require('fs').readdirSync(SESSION_DIR);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. Compact-Count.json 精確度
// ══════════════════════════════════════════════════════════════════

describe('3. Compact-Count.json 精確度', () => {
  const SESSION_COUNT_AUTO    = `s15b-cs-count-auto-${TS}`;
  const SESSION_COUNT_MANUAL  = `s15b-cs-count-manual-${TS}`;
  const SESSION_COUNT_MIXED   = `s15b-cs-count-mixed-${TS}`;
  const SESSION_COUNT_MULTI   = `s15b-cs-count-multi-${TS}`;

  beforeAll(() => {
    // 為每個 session 初始化 workflow state
    for (const sid of [SESSION_COUNT_AUTO, SESSION_COUNT_MANUAL, SESSION_COUNT_MIXED, SESSION_COUNT_MULTI]) {
      stateLib.initState(sid, 'single', ['DEV']);
    }
  });

  afterAll(() => {
    for (const sid of [SESSION_COUNT_AUTO, SESSION_COUNT_MANUAL, SESSION_COUNT_MIXED, SESSION_COUNT_MULTI]) {
      rmSync(paths.sessionDir(sid), { recursive: true, force: true });
    }
  });

  // Scenario 3a: 首次 auto compact 建立 compact-count.json（auto: 1, manual: 0）
  test('首次 trigger=auto compact 後 compact-count.json 存在且 auto=1', () => {
    const result = runPreCompact({ session_id: SESSION_COUNT_AUTO, trigger: 'auto' });
    expect(result.exitCode).toBe(0);

    const countData = readCompactCount(SESSION_COUNT_AUTO);
    expect(countData).not.toBeNull();
    expect(countData.auto).toBe(1);
    expect(countData.manual).toBe(0);
  });

  // Scenario 3b: 首次 manual compact（非 auto trigger）建立 compact-count.json（auto: 0, manual: 1）
  test('首次 trigger=manual compact 後 compact-count.json auto=0, manual=1', () => {
    const result = runPreCompact({ session_id: SESSION_COUNT_MANUAL, trigger: 'manual' });
    expect(result.exitCode).toBe(0);

    const countData = readCompactCount(SESSION_COUNT_MANUAL);
    expect(countData).not.toBeNull();
    expect(countData.auto).toBe(0);
    expect(countData.manual).toBe(1);
  });

  // Scenario 3c: 無 trigger 欄位時預設歸類為 auto（Claude Code auto-compact 可能不送 trigger）
  test('無 trigger 欄位時計為 auto', () => {
    const result = runPreCompact({ session_id: SESSION_COUNT_MIXED });
    expect(result.exitCode).toBe(0);

    const countData = readCompactCount(SESSION_COUNT_MIXED);
    expect(countData).not.toBeNull();
    expect(countData.auto).toBe(1);
    expect(countData.manual).toBe(0);
  });

  // Scenario 3d: 連續 3 次 auto compact 後 auto count = 3
  test('連續 3 次 auto compact 後 auto count 累積為 3', () => {
    // 執行 3 次 auto compact
    runPreCompact({ session_id: SESSION_COUNT_MULTI, trigger: 'auto' });
    runPreCompact({ session_id: SESSION_COUNT_MULTI, trigger: 'auto' });
    runPreCompact({ session_id: SESSION_COUNT_MULTI, trigger: 'auto' });

    const countData = readCompactCount(SESSION_COUNT_MULTI);
    expect(countData).not.toBeNull();
    expect(countData.auto).toBe(3);
    expect(countData.manual).toBe(0);
  });

  // Scenario 3e: 混合 auto + manual compact 後各自計數正確
  test('2 auto + 1 manual compact 後 auto=2, manual=1', () => {
    const SESSION_MIX2 = `s15b-cs-count-mix2-${TS}`;
    stateLib.initState(SESSION_MIX2, 'single', ['DEV']);
    try {
      runPreCompact({ session_id: SESSION_MIX2, trigger: 'auto' });
      runPreCompact({ session_id: SESSION_MIX2, trigger: 'auto' });
      runPreCompact({ session_id: SESSION_MIX2, trigger: 'manual' });

      const countData = readCompactCount(SESSION_MIX2);
      expect(countData).not.toBeNull();
      expect(countData.auto).toBe(2);
      expect(countData.manual).toBe(1);
    } finally {
      rmSync(paths.sessionDir(SESSION_MIX2), { recursive: true, force: true });
    }
  });

  // Scenario 3f: compact-count.json 位於正確的 session 目錄路徑
  test('compact-count.json 位於 ~/.overtone/sessions/{sessionId}/compact-count.json', () => {
    const SESSION_PATH_CHECK = `s15b-cs-count-path-${TS}`;
    stateLib.initState(SESSION_PATH_CHECK, 'single', ['DEV']);
    try {
      runPreCompact({ session_id: SESSION_PATH_CHECK, trigger: 'auto' });
      const expectedPath = paths.session.compactCount(SESSION_PATH_CHECK);
      expect(existsSync(expectedPath)).toBe(true);
    } finally {
      rmSync(paths.sessionDir(SESSION_PATH_CHECK), { recursive: true, force: true });
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. SessionEnd 清理完整性
// ══════════════════════════════════════════════════════════════════

describe('4. SessionEnd 清理完整性', () => {
  // 每個測試用獨立 session ID
  const SESSION_PREFIX = `s15b-cs-end-${TS}`;
  let testCounter = 0;
  const createdSessions = [];

  function newSession() {
    const id = `${SESSION_PREFIX}-${++testCounter}`;
    createdSessions.push(id);
    mkdirSync(paths.sessionDir(id), { recursive: true });
    return id;
  }

  afterAll(() => {
    for (const sid of createdSessions) {
      rmSync(paths.sessionDir(sid), { recursive: true, force: true });
    }
  });

  // Scenario 4a: stopped=false 時 emit session:end 並將 loop.json 設為 stopped=true
  test('loop.json stopped=false 時 emit session:end 並設為 stopped=true', () => {
    const sid = newSession();
    writeFileSync(paths.session.loop(sid), JSON.stringify({ stopped: false, iteration: 3 }, null, 2), 'utf8');

    const { exitCode } = runSessionEnd({ session_id: sid, reason: 'prompt_input_exit' }, sid);
    expect(exitCode).toBe(0);

    // 確認 timeline 有 session:end 事件
    const events = readTimeline(sid);
    const sessionEndEvent = events.find(e => e.type === 'session:end');
    expect(sessionEndEvent).toBeDefined();

    // 確認 loop.json 已設為 stopped=true
    const loopData = JSON.parse(readFileSync(paths.session.loop(sid), 'utf8'));
    expect(loopData.stopped).toBe(true);
  });

  // Scenario 4b: stopped=true 時不重複 emit session:end（防止重複事件）
  test('loop.json 已為 stopped=true 時不 emit session:end（防止重複）', () => {
    const sid = newSession();
    writeFileSync(paths.session.loop(sid), JSON.stringify({ stopped: true, iteration: 5 }, null, 2), 'utf8');

    runSessionEnd({ session_id: sid, reason: 'prompt_input_exit' }, sid);

    const events = readTimeline(sid);
    const sessionEndEvents = events.filter(e => e.type === 'session:end');
    expect(sessionEndEvents.length).toBe(0);
  });

  // Scenario 4c: loop.json 不存在時 hook 正常執行並 emit session:end
  test('loop.json 不存在時 hook 正常執行，emit session:end', () => {
    const sid = newSession();
    // 刻意不建立 loop.json

    const { exitCode } = runSessionEnd({ session_id: sid, reason: 'prompt_input_exit' }, sid);
    expect(exitCode).toBe(0);

    // 無 loop.json 時視為 stopped=false → 應 emit session:end
    const events = readTimeline(sid);
    const sessionEndEvent = events.find(e => e.type === 'session:end');
    expect(sessionEndEvent).toBeDefined();
  });

  // Scenario 4d: session:end 事件包含正確的 reason
  test('session:end 事件包含正確的 reason 欄位', () => {
    const sid = newSession();
    writeFileSync(paths.session.loop(sid), JSON.stringify({ stopped: false }, null, 2), 'utf8');

    runSessionEnd({ session_id: sid, reason: 'clear' }, sid);

    const events = readTimeline(sid);
    const sessionEndEvent = events.find(e => e.type === 'session:end');
    expect(sessionEndEvent).toBeDefined();
    expect(sessionEndEvent.reason).toBe('clear');
  });

  // Scenario 4e: reason=logout 時正常執行清理
  test('reason=logout 時 hook 正常執行（exit 0）', () => {
    const sid = newSession();
    writeFileSync(paths.session.loop(sid), JSON.stringify({ stopped: false }, null, 2), 'utf8');

    const { exitCode, parsed } = runSessionEnd({ session_id: sid, reason: 'logout' }, sid);
    expect(exitCode).toBe(0);
    expect(parsed).not.toBeNull();
    expect(typeof parsed.result).toBe('string');
  });

  // Scenario 4f: loop.json 其他欄位在 stopped=true 後保留
  test('設定 stopped=true 後 loop.json 其他欄位（iteration）不被清除', () => {
    const sid = newSession();
    writeFileSync(paths.session.loop(sid), JSON.stringify({ stopped: false, iteration: 9 }, null, 2), 'utf8');

    runSessionEnd({ session_id: sid, reason: 'prompt_input_exit' }, sid);

    const loopData = JSON.parse(readFileSync(paths.session.loop(sid), 'utf8'));
    expect(loopData.stopped).toBe(true);
    expect(loopData.iteration).toBe(9);
  });

  // Scenario 4g: 無 session_id 時靜默退出（exit 0，result 為空字串）
  test('無 session_id 時 hook 靜默退出（exit 0，result=""）', () => {
    const { exitCode, parsed } = runSessionEnd({ reason: 'prompt_input_exit' }, undefined);
    expect(exitCode).toBe(0);
    expect(parsed.result).toBe('');
  });

  // Scenario 4h: 跨 session 狀態隔離（SessionEnd 不影響其他 session）
  test('session A 結束後 session B 的 loop 狀態不受影響', () => {
    const sidA = newSession();
    const sidB = newSession();

    writeFileSync(paths.session.loop(sidA), JSON.stringify({ stopped: false, iteration: 1 }, null, 2), 'utf8');
    writeFileSync(paths.session.loop(sidB), JSON.stringify({ stopped: false, iteration: 2 }, null, 2), 'utf8');

    // 結束 session A
    runSessionEnd({ session_id: sidA, reason: 'prompt_input_exit' }, sidA);

    // session B 的 loop.json 不應被修改
    const loopB = JSON.parse(readFileSync(paths.session.loop(sidB), 'utf8'));
    expect(loopB.stopped).toBe(false);
    expect(loopB.iteration).toBe(2);
  });
});
