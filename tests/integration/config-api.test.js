'use strict';
/**
 * tests/integration/config-api.test.js — Config API 整合測試
 *
 * 針對 L2 結構化 API（createAgent/updateAgent/createHook/updateHook/createSkill/updateSkill）
 * 的實際 I/O 驗證，確認 atomicWrite 保護、多次操作的累積效果等。
 */

const { describe, it, expect, beforeEach } = require('bun:test');
const { mkdirSync, writeFileSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const {
  createAgent,
  updateAgent,
  createHook,
  updateHook,
  createSkill,
  updateSkill,
  validateAll,
} = require('../../plugins/overtone/scripts/lib/config-api');

// ── 輔助函式 ──

function makeTmpPluginRoot() {
  const dir = join(tmpdir(), `config-api-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, 'agents'), { recursive: true });
  mkdirSync(join(dir, 'hooks', 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'skills'), { recursive: true });
  mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });

  writeFileSync(join(dir, 'scripts', 'lib', 'registry-data.json'), JSON.stringify({
    stages: {
      DEV: { label: '開發', emoji: '💻', agent: 'developer', color: 'yellow' },
    },
    agentModels: { developer: 'sonnet' },
  }, null, 2));

  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: 'ot',
    version: '0.1.0',
    agents: [],
  }, null, 2));

  writeFileSync(join(dir, 'hooks', 'hooks.json'), JSON.stringify({ hooks: [] }, null, 2));

  return dir;
}

function makeScript(pluginRoot, name = 'test.js') {
  const path = join(pluginRoot, 'hooks', 'scripts', name);
  writeFileSync(path, '#!/usr/bin/env node\n');
  return path;
}

// ── createAgent 整合測試 ──

describe('createAgent 整合', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });

  it('連續建立兩個 agent 後 plugin.json 有兩個條目', () => {
    const body = '## DO\n\n## DON\'T\n\nHANDOFF';

    createAgent({
      name: 'agent-a',
      description: 'Agent A',
      model: 'sonnet',
      color: 'blue',
      stage: 'STAGE-A',
      emoji: '🅰️',
      label: '階段 A',
      maxTurns: 20,
      body,
    }, pluginRoot);

    createAgent({
      name: 'agent-b',
      description: 'Agent B',
      model: 'opus',
      color: 'red',
      stage: 'STAGE-B',
      emoji: '🅱️',
      label: '階段 B',
      maxTurns: 25,
      body,
    }, pluginRoot);

    const pluginJson = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
    expect(pluginJson.agents).toContain('./agents/agent-a.md');
    expect(pluginJson.agents).toContain('./agents/agent-b.md');

    const data = JSON.parse(readFileSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), 'utf8'));
    expect(data.stages['STAGE-A']).toBeDefined();
    expect(data.stages['STAGE-B']).toBeDefined();
    expect(data.agentModels['agent-a']).toBe('sonnet');
    expect(data.agentModels['agent-b']).toBe('opus');
  });

  it('createAgent 後 validateAll 對新 agent 回傳 valid:true（若 stage 在 registry 中）', () => {
    const body = '## DO\n\n## DON\'T\n\nHANDOFF';
    createAgent({
      name: 'qa',
      description: 'QA Agent',
      model: 'sonnet',
      color: 'green',
      stage: 'QA',
      emoji: '🏁',
      label: '驗證',
      maxTurns: 30,
      body,
    }, pluginRoot);

    const result = validateAll(pluginRoot);
    expect(result.agents['qa']).toBeDefined();
    expect(result.agents['qa'].valid).toBe(true);
  });

  it('建立 agent 時 registry-data.json 原有條目保留（不被覆蓋）', () => {
    const originalData = JSON.parse(readFileSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), 'utf8'));
    const originalStageCount = Object.keys(originalData.stages).length;

    createAgent({
      name: 'new-agent',
      description: '新 Agent',
      model: 'haiku',
      color: 'purple',
      stage: 'DOCS-NEW',
      emoji: '📄',
      label: '新文件',
      maxTurns: 10,
      body: '## DO\n\n## DON\'T\n\nHANDOFF',
    }, pluginRoot);

    const newData = JSON.parse(readFileSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), 'utf8'));
    // 原有 DEV stage 仍在
    expect(newData.stages['DEV']).toBeDefined();
    expect(newData.stages['DEV'].agent).toBe('developer');
    expect(Object.keys(newData.stages)).toHaveLength(originalStageCount + 1);
  });
});

// ── updateAgent 整合測試 ──

describe('updateAgent 整合', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // 預先建立 developer.md
    const content = [
      '---',
      'name: developer',
      'description: 開發者',
      'model: sonnet',
      'permissionMode: bypassPermissions',
      'color: yellow',
      'maxTurns: 50',
      '---',
      '',
      '## DO',
      '',
      "## DON'T",
      '',
      'HANDOFF',
    ].join('\n');
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), content);
  });

  it('updateAgent model 後再次 updateAgent 其他欄位，兩次更新都生效', () => {
    updateAgent('developer', { model: 'opus' }, pluginRoot);
    updateAgent('developer', { maxTurns: 20 }, pluginRoot);

    const content = readFileSync(join(pluginRoot, 'agents', 'developer.md'), 'utf8');
    expect(content).toContain('model: opus');
    expect(content).toContain('maxTurns: 20');
  });

  it('updateAgent 不變更 model 時不更新 registry-data.json 中的 agentModels', () => {
    const beforeData = JSON.parse(readFileSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), 'utf8'));
    const beforeModel = beforeData.agentModels['developer'];

    updateAgent('developer', { maxTurns: 25 }, pluginRoot);

    const afterData = JSON.parse(readFileSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), 'utf8'));
    expect(afterData.agentModels['developer']).toBe(beforeModel);
  });
});

// ── Hook 整合測試 ──

describe('createHook + updateHook 整合', () => {
  let pluginRoot;
  let scriptA;
  let scriptB;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    scriptA = makeScript(pluginRoot, 'a.js');
    scriptB = makeScript(pluginRoot, 'b.js');
  });

  it('createHook + updateHook 完整流程', () => {
    // 建立
    const createResult = createHook({ event: 'SessionEnd', command: scriptA }, pluginRoot);
    expect(createResult.success).toBe(true);

    // 更新 command
    const updateResult = updateHook('SessionEnd', { command: scriptB }, pluginRoot);
    expect(updateResult.success).toBe(true);

    const data = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    expect(data.hooks.find((h) => h.event === 'SessionEnd').command).toBe(scriptB);
  });

  it('createHook 兩個不同 event 後 hooks.json 有兩個條目', () => {
    createHook({ event: 'SessionEnd', command: scriptA }, pluginRoot);
    createHook({ event: 'PreCompact', command: scriptB }, pluginRoot);

    const data = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    expect(data.hooks).toHaveLength(2);
    expect(data.hooks.some((h) => h.event === 'SessionEnd')).toBe(true);
    expect(data.hooks.some((h) => h.event === 'PreCompact')).toBe(true);
  });

  it('createHook 失敗時 hooks.json 的現有條目不受影響', () => {
    // 先加一個合法 hook
    createHook({ event: 'SessionEnd', command: scriptA }, pluginRoot);
    const afterFirst = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));

    // 嘗試加一個不合法的 hook
    createHook({ event: 'BadEvent', command: scriptA }, pluginRoot);

    const afterFailed = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    expect(afterFailed.hooks).toHaveLength(afterFirst.hooks.length); // 沒增加
  });
});

// ── Skill 整合測試 ──

describe('createSkill + updateSkill 整合', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });

  it('createSkill + updateSkill 完整流程', () => {
    const createResult = createSkill({
      name: 'my-skill',
      description: '我的 skill',
      body: '# 說明',
    }, pluginRoot);
    expect(createResult.success).toBe(true);

    const updateResult = updateSkill('my-skill', { description: '更新後的描述' }, pluginRoot);
    expect(updateResult.success).toBe(true);

    const content = readFileSync(join(pluginRoot, 'skills', 'my-skill', 'SKILL.md'), 'utf8');
    expect(content).toContain('description: 更新後的描述');
    expect(content).toContain('# 說明'); // body 保留
  });

  it('連續建立多個 skill 都成功', () => {
    const names = ['skill-a', 'skill-b', 'skill-c'];
    for (const name of names) {
      const result = createSkill({ name, description: `${name} 說明`, body: '' }, pluginRoot);
      expect(result.success).toBe(true);
      expect(existsSync(join(pluginRoot, 'skills', name, 'SKILL.md'))).toBe(true);
    }
  });

  it('updateSkill body 替換後 frontmatter 完整保留', () => {
    createSkill({
      name: 'featured-skill',
      description: '特色 skill',
      'disable-model-invocation': true,
      'user-invocable': false,
      body: '# 舊說明',
    }, pluginRoot);

    updateSkill('featured-skill', { body: '# 新說明\n更多內容' }, pluginRoot);

    const content = readFileSync(join(pluginRoot, 'skills', 'featured-skill', 'SKILL.md'), 'utf8');
    expect(content).toContain('name: featured-skill');
    expect(content).toContain('description: 特色 skill');
    expect(content).toContain('disable-model-invocation: true');
    expect(content).toContain('user-invocable: false');
    expect(content).toContain('# 新說明');
    expect(content).not.toContain('# 舊說明');
  });
});
