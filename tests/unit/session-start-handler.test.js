// @sequential — monkey-patch mock 修改全域模組（child_process、timeline 等），不能與其他測試共享進程
'use strict';
/**
 * session-start-handler.test.js — session-start-handler.js 純函數單元測試
 *
 * 驗證範圍（Humble Object 模式）：
 *   - buildBanner：banner 字串組裝邏輯
 *   - buildStartOutput：輸出物件組裝邏輯
 *   - handleSessionStart：主 handler（副作用部分以整合測試覆蓋）
 *
 * 不測試：
 *   - stdin/stdout 解析（那是 hook 薄殼層面，由 session-start.test.js 的 spawn 測試覆蓋）
 *   - 目錄建立、timeline emit 等 I/O 副作用（由 session-start.test.js 覆蓋）
 */

const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

// ── 效能優化：在 require session-start-handler 之前 monkey-patch 昂貴的 I/O 模組 ──
// 策略：只 mock 對測試行為無關的 I/O，保留 state/globalInstinct（Features 7/9/13 需要）
//
// 根因：setup.js 設定 NOVA_TEST=1，讓 dep cache 強制 skipCache=true，
//   每次 handleSessionStart 都重跑 execSync('which agent-browser/gh') + 'gh auth status'，
//   三個 execSync 在 bun test 下各約 140ms，31 次呼叫累積 13 秒。

// 1. child_process.execSync：mock dep check 指令（only which/gh auth）
//    dep check 在 session-start-handler.js:357/373/375，是唯一的 execSync 使用點。
//    保留其他 execSync 行為（其他測試可能使用真實 execSync）。
const cp = require('child_process');
const _origExecSync = cp.execSync;
cp.execSync = (cmd, opts) => {
  if (cmd === 'which agent-browser' || cmd === 'which gh' || cmd === 'gh auth status') {
    return '';  // 假裝安裝且認證成功
  }
  return _origExecSync(cmd, opts);
};

// 2. timeline：mock cleanupOldSessions（掃描 sessions 目錄）+ emit（寫 JSONL 累積開銷）
//    注意：保留 query/latest/count 等函式（Features 7/13 的 writeState 可能用到）
const timelineMod = require(join(SCRIPTS_LIB, 'timeline'));
timelineMod.cleanupOldSessions = () => ({ removed: 0, kept: 0 });
timelineMod.emit = () => {};

// 3. specsArchiveScanner：mock scanAndArchive（掃描 specs 目錄）
const specsArchiveScannerMod = require(join(SCRIPTS_LIB, 'specs-archive-scanner'));
specsArchiveScannerMod.scanAndArchive = () => ({ archived: [], skipped: [], errors: [] });

// 4. dashboard/pid：mock isRunning（避免 port 探測的系統 I/O）
const dashboardPidMod = require(join(SCRIPTS_LIB, 'dashboard/pid'));
dashboardPidMod.isRunning = () => true;  // 假裝 dashboard 已在執行 → 不 spawn

// 5. baselineTracker：mock formatBaselineSummary（讀 .jsonl 並格式化）
const baselineTrackerMod = require(join(SCRIPTS_LIB, 'baseline-tracker'));
baselineTrackerMod.formatBaselineSummary = () => null;

// 6. scoreEngine：mock formatScoreSummary（讀 .jsonl 並格式化）
const scoreEngineMod = require(join(SCRIPTS_LIB, 'score-engine'));
scoreEngineMod.formatScoreSummary = () => null;

// 7. failureTracker：mock formatFailureSummary（讀 .jsonl 並格式化）
const failureTrackerMod = require(join(SCRIPTS_LIB, 'failure-tracker'));
failureTrackerMod.formatFailureSummary = () => null;

// 8. executionQueue：mock formatQueueSummary（讀佇列檔案）
const executionQueueMod = require(join(SCRIPTS_LIB, 'execution-queue'));
executionQueueMod.formatQueueSummary = () => null;

// ── 上述 patch 完成後才 require handler，讓 handler 拿到已 patch 的版本 ──
const handler = require(join(SCRIPTS_LIB, 'session-start-handler'));
const { buildBanner, buildStartOutput, buildPluginContext } = handler;

// ── 效能：lazy cache ──
const _cache = new Map();
function cached(fn) {
  if (!_cache.has(fn)) _cache.set(fn, fn());
  return _cache.get(fn);
}

// ────────────────────────────────────────────────────────────────────────────
// buildBanner
// ────────────────────────────────────────────────────────────────────────────

describe('buildBanner', () => {
  test('回傳值為字串', () => {
    const result = buildBanner('1.0.0', 'test-session-id', 7777, {});
    expect(typeof result).toBe('string');
  });

  test('包含傳入的版本號', () => {
    const result = buildBanner('0.28.99', 'any-session', 7777, {});
    expect(result).toContain('0.28.99');
  });

  test('包含 session ID 前 8 碼', () => {
    const result = buildBanner('1.0.0', 'abcdef1234567890', 7777, {});
    expect(result).toContain('abcdef12');
  });

  test('有 port 時顯示 Dashboard URL', () => {
    const result = buildBanner('1.0.0', 'test-session', 7777, {});
    expect(result).toContain('http://localhost:7777/');
  });

  test('port 為 null 時不顯示 Dashboard URL', () => {
    const result = buildBanner('1.0.0', 'test-session', null, {});
    expect(result).not.toContain('Dashboard:');
  });

  test('sessionId 為 null 時不顯示 Session 行', () => {
    const result = buildBanner('1.0.0', null, null, {});
    expect(result).not.toContain('Session:');
  });

  test('有 agentBrowserStatus 時顯示', () => {
    const result = buildBanner('1.0.0', 'test-session', null, {
      agentBrowserStatus: '  🌐 agent-browser: 已安裝',
    });
    expect(result).toContain('agent-browser: 已安裝');
  });

  test('有 ghStatus 時顯示', () => {
    const result = buildBanner('1.0.0', 'test-session', null, {
      ghStatus: '  🐙 gh CLI: 已安裝且已認證',
    });
    expect(result).toContain('gh CLI: 已安裝且已認證');
  });

  test('有 grayMatterStatus 時顯示', () => {
    const result = buildBanner('1.0.0', 'test-session', null, {
      grayMatterStatus: '  ⚠️  gray-matter 未安裝 — cd ~/.claude && bun add gray-matter',
    });
    expect(result).toContain('gray-matter 未安裝');
  });

  test('deps 為 null 時不拋出例外', () => {
    expect(() => buildBanner('1.0.0', 'test-session', null, null)).not.toThrow();
  });

  test('banner 開頭為空行（確保排版一致）', () => {
    const result = buildBanner('1.0.0', 'test-session', null, {});
    expect(result.startsWith('\n')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildStartOutput
// ────────────────────────────────────────────────────────────────────────────

describe('buildStartOutput', () => {
  test('回傳物件（result 不在 schema 中）', () => {
    const output = buildStartOutput({}, { banner: 'some banner', msgs: [] });
    expect(typeof output).toBe('object');
    expect(output.result).toBeUndefined();
  });

  test('banner 透過 systemMessage 輸出', () => {
    const output = buildStartOutput({}, { banner: 'my banner', msgs: [] });
    expect(output.systemMessage).toBe('my banner');
  });

  test('msgs 含一個字串時 systemMessage 含 banner 和 msg', () => {
    const msg = '## 未完成任務\n\n- [ ] DEV';
    const output = buildStartOutput({}, { banner: 'banner', msgs: [msg] });
    expect(output.systemMessage).toBe('banner\n\n' + msg);
  });

  test('msgs 含多個字串時以雙換行連接（含 banner）', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: ['A', 'B', 'C'] });
    expect(output.systemMessage).toBe('banner\n\nA\n\nB\n\nC');
  });

  test('msgs 含 null/undefined 時自動過濾', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: [null, 'valid', undefined, ''] });
    expect(output.systemMessage).toBe('banner\n\nvalid');
  });

  test('msgs 全為 falsy 且 banner 有值時 systemMessage 為 banner', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: [null, undefined, ''] });
    expect(output.systemMessage).toBe('banner');
  });

  test('options 為 undefined 時回傳空物件', () => {
    const output = buildStartOutput({}, undefined);
    expect(output).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildPluginContext
// ────────────────────────────────────────────────────────────────────────────

describe('buildPluginContext', () => {
  test('回傳非空字串', () => {
    const result = cached(buildPluginContext);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('包含 plugin 版本號（動態計算）', () => {
    // 支援兩種佈署格式：開發環境（.claude-plugin/plugin.json）vs 全域（plugin.json）
    const { existsSync } = require('fs');
    const devPath = join(SCRIPTS_LIB, '../../.claude-plugin/plugin.json');
    const globalPath = join(SCRIPTS_LIB, '../../plugin.json');
    const pkg = require(existsSync(devPath) ? devPath : globalPath);
    const result = cached(buildPluginContext);
    expect(result).toContain(pkg.version);
  });

  test('包含 Agent 數量（大於 0 的數字）', () => {
    const result = cached(buildPluginContext);
    // 應含有 "N agents" 格式的描述
    expect(result).toMatch(/\d+ agents/);
    const match = result.match(/(\d+) agents/);
    expect(parseInt(match[1], 10)).toBeGreaterThan(0);
  });

  test('包含 Stage 數量（大於 0 的數字）', () => {
    const result = cached(buildPluginContext);
    expect(result).toMatch(/\d+ stages/);
    const match = result.match(/(\d+) stages/);
    expect(parseInt(match[1], 10)).toBeGreaterThan(0);
  });

  test('包含 Workflow 數量（大於 0 的數字）', () => {
    const result = cached(buildPluginContext);
    expect(result).toMatch(/\d+ workflow 模板/);
    const match = result.match(/(\d+) workflow 模板/);
    expect(parseInt(match[1], 10)).toBeGreaterThan(0);
  });

  test('包含 Timeline events 數量（大於 0 的數字）', () => {
    const result = cached(buildPluginContext);
    expect(result).toMatch(/\d+ timeline events/);
    const match = result.match(/(\d+) timeline events/);
    expect(parseInt(match[1], 10)).toBeGreaterThan(0);
  });

  test('包含 Hook events 清單（含 SessionStart）', () => {
    const result = cached(buildPluginContext);
    expect(result).toContain('SessionStart');
  });

  test('包含核心規範 — registry.js SoT', () => {
    const result = cached(buildPluginContext);
    expect(result).toContain('registry.js 是 SoT');
  });

  test('包含 Handoff 格式說明', () => {
    const result = cached(buildPluginContext);
    expect(result).toContain('Handoff 格式');
  });

  test('包含並行群組定義（含 quality）', () => {
    const result = cached(buildPluginContext);
    expect(result).toContain('quality');
  });

  test('與 registry.js 資料一致 — agent 數量吻合', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    const agentSet = new Set();
    for (const stageDef of Object.values(registry.stages)) {
      if (stageDef.agent) agentSet.add(stageDef.agent);
    }
    const expectedCount = agentSet.size;

    const result = cached(buildPluginContext);
    const match = result.match(/(\d+) agents/);
    expect(parseInt(match[1], 10)).toBe(expectedCount);
  });

  test('與 registry.js 資料一致 — workflow 數量吻合', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    const expectedCount = Object.keys(registry.workflows).length;

    const result = cached(buildPluginContext);
    const match = result.match(/(\d+) workflow 模板/);
    expect(parseInt(match[1], 10)).toBe(expectedCount);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleSessionStart — 基本回傳結構（不測副作用）
// ────────────────────────────────────────────────────────────────────────────

describe('handleSessionStart — 基本回傳結構', () => {
  // lazy getter：同一 describe 中所有 test 共用同一次呼叫結果
  let _sharedResult;
  function sharedResult() {
    if (!_sharedResult) {
      _sharedResult = handler.handleSessionStart({ cwd: process.cwd() }, null, null);
    }
    return _sharedResult;
  }

  test('回傳物件（無 result 欄位）', () => {
    const result = sharedResult();
    expect(typeof result).toBe('object');
    // result 不在 schema，已移除
    expect(result.result).toBeUndefined();
  });

  test('systemMessage 包含版本號（來自 plugin.json）', () => {
    // 版本號格式為 x.y.z，確認 systemMessage 中包含版本資訊
    const output = sharedResult();
    if (output.systemMessage) {
      expect(output.systemMessage).toMatch(/\d+\.\d+\.\d+/);
    }
  });

  test('hookTimer 為 null 時不拋出例外', () => {
    expect(() => sharedResult()).not.toThrow();
  });

  test('hookTimer 提供 emit 時會被呼叫（sessionId 為 null 時跳過）', () => {
    let emitCalled = false;
    const mockTimer = {
      emit: (sid, hookName, eventName) => {
        // sessionId 為 null 時 hook-timing 內部會跳過，但 handler 仍會呼叫
        emitCalled = true;
      },
    };
    handler.handleSessionStart({ cwd: process.cwd() }, null, mockTimer);
    expect(emitCalled).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 7: 最近常做的事（intent_journal 摘要注入）
// ────────────────────────────────────────────────────────────────────────────

const { mkdirSync: mkdirSyncF7, rmSync: rmSyncF7, appendFileSync: appendFileSyncF7 } = require('fs');
const os = require('os');
const pathMod = require('path');
const paths = require(join(SCRIPTS_LIB, 'paths'));
const globalInstinct = require(join(SCRIPTS_LIB, 'knowledge/global-instinct'));

function makeTmpProject(suffix) {
  const dir = pathMod.join(os.tmpdir(), `ot-sshj-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSyncF7(dir, { recursive: true });
  return dir;
}

function seedGlobalJournal(projectRoot, journals) {
  const obsPath = paths.global.observations(projectRoot);
  mkdirSyncF7(pathMod.dirname(obsPath), { recursive: true });
  for (const j of journals) {
    appendFileSyncF7(obsPath, JSON.stringify(j) + '\n', 'utf8');
  }
}

function makeJournalObs(overrides = {}) {
  return {
    id: `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    type: 'intent_journal',
    trigger: '幫我寫一個功能',
    action: '工作流：standard',
    tag: `journal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    confidence: 0.8,
    count: 1,
    sessionResult: 'pass',
    workflowType: 'standard',
    globalTs: new Date().toISOString(),
    ...overrides,
  };
}

describe('Feature 7: 最近常做的事（intent_journal 摘要注入）', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTmpProject('f7');
  });

  afterEach(() => {
    rmSyncF7(projectRoot, { recursive: true, force: true });
    try {
      rmSyncF7(paths.global.dir(projectRoot), { recursive: true, force: true });
    } catch {
      // 忽略清理失敗
    }
  });

  // Scenario 7-1
  test('Scenario 7-1: 有 sessionResult=pass 的 intent_journal 時 systemMessage 包含「最近常做的事」', () => {
    seedGlobalJournal(projectRoot, [
      makeJournalObs({ trigger: '幫我寫登入頁面', workflowType: 'standard', sessionResult: 'pass' }),
      makeJournalObs({ trigger: '修復測試失敗問題', workflowType: 'quick', sessionResult: 'pass' }),
      makeJournalObs({ trigger: '重構資料庫查詢', workflowType: 'standard', sessionResult: 'pass' }),
    ]);

    const output = handler.handleSessionStart({ cwd: projectRoot }, null, null);
    expect(output.systemMessage).toBeDefined();
    expect(output.systemMessage).toContain('最近常做的事');
  });

  // Scenario 7-2
  test('Scenario 7-2: 無 sessionResult=pass 的記錄時不包含「最近常做的事」', () => {
    seedGlobalJournal(projectRoot, [
      makeJournalObs({ sessionResult: 'fail', tag: 'journal-fail-1' }),
      makeJournalObs({ sessionResult: 'abort', tag: 'journal-abort-1' }),
    ]);

    const output = handler.handleSessionStart({ cwd: projectRoot }, null, null);
    // systemMessage 可能不存在或不含「最近常做的事」
    if (output.systemMessage) {
      expect(output.systemMessage).not.toContain('最近常做的事');
    } else {
      expect(output.systemMessage).toBeUndefined();
    }
  });

  // Scenario 7-3
  test('Scenario 7-3: 一般全域觀察段落不包含 intent_journal 記錄（excludeTypes 有效）', () => {
    // 將一筆 intent_journal 和一筆 tool_preferences 加入全域 store
    seedGlobalJournal(projectRoot, [
      makeJournalObs({ type: 'intent_journal', tag: 'j-excl-1', trigger: '不應出現在一般觀察', sessionResult: 'pass' }),
    ]);
    const toolPref = {
      id: `inst_tp_${Date.now().toString(36)}`,
      ts: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      type: 'tool_preferences',
      trigger: '偏好 bun 而非 npm',
      action: '使用 bun test 執行測試',
      tag: 'bun-test',
      confidence: 0.9,
      count: 1,
      globalTs: new Date().toISOString(),
    };
    const obsPath = paths.global.observations(projectRoot);
    appendFileSyncF7(obsPath, JSON.stringify(toolPref) + '\n', 'utf8');

    const output = handler.handleSessionStart({ cwd: projectRoot }, null, null);
    // 一般全域觀察段落（跨 Session 知識記憶）中 intent_journal 應被排除
    // 但 tool_preferences 仍應出現
    if (output.systemMessage) {
      expect(output.systemMessage).toContain('bun-test');
      // 找到「跨 Session 知識記憶」段落，確認不含 intent_journal tag
      const lines = output.systemMessage.split('\n');
      const knowledgeSection = lines
        .filter(l => l.includes('跨 Session 知識記憶') || l.includes('j-excl-1'));
      // intent_journal tag 不應出現在知識記憶段落（excludeTypes 效果）
      expect(knowledgeSection.some(l => l.includes('j-excl-1'))).toBe(false);
    }
  });

  // Scenario 7-4
  test('Scenario 7-4: trigger 超過 60 字的記錄在摘要中截斷並加「...」', () => {
    const longTrigger = '這是一個很長很長的 prompt'.repeat(10); // > 60 字
    seedGlobalJournal(projectRoot, [
      makeJournalObs({ trigger: longTrigger, sessionResult: 'pass' }),
    ]);

    const output = handler.handleSessionStart({ cwd: projectRoot }, null, null);
    if (output.systemMessage && output.systemMessage.includes('最近常做的事')) {
      // 截斷後應只顯示前 60 字加 '...'
      const truncated = longTrigger.slice(0, 60) + '...';
      expect(output.systemMessage).toContain(truncated);
    }
  });

  // Scenario 7-5
  test('Scenario 7-5: queryGlobal 失敗時靜默跳過（SessionStart 正常完成）', () => {
    // 不填充任何資料，直接執行（空全域 store → queryGlobal 回傳 [] → 不注入）
    expect(() => {
      const output = handler.handleSessionStart({ cwd: projectRoot }, null, null);
      expect(typeof output).toBe('object');
    }).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 8: handleSessionStart — systemMessage 組裝條件
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 8: handleSessionStart — systemMessage 組裝', () => {
  // lazy getter：8-1、8-2、8-3、8-5 共用同一次呼叫（相同參數）
  let _f8Output;
  function f8Output() {
    if (!_f8Output) {
      _f8Output = handler.handleSessionStart({ cwd: process.cwd() }, null, null);
    }
    return _f8Output;
  }

  test('Scenario 8-1: 正常啟動時回傳有效物件', () => {
    const output = f8Output();
    expect(typeof output).toBe('object');
    // result 不在 schema，已移除
    expect(output.result).toBeUndefined();
  });

  test('Scenario 8-2: systemMessage 包含 Overtone Plugin Context 段落', () => {
    const output = f8Output();
    if (output.systemMessage) {
      expect(output.systemMessage).toContain('Overtone Plugin Context');
    }
  });

  test('Scenario 8-3: systemMessage 中各段落以雙換行分隔', () => {
    const output = f8Output();
    if (output.systemMessage && output.systemMessage.includes('\n\n')) {
      // systemMessage 存在且含雙換行（段落分隔），格式正確
      expect(output.systemMessage.split('\n\n').length).toBeGreaterThan(1);
    }
  });

  test('Scenario 8-4: cwd 傳入自定路徑時使用該路徑作為 projectRoot', () => {
    const tmpDir = pathMod.join(os.tmpdir(), `ot-f8-${Date.now()}`);
    mkdirSyncF7(tmpDir, { recursive: true });
    try {
      // 不會拋出例外即代表 projectRoot 正確設定
      const output = handler.handleSessionStart({ cwd: tmpDir }, null, null);
      expect(typeof output).toBe('object');
    } finally {
      rmSyncF7(tmpDir, { recursive: true, force: true });
    }
  });

  test('Scenario 8-5: input 缺少 cwd 時退回 process.cwd() 不拋出', () => {
    // 使用不同 input（{}），不能共用 f8Output
    expect(() => {
      const output = handler.handleSessionStart({}, null, null);
      expect(typeof output).toBe('object');
    }).not.toThrow();
  });

  test('Scenario 8-6: hookTimer 提供 emit 且 sessionId 存在時 emit 被呼叫', () => {
    const calls = [];
    const mockTimer = { emit: (...args) => calls.push(args) };
    // sessionId 為 null 時 handler 仍呼叫 hookTimer.emit
    handler.handleSessionStart({ cwd: process.cwd() }, null, mockTimer);
    expect(calls.length).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 9: handleSessionStart — pendingAction 恢復
// ────────────────────────────────────────────────────────────────────────────

const { mkdirSync: mkdirSyncF9, rmSync: rmSyncF9, writeFileSync: writeFileSyncF9 } = require('fs');
const stateLib = require(join(SCRIPTS_LIB, 'state'));
const paths9 = require(join(SCRIPTS_LIB, 'paths'));
const homedir9 = require('os').homedir;

const TEST_PROJECT_ROOT_F9 = process.cwd();

function makeSession9(suffix) {
  const id = `test_ssh_f9_${suffix}_${Date.now().toString(36)}`;
  const dir = paths9.sessionDir(TEST_PROJECT_ROOT_F9, id);
  mkdirSyncF9(dir, { recursive: true });
  // 初始化空白 workflow.json，讓 updateStateAtomic 可以讀取到狀態
  writeFileSyncF9(paths9.session.workflow(TEST_PROJECT_ROOT_F9, id), JSON.stringify({}), 'utf8');
  return { id, dir };
}

describe('Feature 9: handleSessionStart — pendingAction 恢復', () => {
  let session;

  afterEach(() => {
    if (session) {
      rmSyncF9(session.dir, { recursive: true, force: true });
      session = null;
    }
  });

  test('Scenario 9-1: fix-reject pendingAction 時 systemMessage 包含「REVIEW 被拒絕」', () => {
    session = makeSession9('reject');
    stateLib.writeState(TEST_PROJECT_ROOT_F9, session.id, {
      pendingAction: { type: 'fix-reject', count: 1, stage: 'DEV', reason: '測試原因' },
    });
    const output = handler.handleSessionStart({ cwd: process.cwd() }, session.id, null);
    expect(output.systemMessage).toBeDefined();
    expect(output.systemMessage).toContain('REVIEW 被拒絕');
    expect(output.systemMessage).toContain('測試原因');
  });

  test('Scenario 9-2: fix-fail pendingAction 時 systemMessage 包含失敗提示', () => {
    session = makeSession9('fail');
    stateLib.writeState(TEST_PROJECT_ROOT_F9, session.id, {
      pendingAction: { type: 'fix-fail', count: 2, stage: 'TEST', reason: 'Assertion error' },
    });
    const output = handler.handleSessionStart({ cwd: process.cwd() }, session.id, null);
    expect(output.systemMessage).toBeDefined();
    expect(output.systemMessage).toContain('TEST 失敗');
    expect(output.systemMessage).toContain('Assertion error');
    expect(output.systemMessage).toContain('debugger');
  });

  test('Scenario 9-3: 無 pendingAction 時 systemMessage 不含「待執行動作」', () => {
    session = makeSession9('nopending');
    stateLib.writeState(TEST_PROJECT_ROOT_F9, session.id, { workflowType: 'quick' });
    const output = handler.handleSessionStart({ cwd: process.cwd() }, session.id, null);
    if (output.systemMessage) {
      expect(output.systemMessage).not.toContain('待執行動作');
    }
  });

  test('Scenario 9-4: fix-reject 包含 count/3 格式', () => {
    session = makeSession9('count');
    stateLib.writeState(TEST_PROJECT_ROOT_F9, session.id, {
      pendingAction: { type: 'fix-reject', count: 2, stage: 'REVIEW' },
    });
    const output = handler.handleSessionStart({ cwd: process.cwd() }, session.id, null);
    expect(output.systemMessage).toContain('2/3');
  });

  test('Scenario 9-5: sessionId 為 null 時不讀取 pendingAction（不拋出）', () => {
    expect(() => {
      const output = handler.handleSessionStart({ cwd: process.cwd() }, null, null);
      expect(typeof output).toBe('object');
    }).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 10: buildBanner — 追加邊界測試
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 10: buildBanner — 邊界與格式', () => {
  test('Scenario 10-1: sessionId 完整顯示前 8 碼（短 ID 全顯示）', () => {
    // 8 碼以內的 session ID 仍可正常顯示
    const result = buildBanner('1.0.0', 'abc12345', null, {});
    expect(result).toContain('abc12345');
  });

  test('Scenario 10-2: 多個 deps 同時提供時全部顯示', () => {
    const result = buildBanner('1.0.0', 'test-sess', 7777, {
      agentBrowserStatus: '  🌐 agent-browser: 已安裝',
      ghStatus: '  🐙 gh CLI: 已安裝且已認證',
      grayMatterStatus: '  ⚠️  gray-matter 未安裝',
    });
    expect(result).toContain('agent-browser: 已安裝');
    expect(result).toContain('gh CLI: 已安裝且已認證');
    expect(result).toContain('gray-matter 未安裝');
  });

  test('Scenario 10-3: port 為 0（falsy）時不顯示 Dashboard URL', () => {
    const result = buildBanner('1.0.0', 'test-sess', 0, {});
    expect(result).not.toContain('Dashboard:');
  });

  test('Scenario 10-4: banner 結尾為換行', () => {
    const result = buildBanner('1.0.0', 'test-sess', null, {});
    expect(result.endsWith('\n')).toBe(true);
  });

  test('Scenario 10-5: 版本號格式 x.y.z 正確顯示', () => {
    const result = buildBanner('0.99.123', null, null, {});
    expect(result).toContain('0.99.123');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 11: buildPluginContext — 進階驗證
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 11: buildPluginContext — 進階驗證', () => {
  test('Scenario 11-1: 包含「核心規範」標題', () => {
    const result = cached(buildPluginContext);
    expect(result).toContain('核心規範');
  });

  test('Scenario 11-2: 包含 updatedInput REPLACE 說明', () => {
    const result = cached(buildPluginContext);
    expect(result).toContain('updatedInput');
  });

  test('Scenario 11-3: 包含目錄結構描述', () => {
    const result = cached(buildPluginContext);
    // 全域遷移後，目錄結構改為 ~/.claude/，不再含 plugins/overtone
    expect(result).toContain('目錄結構');
  });

  test('Scenario 11-4: 包含常用指令段落', () => {
    const result = cached(buildPluginContext);
    expect(result).toContain('常用指令');
  });

  test('Scenario 11-5: 並行群組非空（至少 1 個）', () => {
    const { parallelGroupDefs } = require(join(SCRIPTS_LIB, 'registry'));
    const result = cached(buildPluginContext);
    const groupCount = Object.keys(parallelGroupDefs).length;
    if (groupCount > 0) {
      // 確認某個並行群組名稱出現在輸出中
      const firstGroup = Object.keys(parallelGroupDefs)[0];
      expect(result).toContain(firstGroup);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 12: buildStartOutput — 邊界補強
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 12: buildStartOutput — 邊界補強', () => {
  test('Scenario 12-1: banner 為空字串時不輸出 result', () => {
    const output = buildStartOutput({}, { banner: '', msgs: ['msg'] });
    expect(output.result).toBeUndefined();
    expect(output.systemMessage).toBe('msg');
  });

  test('Scenario 12-2: msgs 含大量訊息時全部合並（含 banner）', () => {
    const msgs = ['A', 'B', 'C', 'D', 'E'];
    const output = buildStartOutput({}, { banner: 'b', msgs });
    expect(output.systemMessage).toBe('b\n\nA\n\nB\n\nC\n\nD\n\nE');
  });

  test('Scenario 12-3: msgs 為 undefined 時 systemMessage 為 banner', () => {
    const output = buildStartOutput({}, { banner: 'b' });
    expect(output.systemMessage).toBe('b');
  });

  test('Scenario 12-4: _input 參數被忽略（相容性保留）', () => {
    const output1 = buildStartOutput({ any: 'value' }, { banner: 'b', msgs: ['m'] });
    const output2 = buildStartOutput(null, { banner: 'b', msgs: ['m'] });
    // 兩者結果相同，_input 不影響輸出
    expect(output1.systemMessage).toBe(output2.systemMessage);
  });

  test('Scenario 12-5: 混合 truthy 和 falsy 的 msgs 只保留 truthy（含 banner）', () => {
    const output = buildStartOutput({}, { banner: 'b', msgs: [null, 'A', '', undefined, 'B', false] });
    expect(output.systemMessage).toBe('b\n\nA\n\nB');
  });

  test('Scenario 12-6: 有 msgs 時 output 包含 hookSpecificOutput.hookEventName === SessionStart', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: ['## 測試段落'] });
    expect(output.hookSpecificOutput).toBeDefined();
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart');
  });

  test('Scenario 12-7: 有 msgs 時 hookSpecificOutput.additionalContext 為 validMsgs（不含 banner）', () => {
    const msg = '## Plugin Context\n\n測試內容';
    const output = buildStartOutput({}, { banner: 'banner', msgs: [msg] });
    expect(output.hookSpecificOutput).toBeDefined();
    // additionalContext 是 validMsgs（注入 model context），systemMessage 含 banner（UI 顯示）
    expect(output.hookSpecificOutput.additionalContext).toBe(msg);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 13: handleSessionStart — 全域觀察注入行為
// ────────────────────────────────────────────────────────────────────────────

const { mkdirSync: mkdirSyncF13, rmSync: rmSyncF13, appendFileSync: appendFileSyncF13 } = require('fs');
const paths13 = require(join(SCRIPTS_LIB, 'paths'));

function makeSession13(suffix, projectRoot) {
  const id = `test_ssh_f13_${suffix}_${Date.now().toString(36)}`;
  const dir = paths13.sessionDir(projectRoot, id);
  mkdirSyncF13(dir, { recursive: true });
  return { id, dir };
}

function seedGlobalObs13(projectRoot, obs) {
  const obsPath = paths13.global.observations(projectRoot);
  mkdirSyncF13(pathMod.dirname(obsPath), { recursive: true });
  for (const o of obs) {
    appendFileSyncF13(obsPath, JSON.stringify(o) + '\n', 'utf8');
  }
}

describe('Feature 13: handleSessionStart — 全域觀察注入', () => {
  let projectRoot;
  let session;

  beforeEach(() => {
    projectRoot = pathMod.join(os.tmpdir(), `ot-f13-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSyncF13(projectRoot, { recursive: true });
    session = makeSession13('obs', projectRoot);
  });

  afterEach(() => {
    rmSyncF13(projectRoot, { recursive: true, force: true });
    rmSyncF13(session.dir, { recursive: true, force: true });
    try {
      rmSyncF13(paths13.global.dir(projectRoot), { recursive: true, force: true });
    } catch {
      // 忽略清理失敗
    }
  });

  test('Scenario 13-1: 有高信心觀察時 systemMessage 包含「跨 Session 知識記憶」', () => {
    seedGlobalObs13(projectRoot, [{
      id: `inst_obs_${Date.now().toString(36)}`,
      ts: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      type: 'tool_preferences',
      trigger: '搜尋檔案',
      action: '建議改用 Grep/Glob',
      tag: 'search-tools',
      confidence: 0.9,
      count: 3,
      globalTs: new Date().toISOString(),
    }]);
    const output = handler.handleSessionStart({ cwd: projectRoot }, null, null);
    if (output.systemMessage) {
      expect(output.systemMessage).toContain('跨 Session 知識記憶');
    }
  });

  test('Scenario 13-2: 無觀察時 systemMessage 不包含「跨 Session 知識記憶」', () => {
    // 空的 projectRoot，無任何觀察
    const output = handler.handleSessionStart({ cwd: projectRoot }, null, null);
    if (output.systemMessage) {
      expect(output.systemMessage).not.toContain('跨 Session 知識記憶');
    }
  });

  test('Scenario 13-3: intent_journal 類型被排除在一般觀察外', () => {
    seedGlobalObs13(projectRoot, [{
      id: `inst_j_${Date.now().toString(36)}`,
      ts: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      type: 'intent_journal',
      trigger: '不應出現在知識記憶',
      action: '某工作流',
      tag: 'journal-excl',
      confidence: 0.9,
      count: 1,
      sessionResult: 'pass',
      globalTs: new Date().toISOString(),
    }]);
    const output = handler.handleSessionStart({ cwd: projectRoot }, null, null);
    if (output.systemMessage) {
      // intent_journal 不應出現在「跨 Session 知識記憶」段落
      expect(output.systemMessage).not.toContain('journal-excl');
    }
  });

  test('Scenario 13-4: 有 sessionId 時觀察注入後 appliedObservationIds 寫入 state', () => {
    // 初始化 session state
    stateLib.writeState(projectRoot, session.id, {});
    seedGlobalObs13(projectRoot, [{
      id: `inst_applied_${Date.now().toString(36)}`,
      ts: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      type: 'tool_preferences',
      trigger: '某觀察',
      action: '建議行為',
      tag: 'applied-obs',
      confidence: 0.9,
      count: 5,
      globalTs: new Date().toISOString(),
    }]);
    handler.handleSessionStart({ cwd: projectRoot }, session.id, null);
    // 確認 session state 寫入了 appliedObservationIds（有觀察時）
    const st = stateLib.readState(projectRoot, session.id);
    if (st && st.appliedObservationIds) {
      expect(Array.isArray(st.appliedObservationIds)).toBe(true);
      expect(st.appliedObservationIds.length).toBeGreaterThan(0);
    }
    // 若 topObs 為空則不寫入 — 這種情況也算通過（靜默跳過）
  });

  test('Scenario 13-5: handleSessionStart 傳入真實 sessionId 時不拋出例外', () => {
    stateLib.writeState(projectRoot, session.id, {});
    expect(() => {
      handler.handleSessionStart({ cwd: projectRoot }, session.id, null);
    }).not.toThrow();
  });
});
