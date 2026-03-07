'use strict';
/**
 * tests/unit/config-api.test.js — Config API 單元測試
 *
 * 使用 tmpdir 建立假的 plugin 目錄結構，避免影響真實 agents/ 目錄。
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, writeFileSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');
const {
  validateAgent,
  validateHook,
  validateSkill,
  validateAll,
  createAgent,
  updateAgent,
  createHook,
  updateHook,
  createSkill,
  updateSkill,
} = require(join(SCRIPTS_LIB, 'config-api'));

// ── 輔助函式 ──

function makeTmpPluginRoot() {
  const dir = join(tmpdir(), `config-api-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, 'agents'), { recursive: true });
  mkdirSync(join(dir, 'hooks'), { recursive: true });
  mkdirSync(join(dir, 'skills'), { recursive: true });
  mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });

  // 建立預設 registry-data.json
  writeFileSync(join(dir, 'scripts', 'lib', 'registry-data.json'), JSON.stringify({
    stages: {
      DEV: { label: '開發', emoji: '💻', agent: 'developer', color: 'yellow' },
    },
    agentModels: {
      developer: 'sonnet',
    },
  }, null, 2));

  // 建立預設 plugin.json
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: 'ot',
    version: '0.1.0',
    agents: ['./agents/developer.md'],
  }, null, 2));

  // 建立預設 hooks.json（空物件）
  writeFileSync(join(dir, 'hooks', 'hooks.json'), JSON.stringify({ hooks: {} }, null, 2));

  return dir;
}

/**
 * 建立一個最小有效的 agent .md
 */
function makeValidAgentMd(overrides = {}) {
  const fm = {
    name: overrides.name || 'developer',
    description: overrides.description || '開發者',
    model: overrides.model || 'sonnet',
    permissionMode: overrides.permissionMode || 'bypassPermissions',
    color: overrides.color || 'yellow',
    maxTurns: overrides.maxTurns !== undefined ? overrides.maxTurns : 50,
  };

  let fmLines = ['---'];
  fmLines.push(`name: ${fm.name}`);
  if (overrides.skipDescription) {
    // 不加 description
  } else {
    fmLines.push(`description: ${fm.description}`);
  }
  if (!overrides.skipModel) {
    fmLines.push(`model: ${fm.model}`);
  }
  if (!overrides.skipPermissionMode) {
    fmLines.push(`permissionMode: ${fm.permissionMode}`);
  }
  if (!overrides.skipColor) {
    fmLines.push(`color: ${fm.color}`);
  }
  if (overrides.maxTurns !== null) {
    fmLines.push(`maxTurns: ${fm.maxTurns}`);
  }

  if (overrides.disallowedTools && overrides.disallowedTools.length > 0) {
    fmLines.push('disallowedTools:');
    for (const t of overrides.disallowedTools) {
      fmLines.push(`  - ${t}`);
    }
  }

  if (overrides.tools && overrides.tools.length > 0) {
    fmLines.push('tools:');
    for (const t of overrides.tools) {
      fmLines.push(`  - ${t}`);
    }
  }

  if (overrides.skills && overrides.skills.length > 0) {
    fmLines.push('skills:');
    for (const s of overrides.skills) {
      fmLines.push(`  - ${s}`);
    }
  }

  fmLines.push('---');
  return fmLines.join('\n') + '\n\n## DO\n\n## DON\'T\n\nHANDOFF';
}

/**
 * 建立一個最小有效的 skill SKILL.md
 */
function makeValidSkillMd(overrides = {}) {
  const lines = ['---'];
  if (!overrides.skipName) lines.push(`name: ${overrides.name || 'test-skill'}`);
  if (!overrides.skipDescription) lines.push(`description: ${overrides.description || '測試 skill'}`);
  if (overrides['disable-model-invocation'] !== undefined) {
    lines.push(`disable-model-invocation: ${overrides['disable-model-invocation']}`);
  }
  if (overrides['user-invocable'] !== undefined) {
    lines.push(`user-invocable: ${overrides['user-invocable']}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n\n# Skill Body';
}

// ── validateAgent 測試 ──

describe('validateAgent', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });

  it('驗證格式完整正確的 agent 回傳 valid:true', () => {
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), makeValidAgentMd());
    const result = validateAgent('developer', pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('agent .md 檔案不存在時回傳 valid:false 且 errors 含 "nonexistent" 和 "不存在"', () => {
    const result = validateAgent('nonexistent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent') && e.includes('不存在'))).toBe(true);
  });

  it('frontmatter 缺少 name 欄位時回傳 errors 含 "name" 和 "必填"', () => {
    const content = makeValidAgentMd({ skipName: false });
    // 故意移除 name 行
    const noName = content.replace(/^name:.*\n/m, '');
    writeFileSync(join(pluginRoot, 'agents', 'bad-agent.md'), noName);
    const result = validateAgent('bad-agent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name') && e.includes('必填'))).toBe(true);
  });

  it('frontmatter 缺少 description 欄位時回傳 errors 含 "description"', () => {
    const content = makeValidAgentMd({ skipDescription: true });
    writeFileSync(join(pluginRoot, 'agents', 'bad-agent.md'), content);
    const result = validateAgent('bad-agent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('description'))).toBe(true);
  });

  it('frontmatter 缺少 model 欄位時回傳 errors 含 "model"', () => {
    const content = makeValidAgentMd({ skipModel: true });
    writeFileSync(join(pluginRoot, 'agents', 'bad-agent.md'), content);
    const result = validateAgent('bad-agent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('model'))).toBe(true);
  });

  it('model 值不合法時 errors 含模型值和合法清單', () => {
    const content = makeValidAgentMd({ model: 'gpt-4' });
    writeFileSync(join(pluginRoot, 'agents', 'bad-model-agent.md'), content);
    const result = validateAgent('bad-model-agent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('gpt-4') && e.includes('opus') && e.includes('sonnet') && e.includes('haiku'))).toBe(true);
  });

  it('permissionMode 不是 bypassPermissions 時 errors 含 "permissionMode"', () => {
    const content = makeValidAgentMd({ permissionMode: 'default' });
    writeFileSync(join(pluginRoot, 'agents', 'bad-perm-agent.md'), content);
    const result = validateAgent('bad-perm-agent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('permissionMode'))).toBe(true);
  });

  it('缺少 color 欄位時 errors 含 "color"', () => {
    const content = makeValidAgentMd({ skipColor: true });
    writeFileSync(join(pluginRoot, 'agents', 'no-color-agent.md'), content);
    const result = validateAgent('no-color-agent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('color'))).toBe(true);
  });

  it('maxTurns 為 0 時 errors 含 "maxTurns" 和 "正整數"', () => {
    const content = makeValidAgentMd({ maxTurns: 0 });
    writeFileSync(join(pluginRoot, 'agents', 'zero-turns-agent.md'), content);
    const result = validateAgent('zero-turns-agent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maxTurns') && e.includes('正整數'))).toBe(true);
  });

  it('maxTurns 為負數時 errors 含 "maxTurns"', () => {
    const content = makeValidAgentMd({ maxTurns: -5 });
    writeFileSync(join(pluginRoot, 'agents', 'neg-turns-agent.md'), content);
    const result = validateAgent('neg-turns-agent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maxTurns'))).toBe(true);
  });

  it('disallowedTools 含未知工具時 warnings 含工具名稱和 "未知"，valid 仍為 true', () => {
    const content = makeValidAgentMd({ disallowedTools: ['UnknownTool'] });
    writeFileSync(join(pluginRoot, 'agents', 'agent-with-unknown-tool.md'), content);
    const result = validateAgent('agent-with-unknown-tool', pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes('UnknownTool') && w.includes('未知'))).toBe(true);
  });

  it('disallowedTools 含已知工具不產生 warning', () => {
    const content = makeValidAgentMd({ disallowedTools: ['Read', 'Write'] });
    writeFileSync(join(pluginRoot, 'agents', 'agent-known-tools.md'), content);
    const result = validateAgent('agent-known-tools', pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('skills 引用不存在的 skill 時 errors 含 skill 名稱和 "不存在"', () => {
    const content = makeValidAgentMd({ skills: ['nonexistent-skill'] });
    writeFileSync(join(pluginRoot, 'agents', 'agent-missing-skill.md'), content);
    const result = validateAgent('agent-missing-skill', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent-skill') && e.includes('不存在'))).toBe(true);
  });

  it('skills 引用存在的 skill 通過驗證', () => {
    // 建立 skill
    mkdirSync(join(pluginRoot, 'skills', 'auto'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'auto', 'SKILL.md'), makeValidSkillMd({ name: 'auto' }));

    const content = makeValidAgentMd({ skills: ['auto'] });
    writeFileSync(join(pluginRoot, 'agents', 'agent-with-skill.md'), content);
    const result = validateAgent('agent-with-skill', pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('grader agent（只有 tools 欄位）驗證通過', () => {
    const content = makeValidAgentMd({ tools: ['Read', 'Bash'], name: 'grader', model: 'haiku' });
    writeFileSync(join(pluginRoot, 'agents', 'grader.md'), content);
    const result = validateAgent('grader', pluginRoot);
    expect(result.valid).toBe(true);
  });
});

// ── validateHook 測試 ──

describe('validateHook', () => {
  let pluginRoot;
  let scriptPath;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    // 建立一個假的腳本檔案
    mkdirSync(join(pluginRoot, 'hooks', 'scripts'), { recursive: true });
    scriptPath = join(pluginRoot, 'hooks', 'scripts', 'test.js');
    writeFileSync(scriptPath, '#!/usr/bin/env node\n');
  });

  it('驗證格式正確的 hook（有 matcher）回傳 valid:true', () => {
    writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: 'Task', hooks: [{ type: 'command', command: scriptPath }] }],
      },
    }));
    const result = validateHook('PreToolUse', pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('驗證格式正確的 hook（無 matcher）回傳 valid:true', () => {
    writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: scriptPath }] }],
      },
    }));
    const result = validateHook('SessionStart', pluginRoot);
    expect(result.valid).toBe(true);
  });

  it('hooks.json 中不存在 event 時 errors 含 event 名稱和 "不存在"', () => {
    const result = validateHook('SessionEnd', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('SessionEnd') && e.includes('不存在'))).toBe(true);
  });

  it('event 不在合法列表中時 errors 含 event 名稱和合法列表', () => {
    writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), JSON.stringify({
      hooks: [{ event: 'UnknownEvent', type: 'command', command: scriptPath }],
    }));
    const result = validateHook('UnknownEvent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('UnknownEvent'))).toBe(true);
  });

  it('command 腳本不存在時 errors 含 "command" 和 "不存在"', () => {
    writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), JSON.stringify({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: '/no/such/script.js' }] }],
      },
    }));
    const result = validateHook('Stop', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('command') && e.includes('不存在'))).toBe(true);
  });

  it('type 不是 command 時 errors 含 "type" 和 "command"', () => {
    writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: 'script', command: scriptPath }] }],
      },
    }));
    const result = validateHook('UserPromptSubmit', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('type') && e.includes('command'))).toBe(true);
  });

  it('command 使用 ${CLAUDE_PLUGIN_ROOT} 占位符時正確解析', () => {
    const relScript = 'hooks/scripts/test.js';
    writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: `\${CLAUDE_PLUGIN_ROOT}/${relScript}` }] }],
      },
    }));
    // 腳本必須在解析後路徑存在
    const result = validateHook('SessionStart', pluginRoot);
    expect(result.valid).toBe(true);
  });
});

// ── validateSkill 測試 ──

describe('validateSkill', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });

  it('驗證格式正確的 skill 回傳 valid:true', () => {
    mkdirSync(join(pluginRoot, 'skills', 'auto'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'auto', 'SKILL.md'), makeValidSkillMd({ name: 'auto' }));
    const result = validateSkill('auto', pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('SKILL.md 不存在時 errors 含 skill 名稱、"SKILL.md" 和 "不存在"', () => {
    const result = validateSkill('nonexistent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent') && e.includes('SKILL.md') && e.includes('不存在'))).toBe(true);
  });

  it('frontmatter 缺少 name 時 errors 含 "name" 和 "必填"', () => {
    mkdirSync(join(pluginRoot, 'skills', 'bad-skill'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'bad-skill', 'SKILL.md'), makeValidSkillMd({ skipName: true }));
    const result = validateSkill('bad-skill', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name') && e.includes('必填'))).toBe(true);
  });

  it('frontmatter 缺少 description 時 errors 含 "description"', () => {
    mkdirSync(join(pluginRoot, 'skills', 'bad-skill'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'bad-skill', 'SKILL.md'), makeValidSkillMd({ skipDescription: true }));
    const result = validateSkill('bad-skill', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('description'))).toBe(true);
  });

  it('含有合法可選欄位時通過驗證', () => {
    mkdirSync(join(pluginRoot, 'skills', 'no-model'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'no-model', 'SKILL.md'), makeValidSkillMd({
      name: 'no-model',
      'disable-model-invocation': true,
      'user-invocable': false,
    }));
    const result = validateSkill('no-model', pluginRoot);
    expect(result.valid).toBe(true);
  });

  it('disable-model-invocation 為字串 "yes" 時 errors 含欄位名稱和 "boolean"', () => {
    mkdirSync(join(pluginRoot, 'skills', 'bad-flag'), { recursive: true });
    // 手動寫入字串值（gray-matter 解析 YAML 中 yes → true，所以用 "yes" 字串需特殊處理）
    const rawContent = '---\nname: bad-flag\ndescription: 測試\ndisable-model-invocation: "yes"\n---\n\nBody';
    writeFileSync(join(pluginRoot, 'skills', 'bad-flag', 'SKILL.md'), rawContent);
    const result = validateSkill('bad-flag', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('disable-model-invocation') && e.includes('boolean'))).toBe(true);
  });
});

// ── validateAll 測試 ──

describe('validateAll', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });

  it('所有元件驗證通過時回傳 valid:true', () => {
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), makeValidAgentMd());
    const result = validateAll(pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.agents).toBeDefined();
    expect(result.hooks).toBeDefined();
    expect(result.skills).toBeDefined();
    expect(result.cross).toBeDefined();
  });

  it('部分 agent 驗證失敗時 validateAll 仍繼續驗證其他元件', () => {
    // 一個有問題的 agent（缺 model）
    const badContent = makeValidAgentMd({ skipModel: true });
    writeFileSync(join(pluginRoot, 'agents', 'bad.md'), badContent);

    // 一個正常的 skill
    mkdirSync(join(pluginRoot, 'skills', 'auto'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'auto', 'SKILL.md'), makeValidSkillMd({ name: 'auto' }));

    const result = validateAll(pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.agents['bad'].valid).toBe(false);
    expect(result.skills['auto'].valid).toBe(true);
  });

  it('grader agent 不在 stages 中不應產生交叉錯誤', () => {
    // registry-data.json 只有 DEV stage，沒有 grader
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), makeValidAgentMd());
    writeFileSync(join(pluginRoot, 'agents', 'grader.md'), makeValidAgentMd({
      name: 'grader',
      model: 'haiku',
      tools: ['Read', 'Bash'],
    }));
    const result = validateAll(pluginRoot);
    // cross 不應有關於 grader 的錯誤（因為 grader 不在 stages 中，只有 stages 中的 agent 需要交叉驗證）
    expect(result.cross.errors.filter((e) => e.includes('grader'))).toHaveLength(0);
  });

  it('stages 中定義的 agent 但 .md 不存在時產生交叉錯誤', () => {
    // registry-data.json 有 DEV stage agent=developer，但不建立 developer.md
    const result = validateAll(pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.cross.errors.some((e) => e.includes('developer') && e.includes('不存在'))).toBe(true);
  });
});

// ── createAgent 測試 ──

describe('createAgent', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });

  function baseOpts(overrides = {}) {
    return {
      name: overrides.name || 'new-agent',
      description: overrides.description || '新 agent',
      model: overrides.model || 'sonnet',
      color: overrides.color || 'blue',
      stage: overrides.stage || 'TEST-NEW',
      emoji: overrides.emoji || '🧪',
      label: overrides.label || '新階段',
      maxTurns: overrides.maxTurns !== undefined ? overrides.maxTurns : 30,
      body: overrides.body || '## DO\n\n## DON\'T\n\nHANDOFF',
      ...overrides,
    };
  }

  it('成功建立新 agent 並回傳 success:true 和正確路徑', () => {
    const result = createAgent(baseOpts(), pluginRoot);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.path).toContain('new-agent.md');
    expect(existsSync(result.path)).toBe(true);
  });

  it('建立 agent 後 agents/new-agent.md 包含正確 frontmatter', () => {
    createAgent(baseOpts(), pluginRoot);
    const content = readFileSync(join(pluginRoot, 'agents', 'new-agent.md'), 'utf8');
    expect(content).toContain('name: new-agent');
    expect(content).toContain('model: sonnet');
    expect(content).toContain('permissionMode: bypassPermissions');
  });

  it('建立 agent 後 registry-data.json 新增 stage 和 agentModel', () => {
    createAgent(baseOpts({ stage: 'TEST-NEW', model: 'sonnet' }), pluginRoot);
    const data = JSON.parse(readFileSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), 'utf8'));
    expect(data.stages['TEST-NEW']).toBeDefined();
    expect(data.stages['TEST-NEW'].agent).toBe('new-agent');
    expect(data.agentModels['new-agent']).toBe('sonnet');
  });

  it('建立 agent 後 plugin.json agents 陣列包含新路徑', () => {
    createAgent(baseOpts(), pluginRoot);
    const pluginJson = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
    expect(pluginJson.agents).toContain('./agents/new-agent.md');
  });

  it('name 已存在時回傳 success:false 且 errors 含 "已存在"', () => {
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), makeValidAgentMd());
    const result = createAgent(baseOpts({ name: 'developer' }), pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('developer') && e.includes('已存在'))).toBe(true);
  });

  it('model 值不合法時回傳 success:false 且不建立任何檔案', () => {
    const result = createAgent(baseOpts({ model: 'gpt-4' }), pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('gpt-4'))).toBe(true);
    expect(existsSync(join(pluginRoot, 'agents', 'new-agent.md'))).toBe(false);
  });

  it('disallowedTools 含未知工具只產生 warning 不阻擋建立', () => {
    const result = createAgent(baseOpts({
      name: 'warned-agent',
      disallowedTools: ['Read', 'UnknownTool'],
    }), pluginRoot);
    expect(result.success).toBe(true);
    expect(existsSync(join(pluginRoot, 'agents', 'warned-agent.md'))).toBe(true);
  });

  it('生成的 frontmatter 使用 YAML block sequence 格式（- item 縮排）', () => {
    createAgent(baseOpts({
      disallowedTools: ['Read', 'Write'],
      skills: ['auto'],
    }), pluginRoot);
    // 建立 skill 才能讓驗證通過
    // 實際上 skill 不存在會驗證失敗，所以要先建立
    mkdirSync(join(pluginRoot, 'skills', 'auto'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'auto', 'SKILL.md'), makeValidSkillMd({ name: 'auto' }));
    const result2 = createAgent(baseOpts({
      name: 'seq-agent',
      disallowedTools: ['Read', 'Write'],
      skills: ['auto'],
    }), pluginRoot);
    expect(result2.success).toBe(true);
    const content = readFileSync(join(pluginRoot, 'agents', 'seq-agent.md'), 'utf8');
    expect(content).toContain('disallowedTools:');
    expect(content).toContain('  - Read');
    expect(content).toContain('  - Write');
    expect(content).toContain('skills:');
    expect(content).toContain('  - auto');
  });
});

// ── updateAgent 測試 ──

describe('updateAgent', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), makeValidAgentMd());
  });

  it('成功更新 model 並同步 registry-data.json', () => {
    // 先讓 registry 有 developer
    const data = JSON.parse(readFileSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), 'utf8'));
    data.agentModels['developer'] = 'sonnet';
    writeFileSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), JSON.stringify(data, null, 2));

    const result = updateAgent('developer', { model: 'opus' }, pluginRoot);
    expect(result.success).toBe(true);
    expect(result.path).toContain('developer.md');

    const content = readFileSync(join(pluginRoot, 'agents', 'developer.md'), 'utf8');
    expect(content).toContain('model: opus');

    const updatedData = JSON.parse(readFileSync(join(pluginRoot, 'scripts', 'lib', 'registry-data.json'), 'utf8'));
    expect(updatedData.agentModels['developer']).toBe('opus');
  });

  it('成功更新 body 不影響 frontmatter', () => {
    const result = updateAgent('developer', { body: '# 新內容\n...' }, pluginRoot);
    expect(result.success).toBe(true);

    const content = readFileSync(join(pluginRoot, 'agents', 'developer.md'), 'utf8');
    expect(content).toContain('# 新內容');
    expect(content).toContain('model: sonnet'); // frontmatter 不變
  });

  it('更新不存在的 agent 回傳 success:false 且 errors 含 "不存在"', () => {
    const result = updateAgent('ghost', { model: 'haiku' }, pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost') && e.includes('不存在'))).toBe(true);
  });

  it('更新後驗證失敗則不寫入（model 不合法）', () => {
    const originalContent = readFileSync(join(pluginRoot, 'agents', 'developer.md'), 'utf8');
    const result = updateAgent('developer', { model: 'invalid-model' }, pluginRoot);
    expect(result.success).toBe(false);
    const afterContent = readFileSync(join(pluginRoot, 'agents', 'developer.md'), 'utf8');
    expect(afterContent).toBe(originalContent); // 內容不變
  });

  it('更新單一欄位不影響其他欄位', () => {
    const result = updateAgent('developer', { maxTurns: 30 }, pluginRoot);
    expect(result.success).toBe(true);

    const content = readFileSync(join(pluginRoot, 'agents', 'developer.md'), 'utf8');
    expect(content).toContain('maxTurns: 30');
    expect(content).toContain('name: developer');
    expect(content).toContain('model: sonnet');
    expect(content).toContain('color: yellow');
  });
});

// ── createHook 測試 ──

describe('createHook', () => {
  let pluginRoot;
  let scriptPath;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    mkdirSync(join(pluginRoot, 'hooks', 'scripts'), { recursive: true });
    scriptPath = join(pluginRoot, 'hooks', 'scripts', 'test.js');
    writeFileSync(scriptPath, '#!/usr/bin/env node\n');
  });

  it('成功建立新 hook（無 matcher）回傳 success:true', () => {
    const result = createHook({ event: 'SessionEnd', command: scriptPath }, pluginRoot);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    const data = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    expect(data.hooks.SessionEnd).toBeDefined();
    expect(data.hooks.SessionEnd[0].hooks[0].type).toBe('command');
  });

  it('成功建立新 hook（含 matcher）', () => {
    const result = createHook({ event: 'PostToolUse', command: scriptPath, matcher: 'Write' }, pluginRoot);
    expect(result.success).toBe(true);
    const data = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    expect(data.hooks.PostToolUse).toBeDefined();
    expect(data.hooks.PostToolUse[0].matcher).toBe('Write');
  });

  it('event 不合法時回傳 success:false 且 hooks.json 不被修改', () => {
    const originalContent = readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8');
    const result = createHook({ event: 'InvalidEvent', command: scriptPath }, pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('InvalidEvent'))).toBe(true);
    expect(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).toBe(originalContent);
  });

  it('command 腳本不存在時回傳 success:false', () => {
    const result = createHook({ event: 'SessionEnd', command: '/no/such/path.js' }, pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('command') && e.includes('不存在'))).toBe(true);
  });

  it('同一 event 已存在條目仍可追加 matcher group（追加行為）', () => {
    // 先加一個 PostToolUse
    writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), JSON.stringify({
      hooks: {
        PostToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: scriptPath }] }],
      },
    }));
    const result = createHook({ event: 'PostToolUse', command: scriptPath, matcher: 'Bash' }, pluginRoot);
    expect(result.success).toBe(true);
    const data = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    expect(data.hooks.PostToolUse).toHaveLength(2);
  });
});

// ── updateHook 測試 ──

describe('updateHook', () => {
  let pluginRoot;
  let scriptPath;
  let newScriptPath;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    mkdirSync(join(pluginRoot, 'hooks', 'scripts'), { recursive: true });
    scriptPath = join(pluginRoot, 'hooks', 'scripts', 'test.js');
    newScriptPath = join(pluginRoot, 'hooks', 'scripts', 'new.js');
    writeFileSync(scriptPath, '#!/usr/bin/env node\n');
    writeFileSync(newScriptPath, '#!/usr/bin/env node\n');

    writeFileSync(join(pluginRoot, 'hooks', 'hooks.json'), JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: scriptPath }] }],
        PreToolUse: [{ matcher: 'Task', hooks: [{ type: 'command', command: scriptPath }] }],
      },
    }));
  });

  it('成功更新 hook 的 command', () => {
    const result = updateHook('SessionStart', { command: newScriptPath }, pluginRoot);
    expect(result.success).toBe(true);
    const data = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    expect(data.hooks.SessionStart[0].hooks[0].command).toBe(newScriptPath);
  });

  it('成功移除 hook 的 matcher（傳入 null）', () => {
    const result = updateHook('PreToolUse', { matcher: null }, pluginRoot);
    expect(result.success).toBe(true);
    const data = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
    expect(data.hooks.PreToolUse[0].matcher).toBeUndefined();
  });

  it('更新不存在的 hook event 回傳 success:false 且 errors 含 "不存在"', () => {
    const result = updateHook('SessionEnd', { command: scriptPath }, pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('SessionEnd') && e.includes('不存在'))).toBe(true);
  });

  it('更新 command 指向不存在路徑時 hooks.json 不被修改', () => {
    const originalContent = readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8');
    const result = updateHook('SessionStart', { command: '/no/such/path.js' }, pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('command') && e.includes('不存在'))).toBe(true);
    expect(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).toBe(originalContent);
  });
});

// ── createSkill 測試 ──

describe('createSkill', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });

  it('成功建立新 skill 並回傳 success:true', () => {
    const result = createSkill({ name: 'new-skill', description: '新 skill', body: '# 說明' }, pluginRoot);
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.path).toContain('new-skill/SKILL.md');
    expect(existsSync(result.path)).toBe(true);
  });

  it('建立 skill 後 SKILL.md 包含正確 frontmatter 和 body', () => {
    createSkill({ name: 'new-skill', description: '新 skill', body: '# 說明' }, pluginRoot);
    const content = readFileSync(join(pluginRoot, 'skills', 'new-skill', 'SKILL.md'), 'utf8');
    expect(content).toContain('name: new-skill');
    expect(content).toContain('description: 新 skill');
    expect(content).toContain('# 說明');
  });

  it('名稱已存在時回傳 success:false 且 errors 含 "已存在"', () => {
    mkdirSync(join(pluginRoot, 'skills', 'auto'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'auto', 'SKILL.md'), makeValidSkillMd({ name: 'auto' }));
    const result = createSkill({ name: 'auto', description: '...', body: '' }, pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('auto') && e.includes('已存在'))).toBe(true);
  });

  it('缺少 name 時回傳 success:false 且 errors 含 "name" 和 "必填"', () => {
    const result = createSkill({ description: '...', body: '' }, pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('name') && e.includes('必填'))).toBe(true);
  });

  it('缺少 description 時回傳 success:false 且 errors 含 "description"', () => {
    const result = createSkill({ name: 'missing-desc', body: '' }, pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('description'))).toBe(true);
  });

  it('包含合法可選欄位時成功建立', () => {
    const result = createSkill({
      name: 'guarded-skill',
      description: '受保護的 skill',
      body: '# 說明',
      'disable-model-invocation': true,
      'user-invocable': false,
    }, pluginRoot);
    expect(result.success).toBe(true);
    const content = readFileSync(join(pluginRoot, 'skills', 'guarded-skill', 'SKILL.md'), 'utf8');
    expect(content).toContain('disable-model-invocation: true');
    expect(content).toContain('user-invocable: false');
  });
});

// ── updateSkill 測試 ──

describe('updateSkill', () => {
  let pluginRoot;

  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
    mkdirSync(join(pluginRoot, 'skills', 'auto'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'auto', 'SKILL.md'), makeValidSkillMd({ name: 'auto', description: '原始描述' }));
  });

  it('成功更新 skill 的 description', () => {
    const result = updateSkill('auto', { description: '新描述' }, pluginRoot);
    expect(result.success).toBe(true);
    const content = readFileSync(join(pluginRoot, 'skills', 'auto', 'SKILL.md'), 'utf8');
    expect(content).toContain('description: 新描述');
    expect(content).toContain('name: auto'); // 其他欄位不變
  });

  it('成功更新 skill 的 body 不影響 frontmatter', () => {
    const result = updateSkill('auto', { body: '# 新說明\n...' }, pluginRoot);
    expect(result.success).toBe(true);
    const content = readFileSync(join(pluginRoot, 'skills', 'auto', 'SKILL.md'), 'utf8');
    expect(content).toContain('# 新說明');
    expect(content).toContain('name: auto');
  });

  it('更新不存在的 skill 回傳 success:false 且 errors 含 "不存在"', () => {
    const result = updateSkill('ghost', { description: '...' }, pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost') && e.includes('不存在'))).toBe(true);
  });

  it('更新 disable-model-invocation 為非布林值時回傳 success:false', () => {
    const originalContent = readFileSync(join(pluginRoot, 'skills', 'auto', 'SKILL.md'), 'utf8');
    const result = updateSkill('auto', { 'disable-model-invocation': 'yes' }, pluginRoot);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('disable-model-invocation') && e.includes('boolean'))).toBe(true);
    expect(readFileSync(join(pluginRoot, 'skills', 'auto', 'SKILL.md'), 'utf8')).toBe(originalContent);
  });
});

// ── registry-data.json 相關測試 ──

describe('registry-data.json 抽離與同步', () => {
  it('registry.js 匯出的 stages 與 registry-data.json 一致', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    const dataPath = join(SCRIPTS_LIB, 'registry-data.json');
    const data = JSON.parse(require('fs').readFileSync(dataPath, 'utf8'));
    expect(Object.keys(registry.stages)).toEqual(Object.keys(data.stages));
  });

  it('registry.js 匯出的 agentModels 與 registry-data.json 一致', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    const dataPath = join(SCRIPTS_LIB, 'registry-data.json');
    const data = JSON.parse(require('fs').readFileSync(dataPath, 'utf8'));
    expect(registry.agentModels).toEqual(data.agentModels);
  });

  it('registry.js 匯出 knownTools 陣列含 Read、Write、Bash 等', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    expect(Array.isArray(registry.knownTools)).toBe(true);
    expect(registry.knownTools).toContain('Read');
    expect(registry.knownTools).toContain('Write');
    expect(registry.knownTools).toContain('Edit');
    expect(registry.knownTools).toContain('Bash');
    expect(registry.knownTools).toContain('Glob');
    expect(registry.knownTools).toContain('Grep');
    expect(registry.knownTools).toContain('Task');
  });

  it('registry.js 匯出 hookEvents 陣列含所有合法 event', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    expect(Array.isArray(registry.hookEvents)).toBe(true);
    expect(registry.hookEvents).toContain('SessionStart');
    expect(registry.hookEvents).toContain('SessionEnd');
    expect(registry.hookEvents).toContain('PreCompact');
    expect(registry.hookEvents).toContain('UserPromptSubmit');
    expect(registry.hookEvents).toContain('PreToolUse');
    expect(registry.hookEvents).toContain('PostToolUse');
    expect(registry.hookEvents).toContain('SubagentStop');
    expect(registry.hookEvents).toContain('Stop');
  });
});
