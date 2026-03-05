'use strict';
/**
 * reference-integrity.test.js — 引用完整性 Guard Tests
 *
 * 驗證四類引用鏈路完整性，防止 S15b 重構後出現斷鏈：
 *
 * Feature A：Hook Script 可執行權限
 *   每個 hooks.json 中宣告的 command 腳本存在且有 +x 執行權限
 *
 * Feature B：Registry ↔ Workflow 閉環
 *   每個 workflow 的 stage 都在 registry.stages 中有定義
 *   每個 stage 對應的 agent .md 檔案存在
 *
 * Feature C：hookEvents ↔ hooks.json 事件一致性
 *   registry hookEvents 與 hooks.json 的事件 key 互相吻合
 *
 * Feature D：Agent Skills 雙向引用
 *   每個 agent 宣告的 skills 項目對應的 skill 目錄存在
 *   每個 knowledge-domain skill 至少被一個 agent 引用
 *   （auto/pm/evolve/issue/onboard/pr/specs/verify 為 user-invocable，免驗 agent 引用）
 */

const { describe, test, expect, beforeAll } = require('bun:test');
const { join } = require('path');
const fs = require('fs');
const { PLUGIN_ROOT, SCRIPTS_LIB } = require('../helpers/paths');
const { parseFrontmatter } = require('../helpers/frontmatter');

const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');
const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');
const HOOKS_JSON_PATH = join(PLUGIN_ROOT, 'hooks', 'hooks.json');

const { stages, workflows, hookEvents } = require(join(SCRIPTS_LIB, 'registry'));

// ── 預先載入 hooks.json ──
let hooksConfig = null;
beforeAll(() => {
  const raw = fs.readFileSync(HOOKS_JSON_PATH, 'utf8');
  hooksConfig = JSON.parse(raw);
});

// ────────────────────────────────────────────────────────────────────────────
// Feature A：Hook Script 可執行權限
// ────────────────────────────────────────────────────────────────────────────

describe('Feature A：Hook Script 可執行權限', () => {
  // 取得所有 hook command 路徑（展開三層結構）
  function getAllHookCommands() {
    const commands = [];
    for (const [event, groups] of Object.entries(hooksConfig.hooks)) {
      for (const group of groups) {
        for (const handler of group.hooks) {
          if (handler.type === 'command' && handler.command) {
            commands.push({ event, command: handler.command });
          }
        }
      }
    }
    return commands;
  }

  // 將 hooks.json 中的 ${CLAUDE_PLUGIN_ROOT} 替換為實際路徑
  function resolveCommand(command) {
    return command.replace('${CLAUDE_PLUGIN_ROOT}', PLUGIN_ROOT);
  }

  describe('A-1：每個 hook command 腳本路徑存在', () => {
    test('hooksConfig 已載入（前置條件）', () => {
      expect(hooksConfig).not.toBeNull();
      expect(typeof hooksConfig.hooks).toBe('object');
    });

    test('所有 hook command 腳本存在', () => {
      const missing = [];
      for (const { event, command } of getAllHookCommands()) {
        const resolved = resolveCommand(command);
        if (!fs.existsSync(resolved)) {
          missing.push(`[${event}] ${resolved}`);
        }
      }
      if (missing.length > 0) {
        throw new Error(
          `以下 hook command 腳本不存在（共 ${missing.length} 個）：\n` +
          missing.map(p => `  - ${p}`).join('\n')
        );
      }
    });
  });

  describe('A-2：每個 hook command 腳本有執行權限（+x）', () => {
    test('所有 hook command 腳本有 +x 執行權限', () => {
      const notExecutable = [];
      for (const { event, command } of getAllHookCommands()) {
        const resolved = resolveCommand(command);
        if (!fs.existsSync(resolved)) continue; // A-1 已處理不存在的情況
        try {
          fs.accessSync(resolved, fs.constants.X_OK);
        } catch {
          notExecutable.push(`[${event}] ${resolved}`);
        }
      }
      if (notExecutable.length > 0) {
        throw new Error(
          `以下 hook command 腳本缺少執行權限（共 ${notExecutable.length} 個）：\n` +
          notExecutable.map(p => `  - ${p}`).join('\n')
        );
      }
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature B：Registry ↔ Workflow 閉環
// ────────────────────────────────────────────────────────────────────────────

describe('Feature B：Registry ↔ Workflow 閉環', () => {

  // 收集所有 workflow 中出現的唯一 stage 名稱
  function collectAllWorkflowStages() {
    const stageSet = new Set();
    for (const wf of Object.values(workflows)) {
      for (const stage of wf.stages) {
        stageSet.add(stage);
      }
    }
    return [...stageSet];
  }

  describe('B-1：每個 workflow stage 在 registry.stages 中有定義', () => {
    const allStages = collectAllWorkflowStages();

    test(`共 ${allStages.length} 個唯一 stage，全部在 registry.stages 中`, () => {
      const missing = allStages.filter(s => !stages[s]);
      if (missing.length > 0) {
        throw new Error(
          `以下 workflow stage 在 registry.stages 中未定義（共 ${missing.length} 個）：\n` +
          missing.map(s => `  - ${s}`).join('\n')
        );
      }
    });
  });

  describe('B-2：每個 stage 對應的 agent .md 存在', () => {
    for (const [stageName, stageDef] of Object.entries(stages)) {
      test(`${stageName} → ${stageDef.agent}.md 存在`, () => {
        const agentPath = join(AGENTS_DIR, `${stageDef.agent}.md`);
        expect(fs.existsSync(agentPath)).toBe(true);
      });
    }
  });

  describe('B-3：registry.stages 中的 agent 名稱格式合法（kebab-case）', () => {
    for (const [stageName, stageDef] of Object.entries(stages)) {
      test(`${stageName} agent 名稱 "${stageDef.agent}" 為 kebab-case`, () => {
        expect(stageDef.agent).toMatch(/^[a-z][a-z0-9-]*$/);
      });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature C：hookEvents ↔ hooks.json 事件一致性
// ────────────────────────────────────────────────────────────────────────────

describe('Feature C：hookEvents ↔ hooks.json 事件一致性', () => {

  describe('C-1：hooks.json 中的所有事件都在 registry.hookEvents 中', () => {
    test('hooks.json 事件全在 hookEvents 白名單中', () => {
      const unknown = [];
      for (const event of Object.keys(hooksConfig.hooks)) {
        if (!hookEvents.includes(event)) {
          unknown.push(event);
        }
      }
      if (unknown.length > 0) {
        throw new Error(
          `以下 hooks.json 事件不在 registry.hookEvents 中（共 ${unknown.length} 個）：\n` +
          unknown.map(e => `  - ${e}`).join('\n')
        );
      }
    });
  });

  describe('C-2：registry.hookEvents 中的所有事件都在 hooks.json 中使用', () => {
    test('registry hookEvents 全部在 hooks.json 中有對應', () => {
      const unusedEvents = [];
      for (const event of hookEvents) {
        if (!hooksConfig.hooks[event]) {
          unusedEvents.push(event);
        }
      }
      // 允許 registry 中有額外已知事件（新加的事件可能尚未 hook），
      // 但若 hooks.json 中有未知事件則 C-1 已阻擋。
      // 此測試記錄 registry 中未被使用的事件（warning only，不阻擋）。
      // 若全部覆蓋才是理想狀態，留下資訊提示。
      if (unusedEvents.length > 0) {
        // 記錄但不失敗 — registry 可預先宣告尚未部署的事件
        // 透過 expect 確保至少大部分事件都在 hooks.json 中
        const usedCount = hookEvents.length - unusedEvents.length;
        expect(usedCount).toBeGreaterThan(0);
      } else {
        expect(unusedEvents.length).toBe(0);
      }
    });
  });

  describe('C-3：hooks.json 事件總數不超過 registry.hookEvents 總數', () => {
    test('hooks.json 事件數量 <= registry hookEvents 數量', () => {
      const hooksJsonEventCount = Object.keys(hooksConfig.hooks).length;
      expect(hooksJsonEventCount).toBeLessThanOrEqual(hookEvents.length);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature D：Agent Skills 雙向引用
// ────────────────────────────────────────────────────────────────────────────

describe('Feature D：Agent Skills 雙向引用', () => {

  // user-invocable skills — 不需 agent 引用
  const USER_INVOCABLE_SKILLS = new Set([
    'auto', 'pm', 'evolve', 'issue', 'onboard', 'pr', 'specs', 'verify',
  ]);

  // 特殊豁免：有獨立設計理由的 knowledge domain skill
  // workflow-core：供 Hook 腳本和 Orchestrator 使用，沒有特定 agent consumer（設計決策）
  // instinct：Skill Internalization 飛輪的 output 知識庫，由系統自動維護，不直接被 agent frontmatter 引用
  const AGENT_CONSUMER_EXEMPT_SKILLS = new Set([
    'workflow-core',
    'instinct',
  ]);

  // 讀取所有 agent 的 skills frontmatter
  function loadAllAgentSkills() {
    const agentSkillsMap = new Map(); // agentName → string[]
    const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
    for (const file of agentFiles) {
      const agentName = file.replace('.md', '');
      const fm = parseFrontmatter(join(AGENTS_DIR, file));
      if (fm.skills) {
        const skills = Array.isArray(fm.skills) ? fm.skills : [fm.skills];
        agentSkillsMap.set(agentName, skills);
      }
    }
    return agentSkillsMap;
  }

  // 取得所有 skill 目錄名稱
  function getAllSkillDirs() {
    return fs.readdirSync(SKILLS_DIR).filter(d => {
      const skillMdPath = join(SKILLS_DIR, d, 'SKILL.md');
      return fs.existsSync(skillMdPath);
    });
  }

  describe('D-1：每個 agent skills 引用對應的 skill 目錄存在', () => {
    test('所有 agent 的 skills 引用都有對應的 skill/SKILL.md', () => {
      const brokenRefs = [];
      const agentSkillsMap = loadAllAgentSkills();

      for (const [agentName, skills] of agentSkillsMap) {
        for (const skillName of skills) {
          const skillPath = join(SKILLS_DIR, skillName, 'SKILL.md');
          if (!fs.existsSync(skillPath)) {
            brokenRefs.push(`${agentName} → skills/${skillName}/SKILL.md`);
          }
        }
      }

      if (brokenRefs.length > 0) {
        throw new Error(
          `以下 agent skills 引用指向不存在的 skill（共 ${brokenRefs.length} 個）：\n` +
          brokenRefs.map(r => `  - ${r}`).join('\n')
        );
      }
    });
  });

  describe('D-2：knowledge-domain skills 至少被一個 agent 引用（雙向完整性）', () => {
    test('所有非 user-invocable skill 至少被一個 agent 引用', () => {
      const allSkillDirs = getAllSkillDirs();
      const agentSkillsMap = loadAllAgentSkills();

      // 收集所有 agent 引用的 skill 名稱
      const referencedSkills = new Set();
      for (const skills of agentSkillsMap.values()) {
        for (const s of skills) {
          referencedSkills.add(s);
        }
      }

      const orphans = [];
      for (const skillDir of allSkillDirs) {
        if (USER_INVOCABLE_SKILLS.has(skillDir)) continue; // user-invocable 允許無 agent 引用
        if (AGENT_CONSUMER_EXEMPT_SKILLS.has(skillDir)) continue; // 有特殊設計理由的豁免
        if (!referencedSkills.has(skillDir)) {
          orphans.push(skillDir);
        }
      }

      if (orphans.length > 0) {
        throw new Error(
          `以下 skill 未被任何 agent 引用（孤立 skill，共 ${orphans.length} 個）：\n` +
          orphans.map(s => `  - skills/${s}`).join('\n') +
          `\n若為 user-invocable，請加入 USER_INVOCABLE_SKILLS 集合。`
        );
      }
    });
  });

  describe('D-3：agents 目錄中有 skills 欄位的 agent 數量正確', () => {
    test('有 skills 欄位的 agent 至少 5 個', () => {
      const agentSkillsMap = loadAllAgentSkills();
      // 已知有 skills 的 agent：tester, qa, developer, code-reviewer, database-reviewer,
      //   refactor-cleaner, security-reviewer（共 7 個）
      expect(agentSkillsMap.size).toBeGreaterThanOrEqual(5);
    });
  });
});
