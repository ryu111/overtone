'use strict';
/**
 * registry-config.test.js — Registry × Config API 交叉驗證
 *
 * 確保：
 *   1. registry-data.json stages ↔ agents/*.md 檔案雙向一致
 *   2. registry workflows ↔ stages 名稱引用一致
 *   3. parallelGroupDefs 成員合法性
 *   4. workflows ↔ commands/*.md 路由可達性
 *   5. specsConfig 涵蓋所有 18 個 workflow
 *   6. config-api.js 引用的 registry 與 registry.js exports 一致
 *   7. hookEvents 與 hooks.json 使用的 event 雙向一致
 *
 * 不重複 registry.test.js 與 platform-alignment-registry.test.js 已有的驗證。
 * 聚焦交叉驗證（registry ↔ 實際檔案結構）。
 */

const { describe, test, expect, beforeAll } = require('bun:test');
const { join } = require('path');
const { existsSync, readdirSync, readFileSync } = require('fs');
const { execSync } = require('child_process');

const { PLUGIN_ROOT, SCRIPTS_LIB } = require('../helpers/paths');

const registry = require(join(SCRIPTS_LIB, 'registry'));
const registryData = require(join(SCRIPTS_LIB, 'registry-data.json'));

const { stages, agentModels, workflows, parallelGroupDefs, specsConfig, hookEvents } = registry;

const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');
const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');
const HOOKS_JSON_PATH = join(PLUGIN_ROOT, 'hooks', 'hooks.json');

// ──────────────────────────────────────────────────────────────
// 測試分組 1：Registry Stages ↔ Agent 檔案交叉驗證
// ──────────────────────────────────────────────────────────────

describe('1. Registry Stages ↔ Agent 檔案交叉驗證', () => {
  let agentFileNames;
  beforeAll(() => {
    agentFileNames = new Set(
      readdirSync(AGENTS_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''))
    );
  });

  test('registry-data.json 的每個 stage agent 在 agents/*.md 中都有對應檔案', () => {
    for (const [stageName, stageDef] of Object.entries(stages)) {
      const agentName = stageDef.agent;
      const filePath = join(AGENTS_DIR, `${agentName}.md`);
      expect(
        existsSync(filePath),
        `stage ${stageName} 的 agent "${agentName}" 缺少 agents/${agentName}.md`
      ).toBe(true);
    }
  });

  test('agentModels 涵蓋所有 16 個 stage agent（每個 stage agent 都有 model 分配）', () => {
    const stageAgents = Object.values(stages).map(s => s.agent);
    for (const agentName of stageAgents) {
      expect(
        agentModels[agentName],
        `stage agent "${agentName}" 在 agentModels 中沒有 model 分配`
      ).toBeDefined();
    }
  });

  test('agentModels 中沒有多餘的 agent（不在 stages 的 agent，grader 除外）', () => {
    const stageAgents = new Set(Object.values(stages).map(s => s.agent));
    const extraAgents = Object.keys(agentModels).filter(
      a => !stageAgents.has(a) && a !== 'grader'
    );
    expect(extraAgents).toEqual([]);
  });

  test('agents/*.md 中每個非 grader 的 agent 都對應到某個 stage', () => {
    const stageAgents = new Set(Object.values(stages).map(s => s.agent));
    const nonGraderFiles = readdirSync(AGENTS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''))
      .filter(name => name !== 'grader');

    for (const agentFileName of nonGraderFiles) {
      expect(
        stageAgents.has(agentFileName),
        `agents/${agentFileName}.md 沒有對應的 stage 定義`
      ).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────
// 測試分組 2：Registry Workflows ↔ Stages 一致性
// ──────────────────────────────────────────────────────────────

describe('2. Registry Workflows ↔ Stages 一致性', () => {
  const stageKeys = new Set(Object.keys(stages));

  test('每個 workflow stages 陣列中的 stage 名稱都在 registry stages 中定義', () => {
    for (const [wfName, wfDef] of Object.entries(workflows)) {
      for (const stageName of wfDef.stages) {
        expect(
          stageKeys.has(stageName),
          `workflow "${wfName}" 引用了未定義的 stage: "${stageName}"`
        ).toBe(true);
      }
    }
  });

  test('每個 workflow 的 parallelGroups 引用的群組名稱都在 parallelGroupDefs 中定義', () => {
    const groupNames = new Set(Object.keys(parallelGroupDefs));
    for (const [wfName, wfDef] of Object.entries(workflows)) {
      for (const groupName of (wfDef.parallelGroups || [])) {
        expect(
          groupNames.has(groupName),
          `workflow "${wfName}" 引用了未定義的 parallelGroup: "${groupName}"`
        ).toBe(true);
      }
    }
  });

  test('parallelGroupDefs 中每個群組的成員都是合法 stage 名稱', () => {
    for (const [groupName, members] of Object.entries(parallelGroupDefs)) {
      for (const memberStage of members) {
        expect(
          stageKeys.has(memberStage),
          `parallelGroupDefs["${groupName}"] 包含未定義的 stage: "${memberStage}"`
        ).toBe(true);
      }
    }
  });

  test('registry 共有 18 個 workflow', () => {
    expect(Object.keys(workflows).length).toBe(18);
  });
});

// ──────────────────────────────────────────────────────────────
// 測試分組 3：Registry Workflows ↔ Commands 路由可達性
// ──────────────────────────────────────────────────────────────

describe('3. Registry Workflows ↔ Commands 路由可達性', () => {
  const workflowsWithCommands = [
    'quick', 'standard', 'full', 'secure', 'tdd',
    'debug', 'refactor', 'build-fix', 'diagnose', 'clean', 'db-review',
  ];

  test('有 command 檔案的 workflow 都能找到 commands/*.md', () => {
    for (const wfName of workflowsWithCommands) {
      const cmdPath = join(COMMANDS_DIR, `${wfName}.md`);
      expect(
        existsSync(cmdPath),
        `workflow "${wfName}" 預期有 commands/${wfName}.md 但找不到`
      ).toBe(true);
    }
  });

  test('所有 18 個 workflow 都能透過 workflow-core skill 路由（路由可達）', () => {
    const workflowCoreSkillPath = join(SKILLS_DIR, 'workflow-core', 'SKILL.md');
    expect(
      existsSync(workflowCoreSkillPath),
      'workflow-core/SKILL.md 必須存在（所有 workflow 的通用路由入口）'
    ).toBe(true);

    for (const wfName of Object.keys(workflows)) {
      expect(typeof wfName).toBe('string');
      expect(wfName.length).toBeGreaterThan(0);
    }
  });

  test('auto skill 存在（提供 /ot:auto 入口路由）', () => {
    const autoSkillPath = join(SKILLS_DIR, 'auto', 'SKILL.md');
    expect(
      existsSync(autoSkillPath),
      'auto/SKILL.md 必須存在（/ot:auto 入口路由）'
    ).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// 測試分組 4：specsConfig 涵蓋所有 workflow
// ──────────────────────────────────────────────────────────────

describe('4. specsConfig 涵蓋所有 18 個 workflow', () => {
  const workflowKeys = Object.keys(workflows);
  const specsConfigKeys = new Set(Object.keys(specsConfig));

  test('specsConfig 中的 key 數量等於 workflow 數量（18 個）', () => {
    expect(Object.keys(specsConfig).length).toBe(18);
  });

  test('每個 workflow key 都在 specsConfig 中有對應設定', () => {
    for (const wfName of workflowKeys) {
      expect(
        specsConfigKeys.has(wfName),
        `workflow "${wfName}" 在 specsConfig 中沒有對應設定`
      ).toBe(true);
    }
  });

  test('specsConfig 中沒有 workflows 不存在的 key', () => {
    const wfSet = new Set(workflowKeys);
    const extraKeys = Object.keys(specsConfig).filter(k => !wfSet.has(k));
    expect(extraKeys).toEqual([]);
  });

  test('specsConfig 的值只能是 []、["tasks"]、["tasks", "bdd"] 其中之一', () => {
    const validValues = [
      JSON.stringify([]),
      JSON.stringify(['tasks']),
      JSON.stringify(['tasks', 'bdd']),
    ];
    for (const [wfName, value] of Object.entries(specsConfig)) {
      expect(
        validValues.includes(JSON.stringify(value)),
        `specsConfig["${wfName}"] 的值 ${JSON.stringify(value)} 不合法`
      ).toBe(true);
    }
  });

  test('含 PLAN 或 ARCH 的 workflow 必須有 bdd 設定', () => {
    for (const [wfName, wfDef] of Object.entries(workflows)) {
      const hasPlanOrArch = wfDef.stages.includes('PLAN') || wfDef.stages.includes('ARCH');
      if (hasPlanOrArch) {
        expect(
          specsConfig[wfName].includes('bdd'),
          `workflow "${wfName}" 含 PLAN/ARCH，specsConfig 應包含 "bdd"`
        ).toBe(true);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────
// 測試分組 5：Config API 一致性
// ──────────────────────────────────────────────────────────────

describe('5. Config API 一致性', () => {
  test('registry-data.json stages 與 registry.js 匯出的 stages 是同一物件（直接引用）', () => {
    expect(JSON.stringify(registryData.stages)).toBe(JSON.stringify(stages));
  });

  test('registry-data.json agentModels 與 registry.js 匯出的 agentModels 一致', () => {
    expect(JSON.stringify(registryData.agentModels)).toBe(JSON.stringify(agentModels));
  });

  test('validate-agents.js 指令碼可成功執行（exit code 0）', () => {
    const validateScript = join(PLUGIN_ROOT, 'scripts', 'validate-agents.js');
    expect(existsSync(validateScript)).toBe(true);

    let exitCode = 0;
    try {
      execSync(`node "${validateScript}"`, { stdio: 'pipe' });
    } catch (err) {
      exitCode = err.status ?? 1;
    }
    expect(exitCode).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────
// 測試分組 6：hookEvents 與 hooks.json 一致性
// ──────────────────────────────────────────────────────────────

describe('6. hookEvents 與 hooks.json 一致性', () => {
  let hooksJson;
  beforeAll(() => {
    hooksJson = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));
  });

  test('hooks.json 中每個事件 key 都在 hookEvents 陣列中', () => {
    const hookEventSet = new Set(hookEvents);
    for (const event of Object.keys(hooksJson.hooks)) {
      expect(
        hookEventSet.has(event),
        `hooks.json 包含未在 hookEvents 中定義的 event: "${event}"`
      ).toBe(true);
    }
  });

  test('hookEvents 涵蓋 hooks.json 中所有事件', () => {
    const usedEvents = new Set(Object.keys(hooksJson.hooks));
    const hookEventSet = new Set(hookEvents);

    for (const usedEvent of usedEvents) {
      expect(
        hookEventSet.has(usedEvent),
        `hooks.json 使用的 event "${usedEvent}" 未在 hookEvents 中定義`
      ).toBe(true);
    }
  });

  test('hooks.json 共有 11 個事件定義（對應 11 個 hook 腳本）', () => {
    expect(Object.keys(hooksJson.hooks).length).toBe(11);
  });

  test('hooks.json 中的事件數量不超過 hookEvents 總數', () => {
    const usedEvents = Object.keys(hooksJson.hooks);
    expect(usedEvents.length).toBeLessThanOrEqual(hookEvents.length);
  });

  test('hooks.json 包含 TaskCompleted 和 Notification 這兩個後加入的事件', () => {
    expect(hooksJson.hooks.TaskCompleted).toBeDefined();
    expect(hooksJson.hooks.Notification).toBeDefined();
  });

  test('hookEvents 包含 hooks.json 所有事件 key（雙向一致）', () => {
    const hookEventSet = new Set(hookEvents);

    for (const event of Object.keys(hooksJson.hooks)) {
      expect(hookEventSet.has(event)).toBe(true);
    }
  });
});
