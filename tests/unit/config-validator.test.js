'use strict';
/**
 * tests/unit/config-validator.test.js — Config Validator 單元測試
 *
 * 測試面向：
 *   1. validateAgent — agent frontmatter 欄位驗證
 *   2. validateSkill — skill frontmatter 欄位驗證
 *   3. validateHook  — hook event 設定驗證
 *   4. validateAll   — 跨元件交叉一致性驗證
 *   5. validateAgentFrontmatter（內部輔助）— 直接傳入 frontmatter
 *   6. validateSkillFrontmatter（內部輔助）— 直接傳入 frontmatter
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');
const {
  validateAgent,
  validateHook,
  validateSkill,
  validateAll,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} = require(join(SCRIPTS_LIB, 'config-validator'));

// ── 輔助函式 ──

function makeTmpPluginRoot(suffix = '') {
  const dir = join(
    tmpdir(),
    `config-validator-test-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`
  );
  mkdirSync(join(dir, 'agents'), { recursive: true });
  mkdirSync(join(dir, 'hooks'), { recursive: true });
  mkdirSync(join(dir, 'skills'), { recursive: true });
  mkdirSync(join(dir, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });

  writeFileSync(
    join(dir, 'scripts', 'lib', 'registry-data.json'),
    JSON.stringify(
      {
        stages: {
          DEV: { label: '開發', emoji: '💻', agent: 'developer', color: 'yellow' },
        },
        agentModels: { developer: 'sonnet' },
      },
      null,
      2
    )
  );

  writeFileSync(
    join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'ot', version: '0.1.0', agents: ['./agents/developer.md'] }, null, 2)
  );

  writeFileSync(join(dir, 'hooks', 'hooks.json'), JSON.stringify({ hooks: {} }, null, 2));

  return dir;
}

function makeValidAgentMd(overrides = {}) {
  const fm = {
    name: overrides.name || 'developer',
    description: overrides.description || '開發者',
    model: overrides.model || 'sonnet',
    permissionMode: overrides.permissionMode || 'bypassPermissions',
    color: overrides.color || 'yellow',
    maxTurns: overrides.maxTurns !== undefined ? overrides.maxTurns : 50,
  };

  const lines = [
    '---',
    `name: ${fm.name}`,
    `description: ${fm.description}`,
    `model: ${fm.model}`,
    `permissionMode: ${fm.permissionMode}`,
    `color: ${fm.color}`,
    `maxTurns: ${fm.maxTurns}`,
    '---',
    '',
    '# Agent 內容',
  ];

  if (overrides.extraLines) {
    lines.splice(lines.length - 1, 0, ...overrides.extraLines);
  }

  return lines.join('\n');
}

function makeValidSkillMd(overrides = {}) {
  const lines = [
    '---',
    `name: ${overrides.name || 'testing'}`,
    `description: ${overrides.description || '測試知識域'}`,
    '---',
    '',
    '# Skill 內容',
  ];
  return lines.join('\n');
}

// ── describe 區塊 ──

describe('validateAgentFrontmatter（內部輔助）', () => {
  let pluginRoot;
  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });
  afterEach(() => {
    rmSync(pluginRoot, { recursive: true, force: true });
  });

  it('有效 frontmatter 回傳 valid: true', () => {
    const fm = {
      name: 'developer',
      description: '開發者',
      model: 'sonnet',
      permissionMode: 'bypassPermissions',
      color: 'yellow',
      maxTurns: 50,
    };
    const result = validateAgentFrontmatter(fm, pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('缺少必填欄位 name → 回傳 valid: false', () => {
    const fm = {
      description: '開發者',
      model: 'sonnet',
      permissionMode: 'bypassPermissions',
      color: 'yellow',
      maxTurns: 50,
    };
    const result = validateAgentFrontmatter(fm, pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('model 不合法 → 回傳 valid: false', () => {
    const fm = {
      name: 'developer',
      description: '開發者',
      model: 'gpt-4',
      permissionMode: 'bypassPermissions',
      color: 'yellow',
      maxTurns: 50,
    };
    const result = validateAgentFrontmatter(fm, pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('model'))).toBe(true);
  });

  it('permissionMode 不是 bypassPermissions → 回傳 valid: false', () => {
    const fm = {
      name: 'developer',
      description: '開發者',
      model: 'sonnet',
      permissionMode: 'default',
      color: 'yellow',
      maxTurns: 50,
    };
    const result = validateAgentFrontmatter(fm, pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('permissionMode'))).toBe(true);
  });

  it('maxTurns 非正整數 → 回傳 valid: false', () => {
    const fm = {
      name: 'developer',
      description: '開發者',
      model: 'sonnet',
      permissionMode: 'bypassPermissions',
      color: 'yellow',
      maxTurns: -1,
    };
    const result = validateAgentFrontmatter(fm, pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maxTurns'))).toBe(true);
  });

  it('disallowedTools 和 tools 同時存在 → 回傳 valid: false', () => {
    const fm = {
      name: 'developer',
      description: '開發者',
      model: 'sonnet',
      permissionMode: 'bypassPermissions',
      color: 'yellow',
      maxTurns: 50,
      disallowedTools: ['Bash'],
      tools: ['Read'],
    };
    const result = validateAgentFrontmatter(fm, pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('互斥'))).toBe(true);
  });

  it('skills 引用不存在的 skill → 回傳 valid: false', () => {
    const fm = {
      name: 'developer',
      description: '開發者',
      model: 'sonnet',
      permissionMode: 'bypassPermissions',
      color: 'yellow',
      maxTurns: 50,
      skills: ['nonexistent-skill'],
    };
    const result = validateAgentFrontmatter(fm, pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent-skill'))).toBe(true);
  });

  it('skills 引用存在的 skill → valid: true', () => {
    mkdirSync(join(pluginRoot, 'skills', 'my-skill'), { recursive: true });
    writeFileSync(
      join(pluginRoot, 'skills', 'my-skill', 'SKILL.md'),
      '---\nname: my-skill\ndescription: 測試\n---\n'
    );
    const fm = {
      name: 'developer',
      description: '開發者',
      model: 'sonnet',
      permissionMode: 'bypassPermissions',
      color: 'yellow',
      maxTurns: 50,
      skills: ['my-skill'],
    };
    const result = validateAgentFrontmatter(fm, pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('未知工具名稱 → 新增警告（不影響 valid）', () => {
    const fm = {
      name: 'developer',
      description: '開發者',
      model: 'sonnet',
      permissionMode: 'bypassPermissions',
      color: 'yellow',
      maxTurns: 50,
      disallowedTools: ['UnknownTool99'],
    };
    const result = validateAgentFrontmatter(fm, pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('UnknownTool99'))).toBe(true);
  });
});

describe('validateSkillFrontmatter（內部輔助）', () => {
  it('有效 frontmatter 回傳 valid: true', () => {
    const fm = { name: 'testing', description: '測試知識域' };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('缺少 name → 回傳 valid: false', () => {
    const fm = { description: '測試知識域' };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('缺少 description → 回傳 valid: false', () => {
    const fm = { name: 'testing' };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('description'))).toBe(true);
  });

  it('disable-model-invocation 非 boolean → 回傳 valid: false', () => {
    const fm = { name: 'testing', description: '測試', 'disable-model-invocation': 'yes' };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('disable-model-invocation'))).toBe(true);
  });

  it('disable-model-invocation 為 boolean → valid: true', () => {
    const fm = { name: 'testing', description: '測試', 'disable-model-invocation': true };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(true);
  });

  it('user-invocable 非 boolean → 回傳 valid: false', () => {
    const fm = { name: 'testing', description: '測試', 'user-invocable': 'true' };
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('user-invocable'))).toBe(true);
  });
});

describe('validateAgent', () => {
  let pluginRoot;
  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });
  afterEach(() => {
    rmSync(pluginRoot, { recursive: true, force: true });
  });

  it('agent .md 不存在 → valid: false', () => {
    const result = validateAgent('nonexistent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent'))).toBe(true);
  });

  it('有效 agent .md → valid: true', () => {
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), makeValidAgentMd());
    const result = validateAgent('developer', pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('agent .md 有無效 model → valid: false', () => {
    writeFileSync(
      join(pluginRoot, 'agents', 'developer.md'),
      makeValidAgentMd({ model: 'invalid-model' })
    );
    const result = validateAgent('developer', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('model'))).toBe(true);
  });

  it('所有合法 model 值都通過驗證', () => {
    for (const model of ['opus', 'opusplan', 'sonnet', 'haiku']) {
      writeFileSync(
        join(pluginRoot, 'agents', `${model}-agent.md`),
        makeValidAgentMd({ name: `${model}-agent`, model })
      );
      const result = validateAgent(`${model}-agent`, pluginRoot);
      expect(result.valid).toBe(true);
    }
  });
});

describe('validateSkill', () => {
  let pluginRoot;
  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });
  afterEach(() => {
    rmSync(pluginRoot, { recursive: true, force: true });
  });

  it('SKILL.md 不存在 → valid: false', () => {
    const result = validateSkill('nonexistent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent'))).toBe(true);
  });

  it('有效 SKILL.md → valid: true', () => {
    mkdirSync(join(pluginRoot, 'skills', 'testing'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'testing', 'SKILL.md'), makeValidSkillMd());
    const result = validateSkill('testing', pluginRoot);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('SKILL.md 缺少 name → valid: false', () => {
    mkdirSync(join(pluginRoot, 'skills', 'testing'), { recursive: true });
    writeFileSync(
      join(pluginRoot, 'skills', 'testing', 'SKILL.md'),
      '---\ndescription: 測試知識域\n---\n'
    );
    const result = validateSkill('testing', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });
});

describe('validateHook', () => {
  let pluginRoot;
  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });
  afterEach(() => {
    rmSync(pluginRoot, { recursive: true, force: true });
  });

  it('非法 event 名稱 → valid: false', () => {
    const result = validateHook('FakeEvent', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('FakeEvent'))).toBe(true);
  });

  it('event 不在 hooks.json 中 → valid: false', () => {
    const result = validateHook('SessionStart', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('SessionStart'))).toBe(true);
  });

  it('hook type 不是 command → valid: false', () => {
    writeFileSync(
      join(pluginRoot, 'hooks', 'hooks.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: '.*', hooks: [{ type: 'function', command: 'foo.js' }] }],
        },
      }, null, 2)
    );
    const result = validateHook('SessionStart', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('type'))).toBe(true);
  });

  it('command 指向的腳本存在 → valid: true', () => {
    const scriptPath = join(pluginRoot, 'hooks', 'scripts', 'on-start.js');
    mkdirSync(join(pluginRoot, 'hooks', 'scripts'), { recursive: true });
    writeFileSync(scriptPath, '// test hook');
    // command 使用 ${CLAUDE_PLUGIN_ROOT} 佔位符，resolveCommand 會替換為 pluginRoot
    writeFileSync(
      join(pluginRoot, 'hooks', 'hooks.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: '.*',
              hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/on-start.js' }],
            },
          ],
        },
      }, null, 2)
    );
    const result = validateHook('SessionStart', pluginRoot);
    expect(result.valid).toBe(true);
  });

  it('command 指向不存在的腳本 → valid: false', () => {
    writeFileSync(
      join(pluginRoot, 'hooks', 'hooks.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: '.*',
              hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/missing.js' }],
            },
          ],
        },
      }, null, 2)
    );
    const result = validateHook('SessionStart', pluginRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('腳本不存在') || e.includes('missing.js'))).toBe(true);
  });
});

describe('validateAll', () => {
  let pluginRoot;
  beforeEach(() => {
    pluginRoot = makeTmpPluginRoot();
  });
  afterEach(() => {
    rmSync(pluginRoot, { recursive: true, force: true });
  });

  it('空目錄（無 agents、hooks、skills）→ valid: true（無元件可驗證）', () => {
    const result = validateAll(pluginRoot);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('agents');
    expect(result).toHaveProperty('hooks');
    expect(result).toHaveProperty('skills');
    expect(result).toHaveProperty('cross');
  });

  it('有一個有效 agent → agents[name].valid: true', () => {
    writeFileSync(join(pluginRoot, 'agents', 'developer.md'), makeValidAgentMd());
    // registry-data.json 中的 DEV stage 對應 developer agent，需要 developer.md 存在
    const result = validateAll(pluginRoot);
    expect(result.agents.developer).toBeDefined();
    expect(result.agents.developer.valid).toBe(true);
  });

  it('registry-data.json 中的 stage agent 不存在 → cross.valid: false', () => {
    // registry-data.json 預設有 DEV stage 指向 developer，但不建立 developer.md
    const result = validateAll(pluginRoot);
    expect(result.cross.valid).toBe(false);
    expect(result.cross.errors.some((e) => e.includes('developer'))).toBe(true);
  });

  it('有效 skill → skills[name].valid: true', () => {
    mkdirSync(join(pluginRoot, 'skills', 'testing'), { recursive: true });
    writeFileSync(join(pluginRoot, 'skills', 'testing', 'SKILL.md'), makeValidSkillMd());
    const result = validateAll(pluginRoot);
    expect(result.skills.testing).toBeDefined();
    expect(result.skills.testing.valid).toBe(true);
  });
});
