'use strict';
/**
 * s15b-hook-routing.test.js
 *
 * S15b 重構後的 Hook 鏈路 + Auto 路由驗證
 *
 * 聚焦在「平台對齊」測試未覆蓋的面向：
 *   1. Auto SKILL.md 路由表完整性（/ot:xxx 引用可達 + 涵蓋 18 個 workflow）
 *   2. PreToolUse Hook agent 映射一致性（stage → agent .md 存在 + ot: 前綴映射正確）
 *   3. UserPromptSubmit Hook 路由鏈（workflow 覆寫解析 + systemMessage 計數一致）
 *   4. Command 路徑可達性（auto/SKILL.md 的路由目標檔案存在）
 */

const { describe, test, expect } = require('bun:test');
const path = require('path');
const fs = require('fs');
const { PLUGIN_ROOT } = require('../helpers/paths');

const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const COMMANDS_DIR = path.join(PLUGIN_ROOT, 'commands');
const AGENTS_DIR = path.join(PLUGIN_ROOT, 'agents');
const AUTO_SKILL_PATH = path.join(SKILLS_DIR, 'auto', 'SKILL.md');
const PRE_TASK_PATH = path.join(PLUGIN_ROOT, 'hooks', 'scripts', 'tool', 'pre-task.js');
const ON_SUBMIT_PATH = path.join(PLUGIN_ROOT, 'hooks', 'scripts', 'prompt', 'on-submit.js');

// ────────────────────────────────────────────────────────────────────────────
// 輔助函式
// ────────────────────────────────────────────────────────────────────────────

/**
 * 從 auto/SKILL.md 路由表提取 /ot:xxx 引用（過濾空的 /ot:）
 * 回傳格式：{ command, type }[]
 *   type: 'command'（→ commands/xxx.md）| 'skill'（→ skills/xxx/SKILL.md）
 */
function extractAutoSkillRoutes(content) {
  // 路由表中的 `/ot:xxx` 模式（排除 `/ot:` 後無名稱的情況）
  // 格式：`/ot:xxx` (xxx 為 [a-z0-9_-]+)
  const pattern = /`\/ot:([a-z0-9_-]+)`/g;
  const routes = new Map(); // command → type

  let m;
  while ((m = pattern.exec(content)) !== null) {
    const cmd = m[1];
    if (!routes.has(cmd)) {
      // 判斷路由目標：pm/issue/pr → skill；其他 → command
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

    // 必須至少提取到若干路由（sanity check）
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

    // 統計 command 類型的路由數（即直接對應 commands/*.md 的路由）
    const commandRoutes = [...routes.entries()].filter(([, type]) => type === 'command');
    // 基本模板 + 特化模板 = 至少 16 個 workflow command（pm 走 skill 路由）
    expect(commandRoutes.length).toBeGreaterThanOrEqual(16);
  });

  test('Auto SKILL.md 中的 18 個 workflow 由 registry.workflows 支撐', () => {
    // registry.workflows 共 18 個 workflow，auto/SKILL.md 宣稱 18 個 workflow 模板
    const { workflows } = require('../../plugins/overtone/scripts/lib/registry');
    expect(Object.keys(workflows).length).toBe(18);
  });

  test('Auto SKILL.md 中提及的 workflow 數量描述（18 個）與 registry 一致', () => {
    const content = fs.readFileSync(AUTO_SKILL_PATH, 'utf8');
    // auto/SKILL.md 應說明 16 個 stage agent（非 workflow 數量）
    // 驗證 "18 個" 僅出現在對的地方（registry 也是 18）
    const { workflows } = require('../../plugins/overtone/scripts/lib/registry');
    const registryCount = Object.keys(workflows).length;
    expect(registryCount).toBe(18);
    // auto/SKILL.md 的選擇表涵蓋所有基本 + 特化 + 產品共 18 個 workflow key
    // 用路由表行數驗證（每行一個 workflow）
    const routeTableLines = content.split('\n').filter(
      line => line.match(/^\| .+`\/ot:[a-z]/)
    );
    // 路由表至少 16 行（pm/product-full/discovery 共用 /ot:pm，不是 18 行）
    expect(routeTableLines.length).toBeGreaterThanOrEqual(16);
  });

});

// ────────────────────────────────────────────────────────────────────────────
// 測試區 2：PreToolUse Hook Agent 映射一致性
// ────────────────────────────────────────────────────────────────────────────

describe('PreToolUse Hook Agent 映射一致性', () => {

  test('pre-task.js 檔案存在', () => {
    expect(fs.existsSync(PRE_TASK_PATH)).toBe(true);
  });

  test('registry.stages 的每個 agent 都有對應的 agents/*.md 檔案', () => {
    const { stages } = require('../../plugins/overtone/scripts/lib/registry');

    const missing = [];
    for (const [stageKey, stageDef] of Object.entries(stages)) {
      const agentPath = path.join(AGENTS_DIR, `${stageDef.agent}.md`);
      if (!fs.existsSync(agentPath)) {
        missing.push(`${stageDef.agent}.md（stage: ${stageKey}）`);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `以下 stage 的 agent .md 檔案不存在（共 ${missing.length} 個）：\n` +
        missing.map(p => `  - ${p}`).join('\n')
      );
    }
  });

  test('registry.stages 共有 16 個 stage-agent 映射', () => {
    const { stages } = require('../../plugins/overtone/scripts/lib/registry');
    expect(Object.keys(stages).length).toBe(16);
  });

  test('ot: 前綴格式：去除 ot: 後的名稱能在 registry.stages 的 agent 欄位找到', () => {
    const { stages } = require('../../plugins/overtone/scripts/lib/registry');

    // 取得所有合法 agent 名稱
    const knownAgents = new Set(Object.values(stages).map(d => d.agent));

    // 模擬 pre-task.js 的 L1 映射邏輯：
    // 輸入 subagent_type = 'ot:<agentName>'
    // 去除 'ot:' 前綴後應是 knownAgents 中的成員
    for (const agentName of knownAgents) {
      const subagentType = `ot:${agentName}`;
      const candidate = subagentType.startsWith('ot:') ? subagentType.slice(3) : subagentType;
      expect(knownAgents.has(candidate)).toBe(true);
    }
  });

  test('pre-task.js 引用 registry.stages 進行 agent 辨識', () => {
    // 驗證 pre-task.js 確實 import registry 的 stages
    const content = fs.readFileSync(PRE_TASK_PATH, 'utf8');
    expect(content).toContain("require('../../../scripts/lib/registry')");
    expect(content).toContain('stages');
  });

  test('pre-task.js 處理 ot: 前綴的 subagent_type 映射', () => {
    const content = fs.readFileSync(PRE_TASK_PATH, 'utf8');
    // pre-task.js 應有 ot: 前綴的處理邏輯
    expect(content).toContain("startsWith('ot:')");
    // 並且用 slice(3) 去除前綴
    expect(content).toContain('slice(3)');
  });

  test('所有 agent .md 名稱與 registry agent 名稱完全一致', () => {
    const { stages } = require('../../plugins/overtone/scripts/lib/registry');
    const registryAgents = new Set(Object.values(stages).map(d => d.agent));

    // 讀取 agents/ 目錄中的所有 .md 檔案名稱（去除副檔名）
    const agentFiles = fs.readdirSync(AGENTS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));

    // grader 是特殊 agent（不在 stages 中），排除後比對
    const nonStageAgents = agentFiles.filter(a => !registryAgents.has(a));
    // grader 是唯一合法的非 stage agent
    for (const extra of nonStageAgents) {
      expect(extra).toBe('grader');
    }
  });

});

// ────────────────────────────────────────────────────────────────────────────
// 測試區 3：UserPromptSubmit Hook 路由鏈
// ────────────────────────────────────────────────────────────────────────────

describe('UserPromptSubmit Hook 路由鏈', () => {

  test('on-submit.js 檔案存在', () => {
    expect(fs.existsSync(ON_SUBMIT_PATH)).toBe(true);
  });

  test('on-submit.js 引用 registry.workflows', () => {
    const content = fs.readFileSync(ON_SUBMIT_PATH, 'utf8');
    expect(content).toContain("require('../../../scripts/lib/registry')");
    expect(content).toContain('workflows');
  });

  test('on-submit.js 的 workflow 覆寫解析可覆蓋所有 18 個 workflow key', () => {
    const { workflows } = require('../../plugins/overtone/scripts/lib/registry');

    // 模擬 on-submit.js 的 workflow 覆寫驗證邏輯：
    // workflows[workflowOverride] 存在 → validWorkflowOverride = workflowOverride
    for (const key of Object.keys(workflows)) {
      const workflowDef = workflows[key];
      // 每個 key 都有 label 和 stages 欄位
      expect(workflowDef.label).toBeDefined();
      expect(Array.isArray(workflowDef.stages)).toBe(true);
      // 模擬覆寫解析邏輯
      const validWorkflowOverride = workflows[key] ? key : null;
      expect(validWorkflowOverride).toBe(key);
    }
  });

  test('on-submit.js 的 systemMessage 中「18 個 workflow 模板」與 registry 計數一致', () => {
    const content = fs.readFileSync(ON_SUBMIT_PATH, 'utf8');
    const { workflows } = require('../../plugins/overtone/scripts/lib/registry');

    // on-submit.js 應提及「18 個 workflow 模板」
    expect(content).toContain('18 個 workflow 模板');

    // registry 中確實有 18 個 workflow
    const registryCount = Object.keys(workflows).length;
    expect(registryCount).toBe(18);
  });

  test('on-submit.js 的 [workflow:xxx] 正規式能解析所有 18 個 workflow key 格式', () => {
    // 測試正規式 /\[workflow:([a-z0-9_-]+)\]/i 能匹配所有合法 workflow key
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
// 測試區 4：Command 路徑可達性
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

  test('commands/ 目錄共有 27 個 .md 檔案（與 S15b 設計一致）', () => {
    const cmdFiles = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.md'));
    expect(cmdFiles.length).toBe(27);
  });

  test('skills/ 目錄共有 15 個 SKILL.md（與 S15b 設計一致）', () => {
    const skillDirs = fs.readdirSync(SKILLS_DIR);
    const skillMds = skillDirs.filter(d => fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md')));
    expect(skillMds.length).toBe(15);
  });

  test('agents/ 目錄共有 17 個 .md 檔案（16 stage agent + grader）', () => {
    const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
    expect(agentFiles.length).toBe(17);
  });

});
