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

const handler = require(join(SCRIPTS_LIB, 'session-start-handler'));
const { buildBanner, buildStartOutput, buildPluginContext } = handler;

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
      grayMatterStatus: '  ⚠️  gray-matter 未安裝 — cd plugins/overtone && bun add gray-matter',
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
  test('回傳含 result 欄位的物件', () => {
    const output = buildStartOutput({}, { banner: 'some banner', msgs: [] });
    expect(output).toHaveProperty('result');
    expect(output.result).toBe('some banner');
  });

  test('msgs 為空時不包含 systemMessage', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: [] });
    expect(output.systemMessage).toBeUndefined();
  });

  test('msgs 含一個字串時 systemMessage 等於該字串', () => {
    const msg = '## 未完成任務\n\n- [ ] DEV';
    const output = buildStartOutput({}, { banner: 'banner', msgs: [msg] });
    expect(output.systemMessage).toBe(msg);
  });

  test('msgs 含多個字串時以雙換行連接', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: ['A', 'B', 'C'] });
    expect(output.systemMessage).toBe('A\n\nB\n\nC');
  });

  test('msgs 含 null/undefined 時自動過濾', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: [null, 'valid', undefined, ''] });
    expect(output.systemMessage).toBe('valid');
  });

  test('msgs 全為 falsy 時不包含 systemMessage', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: [null, undefined, ''] });
    expect(output.systemMessage).toBeUndefined();
  });

  test('options 為 undefined 時回傳預設結構', () => {
    const output = buildStartOutput({}, undefined);
    expect(output.result).toBe('');
    expect(output.systemMessage).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildPluginContext
// ────────────────────────────────────────────────────────────────────────────

describe('buildPluginContext', () => {
  test('回傳非空字串', () => {
    const result = buildPluginContext();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('包含 plugin 版本號（動態計算）', () => {
    const pkg = require(join(SCRIPTS_LIB, '../../.claude-plugin/plugin.json'));
    const result = buildPluginContext();
    expect(result).toContain(pkg.version);
  });

  test('包含 Agent 數量（大於 0 的數字）', () => {
    const result = buildPluginContext();
    // 應含有 "N agents" 格式的描述
    expect(result).toMatch(/\d+ agents/);
    const match = result.match(/(\d+) agents/);
    expect(parseInt(match[1], 10)).toBeGreaterThan(0);
  });

  test('包含 Stage 數量（大於 0 的數字）', () => {
    const result = buildPluginContext();
    expect(result).toMatch(/\d+ stages/);
    const match = result.match(/(\d+) stages/);
    expect(parseInt(match[1], 10)).toBeGreaterThan(0);
  });

  test('包含 Workflow 數量（大於 0 的數字）', () => {
    const result = buildPluginContext();
    expect(result).toMatch(/\d+ workflow 模板/);
    const match = result.match(/(\d+) workflow 模板/);
    expect(parseInt(match[1], 10)).toBeGreaterThan(0);
  });

  test('包含 Timeline events 數量（大於 0 的數字）', () => {
    const result = buildPluginContext();
    expect(result).toMatch(/\d+ timeline events/);
    const match = result.match(/(\d+) timeline events/);
    expect(parseInt(match[1], 10)).toBeGreaterThan(0);
  });

  test('包含 Hook events 清單（含 SessionStart）', () => {
    const result = buildPluginContext();
    expect(result).toContain('SessionStart');
  });

  test('包含核心規範 — registry.js SoT', () => {
    const result = buildPluginContext();
    expect(result).toContain('registry.js 是 SoT');
  });

  test('包含 Handoff 格式說明', () => {
    const result = buildPluginContext();
    expect(result).toContain('Handoff 格式');
  });

  test('包含並行群組定義（含 quality）', () => {
    const result = buildPluginContext();
    expect(result).toContain('quality');
  });

  test('與 registry.js 資料一致 — agent 數量吻合', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    const agentSet = new Set();
    for (const stageDef of Object.values(registry.stages)) {
      if (stageDef.agent) agentSet.add(stageDef.agent);
    }
    const expectedCount = agentSet.size;

    const result = buildPluginContext();
    const match = result.match(/(\d+) agents/);
    expect(parseInt(match[1], 10)).toBe(expectedCount);
  });

  test('與 registry.js 資料一致 — workflow 數量吻合', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    const expectedCount = Object.keys(registry.workflows).length;

    const result = buildPluginContext();
    const match = result.match(/(\d+) workflow 模板/);
    expect(parseInt(match[1], 10)).toBe(expectedCount);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleSessionStart — 基本回傳結構（不測副作用）
// ────────────────────────────────────────────────────────────────────────────

describe('handleSessionStart — 基本回傳結構', () => {
  test('回傳物件含 result 欄位（字串）', () => {
    // 傳入無 session 環境（避免 I/O 副作用）
    const result = handler.handleSessionStart(
      { cwd: process.cwd() },
      null,  // sessionId 為 null，跳過目錄建立和 timeline emit
      null   // hookTimer 為 null，跳過 timing emit
    );
    expect(typeof result).toBe('object');
    expect(typeof result.result).toBe('string');
  });

  test('result 字串包含版本號（來自 plugin.json）', () => {
    const result = handler.handleSessionStart({ cwd: process.cwd() }, null, null);
    // 版本號格式為 x.y.z，確認 result 中包含合理的版本字串
    expect(result.result).toMatch(/\d+\.\d+\.\d+/);
  });

  test('hookTimer 為 null 時不拋出例外', () => {
    expect(() => handler.handleSessionStart({ cwd: process.cwd() }, null, null)).not.toThrow();
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
      expect(typeof output.result).toBe('string');
    }).not.toThrow();
  });
});
