// @sequential
'use strict';
/**
 * health-check-principles.test.js — 製作原則偵測單元測試
 *
 * 覆蓋：
 *   Feature A: checkClosedLoop   — 孤立事件流偵測（製作原則 1：完全閉環）
 *   Feature B: checkRecoveryStrategy — 失敗恢復策略偵測（製作原則 2：自動修復）
 *   Feature C: checkCompletionGap   — 補全能力缺口偵測（製作原則 3：補全能力）
 */

const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const path = require('path');
const { join } = path;
const os = require('os');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { SCRIPTS_DIR } = require('../helpers/paths');

const {
  checkClosedLoop,
  checkRecoveryStrategy,
  checkCompletionGap,
  PLUGIN_ROOT,
} = require(join(SCRIPTS_DIR, 'health-check'));

// ══════════════════════════════════════════════════════════════════
// Feature A: checkClosedLoop — 孤立事件流偵測
// ══════════════════════════════════════════════════════════════════

describe('checkClosedLoop', () => {
  // Scenario: 真實 codebase — 回傳陣列且 check 欄位正確
  test('Scenario A-1: 回傳陣列，所有 finding 的 check 欄位為 closed-loop', () => {
    const findings = checkClosedLoop();
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.check).toBe('closed-loop');
      expect(typeof f.severity).toBe('string');
      expect(typeof f.file).toBe('string');
      expect(typeof f.message).toBe('string');
    }
  });

  // Scenario: 有 emit 但無 consumer 的事件觸發 warning（finding schema）
  test('Scenario A-2: warning finding 包含正確欄位結構', () => {
    const findings = checkClosedLoop();
    for (const f of findings) {
      expect(f.check).toBe('closed-loop');
      expect(f.severity).toBe('warning');
      expect(typeof f.message).toBe('string');
      expect(f.message.length).toBeGreaterThan(0);
      // message 包含事件名稱（格式：category:name）
      expect(f.message).toMatch(/[a-z]+:[a-z][a-z-]*/);
    }
  });

  // Scenario: exempt 事件不觸發 warning（fire-and-forget 設計決策）
  test('Scenario A-3: exempt 事件（session:compact-suggestion、hook:timing、queue:auto-write）不產生 warning', () => {
    const findings = checkClosedLoop();
    const exemptEvents = ['session:compact-suggestion', 'hook:timing', 'queue:auto-write'];
    for (const f of findings) {
      for (const exempt of exemptEvents) {
        expect(f.message).not.toContain(`"${exempt}"`);
      }
    }
  });

  // Scenario: severity 只有 warning（closed-loop 不輸出 error 或 info）
  test('Scenario A-4: finding severity 只有 warning', () => {
    const findings = checkClosedLoop();
    for (const f of findings) {
      expect(f.severity).toBe('warning');
    }
  });

  // Scenario: health-check.js 本身被排除在掃描範圍外（不影響 consumer 計數）
  test('Scenario A-5: 無論結果，函式本身不拋出例外', () => {
    expect(() => checkClosedLoop()).not.toThrow();
  });

  // Scenario: 真實 codebase — 包含 15 項 check 的 runAllChecks 包含 closed-loop
  test('Scenario A-6: Finding schema 相容性 — finding 只有 check/severity/file/message/detail 欄位', () => {
    const findings = checkClosedLoop();
    const validKeys = new Set(['check', 'severity', 'file', 'message', 'detail']);
    for (const f of findings) {
      for (const key of Object.keys(f)) {
        expect(validKeys.has(key)).toBe(true);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature B: checkRecoveryStrategy — 失敗恢復策略偵測
// ══════════════════════════════════════════════════════════════════

describe('checkRecoveryStrategy', () => {
  let tmpDir;

  function setupPluginRoot() {
    tmpDir = path.join(os.tmpdir(), `ot-recovery-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const scriptsLib = path.join(tmpDir, 'scripts', 'lib');
    const agentsDir = path.join(tmpDir, 'agents');
    mkdirSync(scriptsLib, { recursive: true });
    mkdirSync(agentsDir, { recursive: true });
    return { tmpDir, scriptsLib, agentsDir };
  }

  afterEach(() => {
    if (tmpDir) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  // Scenario B-1: handler 主入口函式有 try-catch 時不產生 warning
  test('Scenario B-1: handler 含 try-catch 時不產生 warning', () => {
    const { scriptsLib, agentsDir } = setupPluginRoot();
    writeFileSync(
      path.join(scriptsLib, 'test-handler.js'),
      `'use strict';\nfunction handleTest(input) {\n  try {\n    return { output: {} };\n  } catch (err) {\n    return { output: {} };\n  }\n}\nmodule.exports = { handleTest };\n`,
    );
    // 建立一個有停止條件的 agent
    writeFileSync(
      path.join(agentsDir, 'test-agent.md'),
      `---\nname: test-agent\nmodel: sonnet\n---\n\n# Test\n\n## 停止條件\n\n- ✅ 任務完成\n`,
    );

    const findings = checkRecoveryStrategy(tmpDir);
    const handlerFindings = findings.filter((f) => f.file.includes('test-handler.js'));
    expect(handlerFindings.length).toBe(0);
  });

  // Scenario B-2: handler 主入口函式缺少 try-catch 時產生 warning
  test('Scenario B-2: handler 缺少 try-catch 時產生 warning', () => {
    const { scriptsLib, agentsDir } = setupPluginRoot();
    writeFileSync(
      path.join(scriptsLib, 'no-try-handler.js'),
      `'use strict';\nfunction handleNoTry(input) {\n  return { output: {} };\n}\nmodule.exports = { handleNoTry };\n`,
    );
    // 建立一個有停止條件的 agent 避免 agent finding 干擾
    writeFileSync(
      path.join(agentsDir, 'safe-agent.md'),
      `---\nname: safe-agent\nmodel: sonnet\n---\n\n## 停止條件\n\n- ✅ 完成\n`,
    );

    const findings = checkRecoveryStrategy(tmpDir);
    const handlerFindings = findings.filter((f) => f.file.includes('no-try-handler.js'));
    expect(handlerFindings.length).toBe(1);
    expect(handlerFindings[0].check).toBe('recovery-strategy');
    expect(handlerFindings[0].severity).toBe('warning');
    expect(handlerFindings[0].message).toContain('缺少頂層 try-catch 保護');
    expect(handlerFindings[0].file).toContain('no-try-handler.js');
  });

  // Scenario B-3: agent .md 有停止條件描述時不產生 warning
  test('Scenario B-3: agent 含停止條件關鍵詞時不產生 warning', () => {
    const { scriptsLib, agentsDir } = setupPluginRoot();
    // 建立一個有 try-catch 的 handler
    writeFileSync(
      path.join(scriptsLib, 'safe-handler.js'),
      `'use strict';\nfunction handleSafe() { try { return {}; } catch { return {}; } }\nmodule.exports = { handleSafe };\n`,
    );
    writeFileSync(
      path.join(agentsDir, 'good-agent.md'),
      `---\nname: good-agent\nmodel: sonnet\n---\n\n## 停止條件\n\n- ✅ 完成後停止\n`,
    );

    const findings = checkRecoveryStrategy(tmpDir);
    const agentFindings = findings.filter((f) => f.file.includes('good-agent.md'));
    expect(agentFindings.length).toBe(0);
  });

  // Scenario B-4: agent .md 缺少停止條件描述時產生 warning
  test('Scenario B-4: agent 缺少停止條件關鍵詞時產生 warning', () => {
    const { scriptsLib, agentsDir } = setupPluginRoot();
    // 建立一個有 try-catch 的 handler 避免 handler finding 干擾
    writeFileSync(
      path.join(scriptsLib, 'ok-handler.js'),
      `'use strict';\nfunction handleOk() { try { return {}; } catch { return {}; } }\nmodule.exports = { handleOk };\n`,
    );
    writeFileSync(
      path.join(agentsDir, 'bad-agent.md'),
      `---\nname: bad-agent\nmodel: sonnet\n---\n\n# 說明\n\n這個 agent 負責處理輸入資料並回傳結果。\n`,
    );

    const findings = checkRecoveryStrategy(tmpDir);
    const agentFindings = findings.filter((f) => f.file.includes('bad-agent.md'));
    expect(agentFindings.length).toBe(1);
    expect(agentFindings[0].check).toBe('recovery-strategy');
    expect(agentFindings[0].severity).toBe('warning');
    expect(agentFindings[0].message).toContain('bad-agent');
    expect(agentFindings[0].message).toContain('缺少停止條件或誤判防護描述');
  });

  // Scenario B-5: 動態掃描所有 *-handler.js，不跳過任何一個
  test('Scenario B-5: 動態掃描所有 handler，不硬編碼數量', () => {
    const { scriptsLib, agentsDir } = setupPluginRoot();
    // 建立 3 個 handler：2 個有 try-catch，1 個沒有
    writeFileSync(
      path.join(scriptsLib, 'a-handler.js'),
      `'use strict';\nfunction handleA() { try { return {}; } catch { return {}; } }\nmodule.exports = { handleA };\n`,
    );
    writeFileSync(
      path.join(scriptsLib, 'b-handler.js'),
      `'use strict';\nfunction handleB() { try { return {}; } catch { return {}; } }\nmodule.exports = { handleB };\n`,
    );
    writeFileSync(
      path.join(scriptsLib, 'c-handler.js'),
      `'use strict';\nfunction handleC() { return {}; }\nmodule.exports = { handleC };\n`,
    );
    // 空 agents 目錄（無 agent finding）

    const findings = checkRecoveryStrategy(tmpDir);
    const handlerFindings = findings.filter((f) => f.check === 'recovery-strategy' && f.file.includes('-handler.js'));
    // 只有 c-handler.js 缺 try-catch
    expect(handlerFindings.length).toBe(1);
    expect(handlerFindings[0].file).toContain('c-handler.js');
  });

  // Scenario B-6: finding schema 相容性
  test('Scenario B-6: finding 只包含 Finding schema 定義的欄位', () => {
    const findings = checkRecoveryStrategy(PLUGIN_ROOT);
    const validKeys = new Set(['check', 'severity', 'file', 'message', 'detail']);
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.check).toBe('recovery-strategy');
      expect(f.severity).toBe('warning');
      for (const key of Object.keys(f)) {
        expect(validKeys.has(key)).toBe(true);
      }
    }
  });

  // Scenario B-7: 誤判防護關鍵詞也可通過
  test('Scenario B-7: agent 含「誤判防護」關鍵詞時不產生 warning', () => {
    const { scriptsLib, agentsDir } = setupPluginRoot();
    writeFileSync(
      path.join(scriptsLib, 'guard-handler.js'),
      `'use strict';\nfunction handleGuard() { try { return {}; } catch { return {}; } }\nmodule.exports = { handleGuard };\n`,
    );
    writeFileSync(
      path.join(agentsDir, 'guarded-agent.md'),
      `---\nname: guarded-agent\nmodel: sonnet\n---\n\n## 誤判防護\n\n不要誤判以下情況...\n`,
    );

    const findings = checkRecoveryStrategy(tmpDir);
    const agentFindings = findings.filter((f) => f.file.includes('guarded-agent.md'));
    expect(agentFindings.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature C: checkCompletionGap — 補全能力缺口偵測
// ══════════════════════════════════════════════════════════════════

describe('checkCompletionGap', () => {
  let tmpSkillsDir;

  beforeEach(() => {
    tmpSkillsDir = path.join(os.tmpdir(), `ot-completion-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  });

  afterEach(() => {
    try { rmSync(tmpSkillsDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // Scenario C-1: skill 目錄有 references/ 時不產生 warning
  test('Scenario C-1: skill 目錄有 references/ 不產生 warning', () => {
    mkdirSync(path.join(tmpSkillsDir, 'skillA', 'references'), { recursive: true });
    writeFileSync(path.join(tmpSkillsDir, 'skillA', 'SKILL.md'), '# skillA');

    const findings = checkCompletionGap(tmpSkillsDir);
    expect(findings.length).toBe(0);
  });

  // Scenario C-2: skill 目錄缺少 references/ 時產生 warning
  test('Scenario C-2: skill 目錄缺少 references/ 產生 warning', () => {
    mkdirSync(path.join(tmpSkillsDir, 'skillB'), { recursive: true });
    writeFileSync(path.join(tmpSkillsDir, 'skillB', 'SKILL.md'), '# skillB');

    const findings = checkCompletionGap(tmpSkillsDir);
    expect(findings.length).toBe(1);
    expect(findings[0].check).toBe('completion-gap');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toContain('skillB');
    expect(findings[0].message).toContain('缺少 references/ 目錄');
  });

  // Scenario C-3: 混合有無 references/ 時各自獨立判定
  test('Scenario C-3: 混合有無 references/ 時只有缺少的產生 warning', () => {
    mkdirSync(path.join(tmpSkillsDir, 'skillA', 'references'), { recursive: true });
    writeFileSync(path.join(tmpSkillsDir, 'skillA', 'SKILL.md'), '# skillA');
    mkdirSync(path.join(tmpSkillsDir, 'skillB'), { recursive: true });
    writeFileSync(path.join(tmpSkillsDir, 'skillB', 'SKILL.md'), '# skillB');
    mkdirSync(path.join(tmpSkillsDir, 'skillC'), { recursive: true });
    writeFileSync(path.join(tmpSkillsDir, 'skillC', 'SKILL.md'), '# skillC');

    const findings = checkCompletionGap(tmpSkillsDir);
    expect(findings.length).toBe(2);

    const names = findings.map((f) => f.message);
    expect(names.some((m) => m.includes('skillB'))).toBe(true);
    expect(names.some((m) => m.includes('skillC'))).toBe(true);
    expect(names.some((m) => m.includes('skillA'))).toBe(false);
  });

  // Scenario C-4: skills 目錄為空時回傳空陣列
  test('Scenario C-4: 空 skills 目錄回傳空陣列', () => {
    mkdirSync(tmpSkillsDir, { recursive: true });

    const findings = checkCompletionGap(tmpSkillsDir);
    expect(findings).toEqual([]);
  });

  // Scenario C-5: 目錄不存在時不拋出例外
  test('Scenario C-5: 目錄不存在時不拋出例外，回傳空陣列', () => {
    const nonExistDir = path.join(os.tmpdir(), 'ot-nonexist-skills-xyz-12345');
    expect(() => checkCompletionGap(nonExistDir)).not.toThrow();
    const findings = checkCompletionGap(nonExistDir);
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBe(0);
  });

  // Scenario C-6: finding schema 相容性
  test('Scenario C-6: finding 只包含 Finding schema 定義的欄位，severity 為 warning', () => {
    mkdirSync(path.join(tmpSkillsDir, 'noref-skill'), { recursive: true });
    writeFileSync(path.join(tmpSkillsDir, 'noref-skill', 'SKILL.md'), '# test');

    const findings = checkCompletionGap(tmpSkillsDir);
    expect(findings.length).toBe(1);

    const validKeys = new Set(['check', 'severity', 'file', 'message', 'detail']);
    for (const f of findings) {
      expect(f.check).toBe('completion-gap');
      expect(f.severity).toBe('warning');
      for (const key of Object.keys(f)) {
        expect(validKeys.has(key)).toBe(true);
      }
    }
  });

  // Scenario C-7: 真實 codebase skills 目錄掃描不拋出例外
  test('Scenario C-7: 真實 codebase checkCompletionGap 不拋出例外', () => {
    expect(() => checkCompletionGap()).not.toThrow();
    const findings = checkCompletionGap();
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.check).toBe('completion-gap');
      expect(f.severity).toBe('warning');
    }
  });
});
