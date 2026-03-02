'use strict';
/**
 * component-repair.test.js — 元件自動修復模組單元測試
 *
 * 覆蓋：
 *   Feature 1: listAgentFiles / extractAgentFilenames — 輔助函式
 *   Feature 2: parseFrontmatterContent — frontmatter 解析
 *   Feature 3: scanPluginJsonAgents — Rule 1（plugin.json vs agents/）
 *   Feature 4: scanRegistryDataAgents — Rule 2（registry-data.json vs agents/）
 *   Feature 5: scanAgentFrontmatter — Rule 3（必填欄位偵測）
 *   Feature 6: scanHooksJsonEvents — Rule 4（hooks.json 事件名稱）
 *   Feature 7: autoRepair — 自動修復行為
 *   Feature 8: runComponentRepair — 一鍵掃描 + 修復
 *   Feature 9: 邊界情況（空目錄、格式錯誤、不存在的檔案）
 */

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const { join } = require('path');
const os = require('os');

const {
  scanInconsistencies,
  autoRepair,
  runComponentRepair,
  scanPluginJsonAgents,
  scanRegistryDataAgents,
  scanAgentFrontmatter,
  scanHooksJsonEvents,
  listAgentFiles,
  extractAgentFilenames,
  parseFrontmatterContent,
} = require('../../plugins/overtone/scripts/lib/component-repair');

// ── 沙盒工具 ──────────────────────────────────────────────────────────────

let tmpDir;

function setupSandbox() {
  tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'component-repair-test-'));
  return tmpDir;
}

function teardownSandbox() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = null;
}

/**
 * 建立基本的 plugin 沙盒結構
 * @param {object} opts
 * @param {string[]} opts.agentFiles      - agents/ 下的 .md 檔名
 * @param {string[]} opts.pluginJsonAgents - plugin.json agents 陣列（相對路徑）
 * @param {object}  opts.agentModels      - registry-data.json agentModels
 * @param {string[]} opts.hookEvents      - hooks.json 的 event 名稱
 * @param {object}  opts.agentFrontmatters - { filename: frontmatterObj } 指定各 agent 的 frontmatter
 * @returns {object} 路徑集合（供 injectedPaths 使用）
 */
function createSandbox(opts = {}) {
  const {
    agentFiles = [],
    pluginJsonAgents = null,
    agentModels = {},
    hookEvents = ['SessionStart', 'SessionEnd'],
    agentFrontmatters = {},
  } = opts;

  const pluginRoot = join(tmpDir, 'plugin');
  const agentsDir = join(pluginRoot, 'agents');
  const pluginJsonDir = join(pluginRoot, '.claude-plugin');
  const hooksDir = join(pluginRoot, 'hooks');
  const libDir = join(pluginRoot, 'scripts', 'lib');

  for (const d of [agentsDir, pluginJsonDir, hooksDir, libDir]) {
    fs.mkdirSync(d, { recursive: true });
  }

  // 建立 agents
  for (const filename of agentFiles) {
    const fm = agentFrontmatters[filename] || {
      model: 'sonnet',
      permissionMode: 'bypassPermissions',
    };
    const frontmatterLines = Object.entries(fm)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    const content = `---\n${frontmatterLines}\n---\n\n# Agent\n`;
    fs.writeFileSync(join(agentsDir, filename), content, 'utf8');
  }

  // 建立 plugin.json
  const listedAgents = pluginJsonAgents !== null
    ? pluginJsonAgents
    : agentFiles.map(f => `./agents/${f}`);
  fs.writeFileSync(
    join(pluginJsonDir, 'plugin.json'),
    JSON.stringify({ name: 'ot', version: '1.0.0', agents: listedAgents }, null, 2),
    'utf8'
  );

  // 建立 registry-data.json
  const registryData = {
    stages: {},
    agentModels,
    effortLevels: { opus: 'high', sonnet: 'medium', haiku: 'low' },
    agentMemory: {},
  };
  const registryDataPath = join(libDir, 'registry-data.json');
  fs.writeFileSync(registryDataPath, JSON.stringify(registryData, null, 2), 'utf8');

  // 建立 hooks.json（官方三層嵌套格式）
  const hooksObj = {};
  for (const ev of hookEvents) {
    hooksObj[ev] = [{ hooks: [{ type: 'command', command: 'echo ok' }] }];
  }
  fs.writeFileSync(
    join(hooksDir, 'hooks.json'),
    JSON.stringify({ hooks: hooksObj }, null, 2),
    'utf8'
  );

  return {
    agentsDir,
    pluginJsonPath: join(pluginJsonDir, 'plugin.json'),
    registryDataPath,
    hooksJsonPath: join(hooksDir, 'hooks.json'),
    hookEventsRef: ['SessionStart', 'SessionEnd', 'PreCompact',
      'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
      'PostToolUseFailure', 'SubagentStop', 'Stop',
      'TaskCompleted', 'Notification'],
  };
}

// ══════════════════════════════════════════════════════════════════
// Feature 1: listAgentFiles / extractAgentFilenames
// ══════════════════════════════════════════════════════════════════

describe('listAgentFiles', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('回傳排序後的 .md 檔名清單', () => {
    const agentsDir = join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir);
    fs.writeFileSync(join(agentsDir, 'tester.md'), '');
    fs.writeFileSync(join(agentsDir, 'developer.md'), '');
    fs.writeFileSync(join(agentsDir, 'planner.md'), '');

    const result = listAgentFiles(agentsDir);
    expect(result).toEqual(['developer.md', 'planner.md', 'tester.md']);
  });

  test('過濾非 .md 檔案', () => {
    const agentsDir = join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir);
    fs.writeFileSync(join(agentsDir, 'developer.md'), '');
    fs.writeFileSync(join(agentsDir, 'notes.txt'), '');

    const result = listAgentFiles(agentsDir);
    expect(result).toEqual(['developer.md']);
  });

  test('目錄不存在時回傳空陣列', () => {
    const result = listAgentFiles(join(tmpDir, 'nonexistent'));
    expect(result).toEqual([]);
  });

  test('空目錄回傳空陣列', () => {
    const agentsDir = join(tmpDir, 'empty-agents');
    fs.mkdirSync(agentsDir);
    const result = listAgentFiles(agentsDir);
    expect(result).toEqual([]);
  });
});

describe('extractAgentFilenames', () => {
  test('從相對路徑陣列取出檔名', () => {
    const result = extractAgentFilenames([
      './agents/developer.md',
      './agents/planner.md',
    ]);
    expect(result).toEqual(['developer.md', 'planner.md']);
  });

  test('空陣列回傳空陣列', () => {
    expect(extractAgentFilenames([])).toEqual([]);
  });

  test('非陣列輸入回傳空陣列', () => {
    expect(extractAgentFilenames(null)).toEqual([]);
    expect(extractAgentFilenames(undefined)).toEqual([]);
  });

  test('結果已排序', () => {
    const result = extractAgentFilenames([
      './agents/tester.md',
      './agents/developer.md',
    ]);
    expect(result).toEqual(['developer.md', 'tester.md']);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: parseFrontmatterContent
// ══════════════════════════════════════════════════════════════════

describe('parseFrontmatterContent', () => {
  test('解析基本字串欄位', () => {
    const content = `---\nname: developer\nmodel: sonnet\n---\n# body`;
    const fm = parseFrontmatterContent(content);
    expect(fm.name).toBe('developer');
    expect(fm.model).toBe('sonnet');
  });

  test('解析 boolean 欄位', () => {
    const content = `---\nbypassPermissions: true\nenabled: false\n---\n`;
    const fm = parseFrontmatterContent(content);
    expect(fm.bypassPermissions).toBe(true);
    expect(fm.enabled).toBe(false);
  });

  test('解析 list 欄位', () => {
    const content = `---\nskills:\n  - testing\n  - workflow-core\n---\n`;
    const fm = parseFrontmatterContent(content);
    expect(fm.skills).toEqual(['testing', 'workflow-core']);
  });

  test('解析 permissionMode 字串', () => {
    const content = `---\npermissionMode: bypassPermissions\n---\n`;
    const fm = parseFrontmatterContent(content);
    expect(fm.permissionMode).toBe('bypassPermissions');
  });

  test('無 frontmatter 時回傳空物件', () => {
    const content = `# Just a header\nNo frontmatter here.`;
    const fm = parseFrontmatterContent(content);
    expect(fm).toEqual({});
  });

  test('空字串回傳空物件', () => {
    expect(parseFrontmatterContent('')).toEqual({});
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 3: scanPluginJsonAgents — Rule 1
// ══════════════════════════════════════════════════════════════════

describe('scanPluginJsonAgents — Rule 1', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('一致時回傳空 issues', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md', 'planner.md'],
      pluginJsonAgents: ['./agents/developer.md', './agents/planner.md'],
    });
    const issues = scanPluginJsonAgents(paths);
    expect(issues).toHaveLength(0);
  });

  test('plugin.json 有幽靈 agent（列出但不存在）', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      pluginJsonAgents: ['./agents/developer.md', './agents/ghost.md'],
    });
    const issues = scanPluginJsonAgents(paths);
    const ghostIssues = issues.filter(i => i.type === 'plugin-json-ghost-agent');
    expect(ghostIssues).toHaveLength(1);
    expect(ghostIssues[0].message).toContain('ghost.md');
    expect(ghostIssues[0].autoFixable).toBe(true);
  });

  test('plugin.json 遺漏 agent（存在但未列出）', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md', 'planner.md'],
      pluginJsonAgents: ['./agents/developer.md'],
    });
    const issues = scanPluginJsonAgents(paths);
    const missingIssues = issues.filter(i => i.type === 'plugin-json-missing-agent');
    expect(missingIssues).toHaveLength(1);
    expect(missingIssues[0].message).toContain('planner.md');
    expect(missingIssues[0].autoFixable).toBe(true);
  });

  test('同時有幽靈和遺漏', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md', 'new-agent.md'],
      pluginJsonAgents: ['./agents/developer.md', './agents/old-agent.md'],
    });
    const issues = scanPluginJsonAgents(paths);
    expect(issues.some(i => i.type === 'plugin-json-ghost-agent')).toBe(true);
    expect(issues.some(i => i.type === 'plugin-json-missing-agent')).toBe(true);
  });

  test('plugin.json 不存在時回傳 parse-error issue', () => {
    const paths = createSandbox({ agentFiles: [] });
    paths.pluginJsonPath = join(tmpDir, 'nonexistent', 'plugin.json');
    const issues = scanPluginJsonAgents(paths);
    expect(issues[0].type).toBe('plugin-json-parse-error');
    expect(issues[0].autoFixable).toBe(false);
  });

  test('plugin.json 內容非 JSON 時回傳 parse-error issue', () => {
    const paths = createSandbox({ agentFiles: ['developer.md'] });
    fs.writeFileSync(paths.pluginJsonPath, 'NOT JSON', 'utf8');
    const issues = scanPluginJsonAgents(paths);
    expect(issues[0].type).toBe('plugin-json-parse-error');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 4: scanRegistryDataAgents — Rule 2
// ══════════════════════════════════════════════════════════════════

describe('scanRegistryDataAgents — Rule 2', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('一致時回傳空 issues', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md', 'planner.md'],
      agentModels: { developer: 'sonnet', planner: 'opus' },
    });
    const issues = scanRegistryDataAgents(paths);
    expect(issues).toHaveLength(0);
  });

  test('registry-data 有幽靈 agent（agentModels key 存在但 agents/ 無對應檔案）', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      agentModels: { developer: 'sonnet', ghost: 'haiku' },
    });
    const issues = scanRegistryDataAgents(paths);
    const ghostIssues = issues.filter(i => i.type === 'registry-data-ghost-agent');
    expect(ghostIssues).toHaveLength(1);
    expect(ghostIssues[0].message).toContain('ghost');
    expect(ghostIssues[0].autoFixable).toBe(false);
  });

  test('agents/ 有 agent 但 registry-data 未列出（非 grader）', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md', 'new-agent.md'],
      agentModels: { developer: 'sonnet' },
    });
    const issues = scanRegistryDataAgents(paths);
    const missingIssues = issues.filter(i => i.type === 'registry-data-missing-agent');
    expect(missingIssues).toHaveLength(1);
    expect(missingIssues[0].message).toContain('new-agent');
  });

  test('grader 不在 agentModels 是預期行為，不報告問題', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md', 'grader.md'],
      agentModels: { developer: 'sonnet' },
    });
    const issues = scanRegistryDataAgents(paths);
    const graderIssues = issues.filter(i =>
      i.component && i.component.includes('grader')
    );
    expect(graderIssues).toHaveLength(0);
  });

  test('registry-data.json 不存在時回傳 parse-error issue', () => {
    const paths = createSandbox({ agentFiles: [] });
    paths.registryDataPath = join(tmpDir, 'nonexistent', 'registry-data.json');
    const issues = scanRegistryDataAgents(paths);
    expect(issues[0].type).toBe('registry-data-parse-error');
    expect(issues[0].autoFixable).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 5: scanAgentFrontmatter — Rule 3
// ══════════════════════════════════════════════════════════════════

describe('scanAgentFrontmatter — Rule 3', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('完整 frontmatter 無問題（permissionMode 形式）', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      agentFrontmatters: {
        'developer.md': { model: 'sonnet', permissionMode: 'bypassPermissions' },
      },
    });
    const issues = scanAgentFrontmatter(paths);
    expect(issues).toHaveLength(0);
  });

  test('完整 frontmatter 無問題（bypassPermissions: true 形式）', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      agentFrontmatters: {
        'developer.md': { model: 'sonnet', bypassPermissions: true },
      },
    });
    const issues = scanAgentFrontmatter(paths);
    expect(issues).toHaveLength(0);
  });

  test('缺少 model 欄位報告 agent-missing-field', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      agentFrontmatters: {
        'developer.md': { permissionMode: 'bypassPermissions' },
      },
    });
    const issues = scanAgentFrontmatter(paths);
    const modelIssues = issues.filter(i => i.type === 'agent-missing-field' && i.component.includes('model'));
    expect(modelIssues).toHaveLength(1);
    expect(modelIssues[0].autoFixable).toBe(false);
  });

  test('缺少 bypassPermissions（任何形式）報告 agent-missing-field', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      agentFrontmatters: {
        'developer.md': { model: 'sonnet' },
      },
    });
    const issues = scanAgentFrontmatter(paths);
    const bypassIssues = issues.filter(
      i => i.type === 'agent-missing-field' && i.component.includes('bypassPermissions')
    );
    expect(bypassIssues).toHaveLength(1);
  });

  test('多個 agent 各自獨立偵測', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md', 'planner.md'],
      agentFrontmatters: {
        'developer.md': { model: 'sonnet', permissionMode: 'bypassPermissions' },
        'planner.md': { permissionMode: 'bypassPermissions' }, // 缺 model
      },
    });
    const issues = scanAgentFrontmatter(paths);
    const modelIssues = issues.filter(i => i.type === 'agent-missing-field' && i.component.includes('model'));
    expect(modelIssues).toHaveLength(1);
    expect(modelIssues[0].component).toContain('planner.md');
  });

  test('agents 目錄不存在時回傳空 issues', () => {
    const paths = createSandbox({ agentFiles: [] });
    paths.agentsDir = join(tmpDir, 'nonexistent-agents');
    const issues = scanAgentFrontmatter(paths);
    expect(issues).toHaveLength(0);
  });

  test('無 frontmatter 的 agent 報告兩個必填欄位缺失', () => {
    const agentsDir = join(tmpDir, 'agents-no-fm');
    fs.mkdirSync(agentsDir);
    fs.writeFileSync(join(agentsDir, 'bad-agent.md'), '# No frontmatter\n', 'utf8');

    const paths = createSandbox({ agentFiles: [] });
    paths.agentsDir = agentsDir;

    const issues = scanAgentFrontmatter(paths);
    const missingFields = issues.filter(i => i.type === 'agent-missing-field');
    expect(missingFields.length).toBeGreaterThanOrEqual(2);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 6: scanHooksJsonEvents — Rule 4
// ══════════════════════════════════════════════════════════════════

describe('scanHooksJsonEvents — Rule 4', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('所有事件都在 hookEventsRef 中 → 無問題', () => {
    const paths = createSandbox({
      agentFiles: [],
      hookEvents: ['SessionStart', 'SessionEnd'],
    });
    const issues = scanHooksJsonEvents(paths);
    expect(issues).toHaveLength(0);
  });

  test('使用未知事件名稱 → 報告 hooks-json-unknown-event', () => {
    const paths = createSandbox({
      agentFiles: [],
      hookEvents: ['SessionStart', 'UnknownEvent'],
    });
    const issues = scanHooksJsonEvents(paths);
    const unknownIssues = issues.filter(i => i.type === 'hooks-json-unknown-event');
    expect(unknownIssues).toHaveLength(1);
    expect(unknownIssues[0].message).toContain('UnknownEvent');
    expect(unknownIssues[0].autoFixable).toBe(false);
  });

  test('多個未知事件各自報告', () => {
    const paths = createSandbox({
      agentFiles: [],
      hookEvents: ['BadEvent1', 'BadEvent2'],
    });
    const issues = scanHooksJsonEvents(paths);
    const unknownIssues = issues.filter(i => i.type === 'hooks-json-unknown-event');
    expect(unknownIssues).toHaveLength(2);
  });

  test('hooks.json 不存在時回傳 parse-error issue', () => {
    const paths = createSandbox({ agentFiles: [] });
    paths.hooksJsonPath = join(tmpDir, 'nonexistent', 'hooks.json');
    const issues = scanHooksJsonEvents(paths);
    expect(issues[0].type).toBe('hooks-json-parse-error');
    expect(issues[0].autoFixable).toBe(false);
  });

  test('hooks.json 格式錯誤時回傳 parse-error issue', () => {
    const paths = createSandbox({ agentFiles: [] });
    fs.writeFileSync(paths.hooksJsonPath, 'INVALID JSON', 'utf8');
    const issues = scanHooksJsonEvents(paths);
    expect(issues[0].type).toBe('hooks-json-parse-error');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 7: autoRepair
// ══════════════════════════════════════════════════════════════════

describe('autoRepair', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('無 issues 時回傳空結果', () => {
    const paths = createSandbox({ agentFiles: ['developer.md'] });
    const result = autoRepair([], paths);
    expect(result.fixed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  test('不可修復的 issues 都進 skipped', () => {
    const issues = [
      { type: 'agent-missing-field', component: 'dev.md → model', message: '缺 model', autoFixable: false },
      { type: 'registry-data-ghost-agent', component: 'x', message: 'ghost', autoFixable: false },
    ];
    const paths = createSandbox({ agentFiles: [] });
    const result = autoRepair(issues, paths);
    expect(result.skipped).toHaveLength(2);
    expect(result.fixed).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  test('修復 plugin-json-ghost-agent：移除幽靈 agent', () => {
    // agents/ 只有 developer.md，但 plugin.json 還列了 ghost.md
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      pluginJsonAgents: ['./agents/developer.md', './agents/ghost.md'],
    });

    const scanResult = scanInconsistencies(paths);
    const result = autoRepair(scanResult.issues, paths);

    // 驗證修復成功
    expect(result.fixed.length).toBeGreaterThan(0);

    // 驗證 plugin.json 已更新
    const updated = JSON.parse(fs.readFileSync(paths.pluginJsonPath, 'utf8'));
    expect(updated.agents).toEqual(['./agents/developer.md']);
  });

  test('修復 plugin-json-missing-agent：補上遺漏的 agent', () => {
    // agents/ 有 developer.md + planner.md，但 plugin.json 只列了 developer.md
    const paths = createSandbox({
      agentFiles: ['developer.md', 'planner.md'],
      pluginJsonAgents: ['./agents/developer.md'],
    });

    const scanResult = scanInconsistencies(paths);
    const result = autoRepair(scanResult.issues, paths);

    expect(result.fixed.length).toBeGreaterThan(0);

    const updated = JSON.parse(fs.readFileSync(paths.pluginJsonPath, 'utf8'));
    expect(updated.agents).toContain('./agents/developer.md');
    expect(updated.agents).toContain('./agents/planner.md');
  });

  test('同時有 ghost 和 missing 時，一次修復全部 Rule 1 問題', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md', 'new-agent.md'],
      pluginJsonAgents: ['./agents/developer.md', './agents/old-agent.md'],
    });

    const scanResult = scanInconsistencies(paths);
    const rule1Issues = scanResult.issues.filter(i => i.autoFixable);
    expect(rule1Issues.length).toBeGreaterThan(0);

    const result = autoRepair(scanResult.issues, paths);
    expect(result.fixed.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    const updated = JSON.parse(fs.readFileSync(paths.pluginJsonPath, 'utf8'));
    expect(updated.agents).toContain('./agents/developer.md');
    expect(updated.agents).toContain('./agents/new-agent.md');
    expect(updated.agents).not.toContain('./agents/old-agent.md');
  });

  test('修復時保留 plugin.json 其他欄位', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      pluginJsonAgents: ['./agents/ghost.md'],
    });

    const issues = [
      { type: 'plugin-json-ghost-agent', component: 'ghost.md', message: '', autoFixable: true },
    ];
    autoRepair(issues, paths);

    const updated = JSON.parse(fs.readFileSync(paths.pluginJsonPath, 'utf8'));
    expect(updated.name).toBe('ot');
    expect(updated.version).toBe('1.0.0');
  });

  test('agents 目錄不存在時 Rule 1 修復應進 errors', () => {
    const paths = createSandbox({ agentFiles: [] });
    paths.agentsDir = join(tmpDir, 'nonexistent-agents');

    const issues = [
      { type: 'plugin-json-missing-agent', component: 'x.md', message: '', autoFixable: true },
    ];
    const result = autoRepair(issues, paths);
    expect(result.errors).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 8: runComponentRepair — 一鍵掃描 + 修復
// ══════════════════════════════════════════════════════════════════

describe('runComponentRepair', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('無問題時回傳 isClean 狀態', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      pluginJsonAgents: ['./agents/developer.md'],
      agentModels: { developer: 'sonnet' },
    });

    const result = runComponentRepair(paths);
    expect(result.scan).toBeDefined();
    expect(result.repair).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe('string');
  });

  test('回傳值包含 scan、repair、summary 三個欄位', () => {
    const paths = createSandbox({ agentFiles: ['developer.md'] });
    const result = runComponentRepair(paths);
    expect(result).toHaveProperty('scan');
    expect(result).toHaveProperty('repair');
    expect(result).toHaveProperty('summary');
  });

  test('有修復項目時 summary 包含修復訊息', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      pluginJsonAgents: ['./agents/ghost.md'],
    });

    const result = runComponentRepair(paths);
    expect(result.summary).toContain('FIXED');
  });

  test('有手動問題時 summary 包含 MANUAL 訊息', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      agentFrontmatters: {
        'developer.md': { permissionMode: 'bypassPermissions' }, // 缺 model
      },
      pluginJsonAgents: ['./agents/developer.md'],
      agentModels: { developer: 'sonnet' },
    });

    const result = runComponentRepair(paths);
    expect(result.summary).toContain('MANUAL');
  });

  test('scan.summary 包含正確數量', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md', 'planner.md'],
      pluginJsonAgents: ['./agents/developer.md'],
    });

    const result = runComponentRepair(paths);
    expect(result.scan.summary.total).toBeGreaterThan(0);
    expect(typeof result.scan.summary.autoFixable).toBe('number');
    expect(typeof result.scan.summary.manualOnly).toBe('number');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 9: scanInconsistencies 整合
// ══════════════════════════════════════════════════════════════════

describe('scanInconsistencies', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('完全一致的環境回傳空 issues', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md', 'planner.md'],
      pluginJsonAgents: ['./agents/developer.md', './agents/planner.md'],
      agentModels: { developer: 'sonnet', planner: 'opus' },
      hookEvents: ['SessionStart', 'SessionEnd'],
    });

    const { issues, summary } = scanInconsistencies(paths);
    expect(issues).toHaveLength(0);
    expect(summary.total).toBe(0);
    expect(summary.autoFixable).toBe(0);
    expect(summary.manualOnly).toBe(0);
  });

  test('summary.byType 記錄問題類型分布', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      pluginJsonAgents: ['./agents/developer.md', './agents/ghost.md'],
      agentModels: { developer: 'sonnet' },
      hookEvents: ['SessionStart'],
    });

    const { summary } = scanInconsistencies(paths);
    expect(summary.byType['plugin-json-ghost-agent']).toBe(1);
  });

  test('summary.autoFixable 與 manualOnly 加總等於 total', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      pluginJsonAgents: ['./agents/ghost.md'],
      agentModels: {},
      hookEvents: ['SessionStart', 'UnknownEvent'],
    });

    const { summary } = scanInconsistencies(paths);
    expect(summary.autoFixable + summary.manualOnly).toBe(summary.total);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 9: 邊界情況
// ══════════════════════════════════════════════════════════════════

describe('邊界情況', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('plugin.json agents 為空陣列 + agents 目錄為空 → 無問題', () => {
    const paths = createSandbox({
      agentFiles: [],
      pluginJsonAgents: [],
      agentModels: {},
    });
    const { issues } = scanInconsistencies(paths);
    // 只有可能的 frontmatter 問題，但 agents 目錄空所以無 frontmatter 問題
    expect(issues).toHaveLength(0);
  });

  test('plugin.json agents 欄位不存在 → 應偵測所有實際 agents 為遺漏', () => {
    const paths = createSandbox({
      agentFiles: ['developer.md'],
      pluginJsonAgents: [],
    });
    // 手動覆蓋 plugin.json 為無 agents 欄位版本
    fs.writeFileSync(paths.pluginJsonPath, JSON.stringify({ name: 'ot', version: '1.0.0' }, null, 2), 'utf8');

    const issues = scanPluginJsonAgents(paths);
    const missingIssues = issues.filter(i => i.type === 'plugin-json-missing-agent');
    expect(missingIssues).toHaveLength(1);
  });

  test('hooks.json hooks 欄位為空物件 → 無問題', () => {
    const paths = createSandbox({ agentFiles: [] });
    fs.writeFileSync(paths.hooksJsonPath, JSON.stringify({ hooks: {} }, null, 2), 'utf8');
    const issues = scanHooksJsonEvents(paths);
    expect(issues).toHaveLength(0);
  });

  test('agent .md 檔案只有標題無 frontmatter → 報告必填欄位缺失', () => {
    const agentsDir = join(tmpDir, 'sparse-agents');
    fs.mkdirSync(agentsDir);
    fs.writeFileSync(join(agentsDir, 'sparse.md'), '# Sparse Agent\nNo frontmatter.\n', 'utf8');

    const paths = createSandbox({ agentFiles: [] });
    paths.agentsDir = agentsDir;

    const issues = scanAgentFrontmatter(paths);
    expect(issues.some(i => i.type === 'agent-missing-field')).toBe(true);
  });

  test('autoRepair 傳入空 issues 陣列不拋例外', () => {
    const paths = createSandbox({ agentFiles: [] });
    expect(() => autoRepair([], paths)).not.toThrow();
  });
});
