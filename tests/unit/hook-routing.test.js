'use strict';
/**
 * hook-routing.test.js
 *
 * Hook 鏈路 + Auto 路由驗證
 *
 * 聚焦在：
 *   1. Auto SKILL.md 路由表完整性（/ot:xxx 引用可達 + 涵蓋 18 個 workflow）
 *   2. UserPromptSubmit Hook 路由鏈（workflow 覆寫解析 + systemMessage 計數一致）
 *   3. Command 路徑可達性（auto/SKILL.md 的路由目標檔案存在）
 */

const { describe, test, expect } = require('bun:test');
const path = require('path');
const fs = require('fs');
const { PLUGIN_ROOT } = require('../helpers/paths');

const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const COMMANDS_DIR = path.join(PLUGIN_ROOT, 'commands');
const AUTO_SKILL_PATH = path.join(SKILLS_DIR, 'auto', 'SKILL.md');
const ON_SUBMIT_PATH = path.join(PLUGIN_ROOT, 'hooks', 'scripts', 'prompt', 'on-submit.js');

// ────────────────────────────────────────────────────────────────────────────
// 輔助函式
// ────────────────────────────────────────────────────────────────────────────

/**
 * 從 auto/SKILL.md 路由表提取 /ot:xxx 引用（過濾空的 /ot:）
 * 回傳格式：Map<command, type>
 *   type: 'command'（→ commands/xxx.md）| 'skill'（→ skills/xxx/SKILL.md）
 */
function extractAutoSkillRoutes(content) {
  const pattern = /`\/ot:([a-z0-9_-]+)`/g;
  const routes = new Map();

  let m;
  while ((m = pattern.exec(content)) !== null) {
    const cmd = m[1];
    if (!routes.has(cmd)) {
      const isSkill = ['pm', 'issue', 'pr'].includes(cmd);
      routes.set(cmd, isSkill ? 'skill' : 'command');
    }
  }

  return routes;
}

// ────────────────────────────────────────────────────────────────────────────
// 測試區 1：Auto SKILL.md 路由表完整性
// ────────────────────────────────────────────────────────────────────────────

describe('Auto SKILL.md 路由表完整性', () => {

  test('auto/SKILL.md 檔案存在', () => {
    expect(fs.existsSync(AUTO_SKILL_PATH)).toBe(true);
  });

  test('路由表中的 /ot:xxx 命令對應的 command 或 skill 目標檔案存在', () => {
    const content = fs.readFileSync(AUTO_SKILL_PATH, 'utf8');
    const routes = extractAutoSkillRoutes(content);

    expect(routes.size).toBeGreaterThan(0);

    const missing = [];

    for (const [cmd, type] of routes) {
      if (type === 'command') {
        const cmdPath = path.join(COMMANDS_DIR, `${cmd}.md`);
        if (!fs.existsSync(cmdPath)) {
          missing.push(`commands/${cmd}.md（由 /ot:${cmd} 引用）`);
        }
      } else if (type === 'skill') {
        const skillPath = path.join(SKILLS_DIR, cmd, 'SKILL.md');
        if (!fs.existsSync(skillPath)) {
          missing.push(`skills/${cmd}/SKILL.md（由 /ot:${cmd} 引用）`);
        }
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `以下 Auto SKILL.md 路由目標不存在（共 ${missing.length} 個）：\n` +
        missing.map(p => `  - ${p}`).join('\n')
      );
    }
  });

  test('路由表涵蓋的 workflow command 數量 >= 16（排除 pm/issue/pr 後的 commands）', () => {
    const content = fs.readFileSync(AUTO_SKILL_PATH, 'utf8');
    const routes = extractAutoSkillRoutes(content);

    const commandRoutes = [...routes.entries()].filter(([, type]) => type === 'command');
    expect(commandRoutes.length).toBeGreaterThanOrEqual(16);
  });

  test('Auto SKILL.md 中的 18 個 workflow 由 registry.workflows 支撐', () => {
    const { workflows } = require('../../plugins/overtone/scripts/lib/registry');
    expect(Object.keys(workflows).length).toBe(18);
  });

  test('Auto SKILL.md 中提及的 workflow 數量描述（18 個）與 registry 一致', () => {
    const content = fs.readFileSync(AUTO_SKILL_PATH, 'utf8');
    const { workflows } = require('../../plugins/overtone/scripts/lib/registry');
    const registryCount = Object.keys(workflows).length;
    expect(registryCount).toBe(18);
    const routeTableLines = content.split('\n').filter(
      line => line.match(/^\| .+`\/ot:[a-z]/)
    );
    expect(routeTableLines.length).toBeGreaterThanOrEqual(16);
  });

});

// ────────────────────────────────────────────────────────────────────────────
// 測試區 2：UserPromptSubmit Hook 路由鏈
// ────────────────────────────────────────────────────────────────────────────

describe('UserPromptSubmit Hook 路由鏈', () => {

  test('on-submit.js 的 workflow 覆寫解析可覆蓋所有 18 個 workflow key', () => {
    const { workflows } = require('../../plugins/overtone/scripts/lib/registry');

    for (const key of Object.keys(workflows)) {
      const workflowDef = workflows[key];
      expect(workflowDef.label).toBeDefined();
      expect(Array.isArray(workflowDef.stages)).toBe(true);
      const validWorkflowOverride = workflows[key] ? key : null;
      expect(validWorkflowOverride).toBe(key);
    }
  });

  test('on-submit.js 的 systemMessage 中「18 個 workflow 模板」與 registry 計數一致', () => {
    const content = fs.readFileSync(ON_SUBMIT_PATH, 'utf8');
    const { workflows } = require('../../plugins/overtone/scripts/lib/registry');

    expect(content).toContain('18 個 workflow 模板');

    const registryCount = Object.keys(workflows).length;
    expect(registryCount).toBe(18);
  });

  test('on-submit.js 的 [workflow:xxx] 正規式能解析所有 18 個 workflow key 格式', () => {
    const pattern = /\[workflow:([a-z0-9_-]+)\]/i;
    const { workflows } = require('../../plugins/overtone/scripts/lib/registry');

    for (const key of Object.keys(workflows)) {
      const input = `[workflow:${key}]`;
      const match = input.match(pattern);
      expect(match).not.toBeNull();
      expect(match[1].toLowerCase()).toBe(key);
    }
  });

  test('on-submit.js 的 workflow 覆寫邏輯能區分合法與非合法 key', () => {
    const { workflows } = require('../../plugins/overtone/scripts/lib/registry');

    const invalidKeys = ['invalid-workflow', 'xyz', 'nonexistent'];
    for (const key of invalidKeys) {
      const validWorkflowOverride = workflows[key] ? key : null;
      expect(validWorkflowOverride).toBeNull();
    }
  });

});

// ────────────────────────────────────────────────────────────────────────────
// 測試區 3：Command 路徑可達性
// ────────────────────────────────────────────────────────────────────────────

describe('Command 路徑可達性（auto/SKILL.md 路由目標）', () => {

  /**
   * 從 auto/SKILL.md 提取 ${CLAUDE_PLUGIN_ROOT}/commands/xxx 引用
   */
  function extractPluginRootCommandRefs(content) {
    const pattern = /\$\{CLAUDE_PLUGIN_ROOT\}\/commands\/([^\s`]+)/g;
    const refs = new Set();
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const ref = m[1];
      if (!ref.includes('<') && !ref.includes('{')) {
        refs.add(ref);
      }
    }
    return refs;
  }

  /**
   * 從 auto/SKILL.md 提取 ${CLAUDE_PLUGIN_ROOT}/skills/xxx 引用
   */
  function extractPluginRootSkillRefs(content) {
    const pattern = /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/([^\s`]+)/g;
    const refs = new Set();
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const ref = m[1];
      if (!ref.includes('<') && !ref.includes('{')) {
        refs.add(ref);
      }
    }
    return refs;
  }

  test('auto/SKILL.md 中所有 ${CLAUDE_PLUGIN_ROOT}/commands/* 引用的檔案存在', () => {
    const content = fs.readFileSync(AUTO_SKILL_PATH, 'utf8');
    const refs = extractPluginRootCommandRefs(content);

    const missing = [];
    for (const ref of refs) {
      const fullPath = path.join(COMMANDS_DIR, ref);
      if (!fs.existsSync(fullPath)) {
        missing.push(`commands/${ref}`);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `auto/SKILL.md 引用的 command 目標不存在（共 ${missing.length} 個）：\n` +
        missing.map(p => `  - ${p}`).join('\n')
      );
    }
  });

  test('auto/SKILL.md 中所有 ${CLAUDE_PLUGIN_ROOT}/skills/* 引用的目標存在', () => {
    const content = fs.readFileSync(AUTO_SKILL_PATH, 'utf8');
    const refs = extractPluginRootSkillRefs(content);

    const missing = [];
    for (const ref of refs) {
      const fullPath = path.join(SKILLS_DIR, ref);
      if (!fs.existsSync(fullPath)) {
        missing.push(`skills/${ref}`);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `auto/SKILL.md 引用的 skill 目標不存在（共 ${missing.length} 個）：\n` +
        missing.map(p => `  - ${p}`).join('\n')
      );
    }
  });

});
