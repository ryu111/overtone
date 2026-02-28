'use strict';
/**
 * pre-compact.test.js — PreCompact hook 整合測試
 *
 * 對應 BDD 規格 specs/features/in-progress/precompact-hook/bdd.md
 * 覆蓋：
 *   Feature 1: 無 sessionId 時靜默退出
 *   Feature 2: 有 workflow state 時組裝狀態摘要
 *   Feature 3: 有活躍 feature 時注入未完成任務清單
 *   Feature 4: systemMessage 長度截斷保護
 *   Feature 5: timeline 事件 session:compact
 *   Feature 6: 任何失敗 fallback 到 { result: '' }
 *   Feature 7: buildPendingTasksMessage 共用函式
 *   Feature 8: on-start.js 改用 buildPendingTasksMessage 後行為不變
 */

const { test, expect, describe, afterAll, beforeAll } = require('bun:test');
const { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const HOOK_PATH = join(HOOKS_DIR, 'session', 'pre-compact.js');
const ON_START_PATH = join(HOOKS_DIR, 'session', 'on-start.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));

// ── Session ID（每個 describe 獨立，加時戳避免衝突）──

const TS = Date.now();
const SESSION_NO_WF = `pre-compact-no-wf-${TS}`;
const SESSION_MAIN = `pre-compact-main-${TS}`;
const SESSION_FAIL = `pre-compact-fail-${TS}`;
const SESSION_FEAT = `pre-compact-feat-${TS}`;
const SESSION_TRUNC = `pre-compact-trunc-${TS}`;
const SESSION_EMPTY_TASKS = `pre-compact-empty-${TS}`;
const SESSION_ON_START = `pre-compact-onstart-${TS}`;

// 暫存 projectRoot（specs 目錄隔離）
const TMP_ROOT = join(homedir(), '.overtone', 'test-tmp', `pre-compact-${TS}`);
const TMP_ROOT_TRUNC = join(homedir(), '.overtone', 'test-tmp', `pre-compact-trunc-${TS}`);
const TMP_ROOT_EMPTY = join(homedir(), '.overtone', 'test-tmp', `pre-compact-empty-${TS}`);
const TMP_ROOT_ONSTART = join(homedir(), '.overtone', 'test-tmp', `pre-compact-onstart-${TS}`);

// ── 標準 workflow state（standard workflow，2 個已完成，6 個未完成）──

const STANDARD_STAGES = ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS'];

// ── 輔助函式 ──

/**
 * 執行 pre-compact.js hook 子進程
 */
function runHook(input, extraEnv = {}) {
  const proc = Bun.spawnSync(['node', HOOK_PATH], {
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
 * 執行 on-start.js hook 子進程
 */
function runOnStart(input, extraEnv = {}) {
  const proc = Bun.spawnSync(['node', ON_START_PATH], {
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
 * 建立 in-progress feature 目錄與 tasks.md
 */
function createFeature(projectRoot, featureName, taskLines) {
  const dir = join(projectRoot, 'specs', 'features', 'in-progress', featureName);
  mkdirSync(dir, { recursive: true });
  const content = [
    '---',
    `feature: ${featureName}`,
    'status: in-progress',
    'workflow: standard',
    '---',
    '',
    '## Tasks',
    '',
    ...taskLines,
  ].join('\n');
  writeFileSync(join(dir, 'tasks.md'), content);
  return dir;
}

/**
 * 讀取 timeline.jsonl 並解析所有事件
 */
function readTimeline(sessionId) {
  const timelinePath = paths.session.timeline(sessionId);
  if (!existsSync(timelinePath)) return [];
  const raw = readFileSync(timelinePath, 'utf8');
  return raw.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

// ── 清理 ──

afterAll(() => {
  const allSessions = [SESSION_NO_WF, SESSION_MAIN, SESSION_FAIL, SESSION_FEAT, SESSION_TRUNC, SESSION_EMPTY_TASKS, SESSION_ON_START];
  for (const s of allSessions) {
    rmSync(paths.sessionDir(s), { recursive: true, force: true });
  }
  rmSync(TMP_ROOT, { recursive: true, force: true });
  rmSync(TMP_ROOT_TRUNC, { recursive: true, force: true });
  rmSync(TMP_ROOT_EMPTY, { recursive: true, force: true });
  rmSync(TMP_ROOT_ONSTART, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════════
// Feature 1: 無 sessionId 時靜默退出
// ══════════════════════════════════════════════════════════════════

describe('Feature 1：無 sessionId 時靜默退出', () => {
  // Scenario 1.1
  test('stdin 無 session_id 且無環境變數時輸出 {"result":""}', () => {
    const result = runHook({}, { CLAUDE_SESSION_ID: '' });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ result: '' });
    expect(JSON.parse(result.stdout).systemMessage).toBeUndefined();
  });

  // Scenario 1.2
  test('stdin 空字串時安全退出', () => {
    const proc = Bun.spawnSync(['node', HOOK_PATH], {
      stdin: Buffer.from(''),
      env: { ...process.env, CLAUDE_SESSION_ID: '', OVERTONE_NO_DASHBOARD: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : '';
    expect(proc.exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ result: '' });
  });

  // Scenario 1.3
  test('stdin 畸形 JSON 時安全退出', () => {
    const proc = Bun.spawnSync(['node', HOOK_PATH], {
      stdin: Buffer.from('{broken'),
      env: { ...process.env, CLAUDE_SESSION_ID: '', OVERTONE_NO_DASHBOARD: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : '';
    expect(proc.exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ result: '' });
  });

  // workflow.json 不存在時
  test('session_id 存在但 workflow.json 不存在時輸出 {"result":""}', () => {
    // SESSION_NO_WF 從未初始化 workflow.json
    const result = runHook({ session_id: SESSION_NO_WF });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ result: '' });
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: 有 workflow state 時組裝狀態摘要
// ══════════════════════════════════════════════════════════════════

describe('Feature 2：有 workflow state 時組裝狀態摘要', () => {
  beforeAll(() => {
    // 初始化 standard workflow（PLAN+ARCH completed，TEST 為 currentStage）
    stateLib.initState(SESSION_MAIN, 'standard', STANDARD_STAGES);
    // 設定 PLAN 和 ARCH 為 completed
    stateLib.updateStage(SESSION_MAIN, 'PLAN', { status: 'completed', result: 'pass' });
    stateLib.updateStage(SESSION_MAIN, 'ARCH', { status: 'completed', result: 'pass' });
  });

  // Scenario 2.1
  test('systemMessage 首行為 [Overtone 狀態恢復（compact 後）]', () => {
    const result = runHook({ session_id: SESSION_MAIN });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.systemMessage).toBeDefined();
    expect(output.systemMessage.startsWith('[Overtone 狀態恢復（compact 後）]')).toBe(true);
  });

  test('systemMessage 包含工作流類型', () => {
    const result = runHook({ session_id: SESSION_MAIN });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('工作流：standard');
  });

  test('systemMessage 包含進度條（✅ 標記 completed stage）', () => {
    const result = runHook({ session_id: SESSION_MAIN });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('進度：');
    expect(systemMessage).toContain('✅'); // PLAN, ARCH 已完成
    expect(systemMessage).toContain('⬜'); // 未完成的 stage
  });

  test('systemMessage 末尾包含行動指引', () => {
    const result = runHook({ session_id: SESSION_MAIN });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('⛔ 禁止詢問使用者「我該繼續嗎？」');
    expect(systemMessage).toContain('/ot:auto');
  });

  // Scenario 2.2: failCount > 0 時顯示失敗計數
  test('failCount > 0 時 systemMessage 包含失敗次數', () => {
    const ws = stateLib.readState(SESSION_MAIN);
    ws.failCount = 2;
    stateLib.writeState(SESSION_MAIN, ws);
    const result = runHook({ session_id: SESSION_MAIN });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('失敗次數：2/3');
    // 重置
    ws.failCount = 0;
    stateLib.writeState(SESSION_MAIN, ws);
  });

  // Scenario 2.3: rejectCount > 0
  test('rejectCount > 0 時 systemMessage 包含拒絕次數', () => {
    const ws = stateLib.readState(SESSION_MAIN);
    ws.rejectCount = 1;
    ws.failCount = 0;
    stateLib.writeState(SESSION_MAIN, ws);
    const result = runHook({ session_id: SESSION_MAIN });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('拒絕次數：1/3');
    expect(systemMessage).not.toContain('失敗次數');
    // 重置
    ws.rejectCount = 0;
    stateLib.writeState(SESSION_MAIN, ws);
  });

  // Scenario 2.2: failCount = 0 時不顯示失敗次數
  test('failCount = 0 時 systemMessage 不包含失敗次數行', () => {
    const ws = stateLib.readState(SESSION_MAIN);
    ws.failCount = 0;
    stateLib.writeState(SESSION_MAIN, ws);
    const result = runHook({ session_id: SESSION_MAIN });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).not.toContain('失敗次數');
  });

  // Scenario 2.3: rejectCount = 0 時不顯示拒絕次數
  test('rejectCount = 0 時 systemMessage 不包含拒絕次數行', () => {
    const ws = stateLib.readState(SESSION_MAIN);
    ws.rejectCount = 0;
    stateLib.writeState(SESSION_MAIN, ws);
    const result = runHook({ session_id: SESSION_MAIN });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).not.toContain('拒絕次數');
  });

  // Scenario 2.4: 有活躍 agent
  test('activeAgents 不為空時 systemMessage 包含活躍 Agents 行', () => {
    const ws = stateLib.readState(SESSION_MAIN);
    ws.activeAgents = { developer: { stage: 'DEV', startedAt: new Date().toISOString() } };
    stateLib.writeState(SESSION_MAIN, ws);
    const result = runHook({ session_id: SESSION_MAIN });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('活躍 Agents：developer（DEV）');
    // 重置
    ws.activeAgents = {};
    stateLib.writeState(SESSION_MAIN, ws);
  });

  // Scenario 2.5: 無活躍 agent
  test('activeAgents 為空時 systemMessage 不包含活躍 Agents 行', () => {
    const ws = stateLib.readState(SESSION_MAIN);
    ws.activeAgents = {};
    stateLib.writeState(SESSION_MAIN, ws);
    const result = runHook({ session_id: SESSION_MAIN });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).not.toContain('活躍 Agents');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 3: 有活躍 feature 時注入未完成任務清單
// ══════════════════════════════════════════════════════════════════

describe('Feature 3：有活躍 feature 時注入未完成任務清單', () => {
  const FEATURE_NAME = 'my-feature';

  beforeAll(() => {
    stateLib.initState(SESSION_FEAT, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    // 建立含 3 未完成 + 2 完成的 feature
    createFeature(TMP_ROOT, FEATURE_NAME, [
      '- [x] 已完成任務 A',
      '- [x] 已完成任務 B',
      '- [ ] 未完成任務 1',
      '- [ ] 未完成任務 2',
      '- [ ] 未完成任務 3',
    ]);
  });

  // Scenario 3.1
  test('有未完成任務時 systemMessage 包含 feature 名稱統計行', () => {
    const result = runHook({ session_id: SESSION_FEAT, cwd: TMP_ROOT });
    expect(result.exitCode).toBe(0);
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain(`Feature：${FEATURE_NAME}（2/5 完成）`);
  });

  test('systemMessage 包含未完成任務 checkbox 行', () => {
    const result = runHook({ session_id: SESSION_FEAT, cwd: TMP_ROOT });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('- [ ] 未完成任務 1');
    expect(systemMessage).toContain('- [ ] 未完成任務 2');
    expect(systemMessage).toContain('- [ ] 未完成任務 3');
  });

  test('systemMessage 包含 TaskCreate 提示', () => {
    const result = runHook({ session_id: SESSION_FEAT, cwd: TMP_ROOT });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('→ 請使用 TaskCreate 重建以上任務的 TaskList，然後繼續執行。');
  });

  // Scenario 3.2: 超過 5 個未完成任務時截斷
  test('超過 5 個未完成任務時只顯示前 5 個 + 剩餘計數', () => {
    const ROOT_8 = join(homedir(), '.overtone', 'test-tmp', `pre-compact-8tasks-${TS}`);
    const SESSION_8 = `pre-compact-8tasks-${TS}`;
    stateLib.initState(SESSION_8, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    createFeature(ROOT_8, 'eight-task-feature', [
      '- [ ] 任務 1',
      '- [ ] 任務 2',
      '- [ ] 任務 3',
      '- [ ] 任務 4',
      '- [ ] 任務 5',
      '- [ ] 任務 6',
      '- [ ] 任務 7',
      '- [ ] 任務 8',
    ]);
    const result = runHook({ session_id: SESSION_8, cwd: ROOT_8 });
    const { systemMessage } = JSON.parse(result.stdout);
    // 前 5 個出現，第 6 個不出現
    expect(systemMessage).toContain('- [ ] 任務 5');
    expect(systemMessage).not.toContain('- [ ] 任務 6');
    expect(systemMessage).toContain('... 還有 3 個');
    // 清理
    rmSync(ROOT_8, { recursive: true, force: true });
    rmSync(paths.sessionDir(SESSION_8), { recursive: true, force: true });
  });

  // Scenario 3.3: 全部完成時不注入任務清單
  test('所有任務完成時 systemMessage 不包含未完成任務段落', () => {
    stateLib.initState(SESSION_EMPTY_TASKS, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    createFeature(TMP_ROOT_EMPTY, 'all-done', ['- [x] 任務 A', '- [x] 任務 B']);
    const result = runHook({ session_id: SESSION_EMPTY_TASKS, cwd: TMP_ROOT_EMPTY });
    expect(result.exitCode).toBe(0);
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toBeDefined();
    expect(systemMessage).not.toContain('📋 **未完成任務**');
    expect(systemMessage).toContain('[Overtone 狀態恢復（compact 後）]');
  });

  // Scenario 3.4: 無活躍 feature 時不注入任務清單
  test('無活躍 feature 時 systemMessage 不包含未完成任務段落', () => {
    const ROOT_EMPTY_DIR = join(homedir(), '.overtone', 'test-tmp', `pre-compact-no-feature-${TS}`);
    const SESSION_NO_FEAT = `pre-compact-no-feat-${TS}`;
    stateLib.initState(SESSION_NO_FEAT, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    mkdirSync(join(ROOT_EMPTY_DIR, 'specs', 'features', 'in-progress'), { recursive: true });
    const result = runHook({ session_id: SESSION_NO_FEAT, cwd: ROOT_EMPTY_DIR });
    expect(result.exitCode).toBe(0);
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toBeDefined();
    expect(systemMessage).not.toContain('📋 **未完成任務**');
    // 清理
    rmSync(ROOT_EMPTY_DIR, { recursive: true, force: true });
    rmSync(paths.sessionDir(SESSION_NO_FEAT), { recursive: true, force: true });
  });

  // Scenario 3.5: specs 讀取失敗時跳過任務清單
  test('specs 讀取失敗時仍輸出 workflow 摘要（不拋錯）', () => {
    const SESSION_SPEC_ERR = `pre-compact-spec-err-${TS}`;
    stateLib.initState(SESSION_SPEC_ERR, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    // 傳入不存在的 cwd，specs.getActiveFeature 會讀取失敗
    const result = runHook({ session_id: SESSION_SPEC_ERR, cwd: '/nonexistent/path/xyz' });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.systemMessage).toBeDefined();
    expect(output.systemMessage).toContain('[Overtone 狀態恢復（compact 後）]');
    expect(output.systemMessage).not.toContain('📋 **未完成任務**');
    // 清理
    rmSync(paths.sessionDir(SESSION_SPEC_ERR), { recursive: true, force: true });
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 4: systemMessage 長度截斷保護
// ══════════════════════════════════════════════════════════════════

describe('Feature 4：systemMessage 長度截斷保護', () => {
  // Scenario 4.1: 未超過 2000 字元時完整輸出
  test('正常 systemMessage 不含截斷提示', () => {
    const SESSION_SHORT = `pre-compact-short-${TS}`;
    stateLib.initState(SESSION_SHORT, 'single', ['DEV']);
    const result = runHook({ session_id: SESSION_SHORT });
    expect(result.exitCode).toBe(0);
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).not.toContain('已截斷，完整狀態請查看');
    rmSync(paths.sessionDir(SESSION_SHORT), { recursive: true, force: true });
  });

  // Scenario 4.2: 超過 2000 字元時截斷
  test('systemMessage 超過 2000 字元時截斷並附提示', () => {
    const SESSION_LONG = `pre-compact-long-${TS}`;
    const ROOT_LONG = join(homedir(), '.overtone', 'test-tmp', `pre-compact-long-${TS}`);
    stateLib.initState(SESSION_LONG, 'full', ['PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV', 'REVIEW', 'TEST', 'QA', 'E2E', 'RETRO', 'DOCS']);
    // buildPendingTasksMessage 最多顯示 5 個任務，所以讓每個任務名稱非常長（各 ~400 字元）
    const longName = '這是一個極度冗長的任務名稱用來撐爆 systemMessage 的長度限制測試項目。'.repeat(12);
    const manyTasks = Array.from({ length: 5 }, (_, i) => `- [ ] ${longName} 第 ${i + 1} 個`);
    createFeature(ROOT_LONG, 'long-feature', manyTasks);
    const result = runHook({ session_id: SESSION_LONG, cwd: ROOT_LONG });
    expect(result.exitCode).toBe(0);
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage.length).toBeLessThanOrEqual(2000);
    expect(systemMessage).toContain('已截斷，完整狀態請查看 workflow.json');
    rmSync(ROOT_LONG, { recursive: true, force: true });
    rmSync(paths.sessionDir(SESSION_LONG), { recursive: true, force: true });
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 5: timeline 事件 session:compact
// ══════════════════════════════════════════════════════════════════

describe('Feature 5：timeline 事件 session:compact', () => {
  // Scenario 5.1: 有 workflow 時正確 emit session:compact
  test('有 workflow 時 timeline.jsonl 新增 session:compact 事件', () => {
    const SESSION_TL = `pre-compact-tl-${TS}`;
    stateLib.initState(SESSION_TL, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    const result = runHook({ session_id: SESSION_TL });
    expect(result.exitCode).toBe(0);

    const events = readTimeline(SESSION_TL);
    const compactEvent = events.find(e => e.type === 'session:compact');
    expect(compactEvent).toBeDefined();
    // timeline.emit 用 spread，workflowType 直接在事件頂層（非 data 子物件）
    expect(compactEvent.workflowType).toBe('quick');
    expect(typeof compactEvent.ts).toBe('string'); // ISO 8601
    expect(compactEvent.category).toBe('session');

    rmSync(paths.sessionDir(SESSION_TL), { recursive: true, force: true });
  });

  // Scenario 5.2: session:compact 是已知的 registry 事件
  test('session:compact 在 registry.timelineEvents 中有定義', () => {
    const { timelineEvents } = require(join(SCRIPTS_LIB, 'registry'));
    expect(timelineEvents['session:compact']).toBeDefined();
    expect(timelineEvents['session:compact'].label).toBe('Context 壓縮');
    expect(timelineEvents['session:compact'].category).toBe('session');
  });

  // Scenario 5.3: 無 workflow 時不 emit timeline 事件
  test('無 workflow 時不 emit session:compact 事件', () => {
    // SESSION_NO_WF 從未初始化 workflow.json
    const SESSION_NO_WF2 = `pre-compact-no-wf2-${TS}`;
    runHook({ session_id: SESSION_NO_WF2 });
    const events = readTimeline(SESSION_NO_WF2);
    const compactEvent = events.find(e => e.type === 'session:compact');
    expect(compactEvent).toBeUndefined();
    rmSync(paths.sessionDir(SESSION_NO_WF2), { recursive: true, force: true });
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 6: 任何失敗 fallback 到 { result: '' }
// ══════════════════════════════════════════════════════════════════

describe('Feature 6：任何失敗 fallback 到 { result: \'\' }', () => {
  // Scenario 6.1: workflow.json JSON 損壞
  test('workflow.json 損壞時 fallback 到 {"result":""}', () => {
    const SESSION_CORRUPT = `pre-compact-corrupt-${TS}`;
    // 手動建立損壞的 workflow.json
    const sessionDir = paths.sessionDir(SESSION_CORRUPT);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'workflow.json'), '{broken json');

    const result = runHook({ session_id: SESSION_CORRUPT });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ result: '' });

    rmSync(sessionDir, { recursive: true, force: true });
  });

  // Scenario 6.3: 整個 hook 邏輯拋出未預期例外時 fallback
  test('整個 hook 邏輯拋出未預期例外時 safeRun fallback 並 exit 0', () => {
    // 傳入損壞的 stdin
    const proc = Bun.spawnSync(['node', HOOK_PATH], {
      stdin: Buffer.from('{broken'),
      env: { ...process.env, CLAUDE_SESSION_ID: 'x', OVERTONE_NO_DASHBOARD: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(proc.exitCode).toBe(0);
    // stdin 畸形 → safeReadStdin 回傳 {} → sessionId 取自 CLAUDE_SESSION_ID='x'
    // workflow.json 不存在 → 輸出 { result: '' }
    const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : '';
    expect(JSON.parse(stdout)).toEqual({ result: '' });
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 7: buildPendingTasksMessage 共用函式
// ══════════════════════════════════════════════════════════════════

describe('Feature 7：buildPendingTasksMessage 共用函式', () => {
  const hookUtils = require(join(SCRIPTS_LIB, 'hook-utils'));

  const FEAT_ROOT = join(homedir(), '.overtone', 'test-tmp', `pre-compact-hook-utils-${TS}`);

  afterAll(() => {
    rmSync(FEAT_ROOT, { recursive: true, force: true });
  });

  // Scenario 7.1: 有未完成任務時回傳格式化訊息
  test('有 3 個未完成任務時回傳包含 📋 **未完成任務** 的字串', () => {
    createFeature(FEAT_ROOT, 'test-feature-7', [
      '- [x] 已完成 A',
      '- [ ] 未完成 1',
      '- [ ] 未完成 2',
      '- [ ] 未完成 3',
    ]);
    const result = hookUtils.buildPendingTasksMessage(FEAT_ROOT);
    expect(result).not.toBeNull();
    expect(result).toContain('📋 **未完成任務**');
    expect(result).toContain('Feature：test-feature-7（1/4 完成）');
    expect(result).toContain('- [ ] 未完成 1');
    expect(result).toContain('- [ ] 未完成 2');
    expect(result).toContain('- [ ] 未完成 3');
  });

  // Scenario 7.1: 自訂 header
  test('options.header 可自訂標頭文字', () => {
    const result = hookUtils.buildPendingTasksMessage(FEAT_ROOT, { header: '未完成任務（上次 session 中斷）' });
    expect(result).toContain('📋 **未完成任務（上次 session 中斷）**');
  });

  // Scenario 7.2: 無活躍 feature 時回傳 null
  test('無活躍 feature 時回傳 null', () => {
    const emptyRoot = join(homedir(), '.overtone', 'test-tmp', `empty-feat-${TS}`);
    mkdirSync(join(emptyRoot, 'specs', 'features', 'in-progress'), { recursive: true });
    const result = hookUtils.buildPendingTasksMessage(emptyRoot);
    expect(result).toBeNull();
    rmSync(emptyRoot, { recursive: true, force: true });
  });

  // Scenario 7.3: 所有任務完成時回傳 null
  test('所有任務完成時回傳 null', () => {
    const doneRoot = join(homedir(), '.overtone', 'test-tmp', `done-feat-${TS}`);
    createFeature(doneRoot, 'done-feature', ['- [x] 任務 A', '- [x] 任務 B']);
    const result = hookUtils.buildPendingTasksMessage(doneRoot);
    expect(result).toBeNull();
    rmSync(doneRoot, { recursive: true, force: true });
  });

  // Scenario 7.4: specs 讀取拋出例外時回傳 null 而非拋出
  test('specs.getActiveFeature 拋出例外時回傳 null 而非拋出', () => {
    // 傳入不存在的 projectRoot，specs.getActiveFeature 會因讀取失敗拋出
    let result;
    expect(() => {
      result = hookUtils.buildPendingTasksMessage('/nonexistent/xyz/abc');
    }).not.toThrow();
    expect(result).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 8: on-start.js 改用 buildPendingTasksMessage 後行為不變
// ══════════════════════════════════════════════════════════════════

describe('Feature 8：on-start.js 重構後行為不變', () => {
  const ON_START_FEAT = 'on-start-refactor-test';

  beforeAll(() => {
    createFeature(TMP_ROOT_ONSTART, ON_START_FEAT, [
      '- [ ] 任務 A',
      '- [ ] 任務 B',
      '- [ ] 任務 C',
    ]);
  });

  // Scenario 8.1: 有未完成任務時 systemMessage 格式與預期相同
  test('on-start.js 有未完成任務時輸出含 systemMessage 且標頭為「上次 session 中斷」', () => {
    const result = runOnStart({ cwd: TMP_ROOT_ONSTART });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.systemMessage).toBeDefined();
    expect(output.systemMessage).toContain('📋 **未完成任務（上次 session 中斷）**');
    expect(output.systemMessage).toContain(`Feature：${ON_START_FEAT}`);
    expect(output.systemMessage).toContain('→ 請使用 TaskCreate 重建以上任務的 TaskList，然後繼續執行。');
  });

  test('on-start.js systemMessage 包含 3 個未完成任務', () => {
    const result = runOnStart({ cwd: TMP_ROOT_ONSTART });
    const { systemMessage } = JSON.parse(result.stdout);
    expect(systemMessage).toContain('- [ ] 任務 A');
    expect(systemMessage).toContain('- [ ] 任務 B');
    expect(systemMessage).toContain('- [ ] 任務 C');
  });

  // Scenario 8.2: 無活躍 feature 時不輸出 systemMessage
  test('on-start.js 無活躍 feature 時不輸出 systemMessage', () => {
    const NO_FEAT_ROOT = join(homedir(), '.overtone', 'test-tmp', `on-start-no-feat-${TS}`);
    mkdirSync(join(NO_FEAT_ROOT, 'specs', 'features', 'in-progress'), { recursive: true });
    const result = runOnStart({ cwd: NO_FEAT_ROOT });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.systemMessage).toBeUndefined();
    rmSync(NO_FEAT_ROOT, { recursive: true, force: true });
  });

  // Scenario 8.3: featureName 同步邏輯不受重構影響
  test('on-start.js 有 active feature 且 featureName 為 null 時自動補寫 workflow.json', () => {
    stateLib.initState(SESSION_ON_START, 'standard', STANDARD_STAGES);
    const ws = stateLib.readState(SESSION_ON_START);
    expect(ws.featureName).toBeNull();

    const result = runOnStart({ session_id: SESSION_ON_START, cwd: TMP_ROOT_ONSTART });
    expect(result.exitCode).toBe(0);

    const updatedWs = stateLib.readState(SESSION_ON_START);
    expect(updatedWs.featureName).toBe(ON_START_FEAT);
  });
});
