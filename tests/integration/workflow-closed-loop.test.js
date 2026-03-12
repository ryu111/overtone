'use strict';
/**
 * workflow-closed-loop.test.js — Workflow 閉環驗證整合測試
 *
 * 驗證 S15b 重構後的 runtime 完整性：
 *   A. 每個 workflow 模板的 stage 序列都有效（stage → registry 映射存在）
 *   B. 每個映射的 agent 有對應的 .md 檔案
 *   C. 並行群組定義合理（stages 在 registry 中、不重疊）
 *   D. Workflow → Stage → Agent → Skills 完整鏈路（以 quick 為代表）
 *   E. State 生命週期閉環（initState → readState → updateStateAtomic → 完成度計算）
 *
 * 注意：
 *   - on-submit.test.js 已覆蓋 systemMessage 注入鏈，此處不重複
 *   - pre-edit-guard.test.js 已覆蓋 guard 保護範圍，此處不重複
 *   - wording.test.js 已覆蓋 wording 偵測，此處不重複
 *   - session-stop.test.js 已覆蓋 loop 邏輯，此處不重複
 *   - state.test.js 已覆蓋 state CRUD，此處只驗證閉環語義
 */

const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, rmSync, existsSync } = require('fs');
const { homedir } = require('os');
const { join } = require('path');
const { SCRIPTS_LIB, PLUGIN_ROOT } = require('../helpers/paths');
const { parseFrontmatter } = require('../helpers/frontmatter');

const registry = require(join(SCRIPTS_LIB, 'registry'));
const state = require(join(SCRIPTS_LIB, 'state'));
const SessionContext = require(join(SCRIPTS_LIB, 'session-context'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');
const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');

// ── 測試 session 管理 ──

const TEST_SESSION = `test_closed_loop_${Date.now()}`;
const TEST_PROJECT_ROOT = homedir();
const SESSION_DIR = paths.sessionDir(TEST_PROJECT_ROOT, TEST_SESSION);

beforeEach(() => {
  mkdirSync(SESSION_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(SESSION_DIR, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// A. 每個 workflow 模板的 stage 序列都有效
// ────────────────────────────────────────────────────────────────────────────

describe('A. Workflow 模板 stage 序列有效性', () => {
  const { workflows, stages } = registry;

  test('所有 workflow 都有 stages 陣列且非空', () => {
    for (const [name, wf] of Object.entries(workflows)) {
      expect(Array.isArray(wf.stages)).toBe(true);
      expect(wf.stages.length).toBeGreaterThan(0);
    }
  });

  test('18 個 workflow 模板全部存在', () => {
    const expectedWorkflows = [
      'single', 'quick', 'standard', 'full', 'secure',
      'tdd', 'debug', 'refactor', 'review-only', 'security-only',
      'build-fix', 'e2e-only', 'diagnose', 'clean', 'db-review',
      'product', 'product-full', 'discovery',
    ];
    for (const name of expectedWorkflows) {
      expect(workflows[name]).toBeDefined();
    }
    const { WORKFLOW_COUNT } = require('../helpers/counts');
    expect(Object.keys(workflows).length).toBe(WORKFLOW_COUNT);
  });

  // 針對每個 workflow 的每個 stage 都在 registry.stages 中
  for (const [wfName, wf] of Object.entries(workflows)) {
    test(`${wfName}：所有 stages 在 registry.stages 中都有映射`, () => {
      for (const stage of wf.stages) {
        expect(stages[stage]).toBeDefined();
      }
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// B. 每個映射的 agent 有對應的 .md 檔案
// ────────────────────────────────────────────────────────────────────────────

describe('B. Stage → Agent .md 檔案存在性', () => {
  const { stages } = registry;

  test('所有 stage 定義都有 agent 欄位', () => {
    for (const [stage, def] of Object.entries(stages)) {
      expect(typeof def.agent).toBe('string');
      expect(def.agent.length).toBeGreaterThan(0);
    }
  });

  // 針對每個 stage 驗證 agent .md 存在
  for (const [stage, def] of Object.entries(stages)) {
    test(`${stage} → ${def.agent}.md 存在`, () => {
      const agentFile = join(AGENTS_DIR, `${def.agent}.md`);
      expect(existsSync(agentFile)).toBe(true);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// C. 並行群組定義合理性
// ────────────────────────────────────────────────────────────────────────────

describe('C. 並行群組定義合理性', () => {
  const { parallelGroupDefs, stages, workflows } = registry;

  test('parallelGroupDefs 中的每個 group 都有至少 2 個成員', () => {
    for (const [groupName, members] of Object.entries(parallelGroupDefs)) {
      expect(members.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('parallelGroupDefs 中的每個 stage 在 registry.stages 中都有映射', () => {
    for (const [groupName, members] of Object.entries(parallelGroupDefs)) {
      for (const stage of members) {
        expect(stages[stage]).toBeDefined();
      }
    }
  });

  test('同一並行群組內的 stages 不重疊（無重複成員）', () => {
    for (const [groupName, members] of Object.entries(parallelGroupDefs)) {
      const unique = new Set(members);
      expect(unique.size).toBe(members.length);
    }
  });

  test('workflow 引用的 parallelGroups 都在 parallelGroupDefs 中', () => {
    for (const [wfName, wf] of Object.entries(workflows)) {
      for (const groupRef of (wf.parallelGroups || [])) {
        expect(parallelGroupDefs[groupRef]).toBeDefined();
      }
    }
  });

  test('parallelGroups 計算結果與 parallelGroupDefs 一致（被任一 workflow 引用的群組）', () => {
    const { parallelGroups } = registry;
    // parallelGroups 只包含被 workflow 引用的群組
    for (const [groupName, members] of Object.entries(parallelGroups)) {
      expect(parallelGroupDefs[groupName]).toEqual(members);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// D. Workflow → Stage → Agent → Skills 完整鏈路（quick workflow）
// ────────────────────────────────────────────────────────────────────────────

describe('D. quick workflow 完整鏈路驗證', () => {
  const { workflows, stages } = registry;

  test('quick workflow 定義正確 stage 序列（不含 TEST）', () => {
    const quick = workflows.quick;
    expect(quick.stages).toEqual(['DEV', 'REVIEW', 'RETRO', 'DOCS']);
  });

  test('quick workflow 每個 stage 都有 agent 映射', () => {
    const expected = {
      DEV: 'developer',
      REVIEW: 'code-reviewer',
      RETRO: 'retrospective',
      DOCS: 'doc-updater',
    };
    for (const [stage, agentName] of Object.entries(expected)) {
      expect(stages[stage].agent).toBe(agentName);
    }
  });

  test('quick workflow 每個 agent .md 存在且有 skills 欄位', () => {
    const expectedAgents = {
      DEV: { agent: 'developer', skills: ['commit-convention', 'wording'] },
      REVIEW: { agent: 'code-reviewer', skills: ['code-review', 'wording'] },
      RETRO: { agent: 'retrospective', skills: ['wording'] },
      DOCS: { agent: 'doc-updater', skills: ['wording'] },
    };

    for (const [stage, { agent, skills }] of Object.entries(expectedAgents)) {
      const agentFile = join(AGENTS_DIR, `${agent}.md`);
      expect(existsSync(agentFile)).toBe(true);

      const fm = parseFrontmatter(agentFile);
      expect(Array.isArray(fm.skills)).toBe(true);

      for (const skill of skills) {
        expect(fm.skills).toContain(skill);
      }
    }
  });

  test('quick workflow 每個 agent 所使用的 skill 目錄都存在', () => {
    const allSkillsUsed = [
      'commit-convention',
      'code-review',
      'wording',
    ];

    const unique = [...new Set(allSkillsUsed)];
    for (const skill of unique) {
      const skillDir = join(SKILLS_DIR, skill);
      expect(existsSync(skillDir)).toBe(true);
    }
  });

  test('quick workflow 使用 postdev 並行群組（RETRO + DOCS 並行）', () => {
    const quick = workflows.quick;
    expect(quick.parallelGroups).toEqual(['postdev']);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// E. State 生命週期閉環（init → read → update → 完成度）
// ────────────────────────────────────────────────────────────────────────────

describe('E. State 生命週期閉環（quick workflow）', () => {
  test('initState 後 readState 驗證初始狀態正確', () => {
    const s = state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION), 'quick', ['DEV', 'REVIEW', 'RETRO', 'DOCS']);

    expect(s.workflowType).toBe('quick');
    expect(s.currentStage).toBe('DEV');
    expect(Object.keys(s.stages)).toEqual(['DEV', 'REVIEW', 'RETRO', 'DOCS']);

    // 所有 stages 初始為 pending
    for (const stageKey of Object.keys(s.stages)) {
      expect(s.stages[stageKey].status).toBe('pending');
    }

    // 讀回驗證持久化正確
    const read = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION));
    expect(read).toEqual(s);
  });

  test('updateStateAtomic 更新 DEV stage → currentStage 推進到 REVIEW', () => {
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION), 'quick', ['DEV', 'REVIEW', 'RETRO', 'DOCS']);

    const updated = state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION), (s) => {
      s.stages.DEV.status = 'completed';
      s.stages.DEV.result = 'pass';
      const keys = Object.keys(s.stages);
      const next = keys.find(k => s.stages[k].status === 'pending');
      if (next) s.currentStage = next;
      return s;
    });

    expect(updated.stages.DEV.status).toBe('completed');
    expect(updated.stages.DEV.result).toBe('pass');
    expect(updated.currentStage).toBe('REVIEW');

    // 讀回確認持久化
    const read = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION));
    expect(read.stages.DEV.status).toBe('completed');
    expect(read.currentStage).toBe('REVIEW');
  });

  test('所有 stages 完成後完成度為 100%（currentStage 不再有 pending）', () => {
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION), 'quick', ['DEV', 'REVIEW', 'RETRO', 'DOCS']);

    const stageList = ['DEV', 'REVIEW', 'RETRO', 'DOCS'];
    for (const stageKey of stageList) {
      state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION), (s) => {
        s.stages[stageKey].status = 'completed';
        s.stages[stageKey].result = 'pass';
        const keys = Object.keys(s.stages);
        const next = keys.find(k => s.stages[k].status === 'pending');
        if (next) s.currentStage = next;
        return s;
      });
    }

    const final = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION));
    const pendingCount = Object.values(final.stages).filter(
      (s) => s.status === 'pending'
    ).length;
    expect(pendingCount).toBe(0);

    const completedCount = Object.values(final.stages).filter(
      (s) => s.status === 'completed'
    ).length;
    expect(completedCount).toBe(stageList.length);

    // currentStage 在全部完成後不再指向 pending stage
    expect(final.stages[final.currentStage]?.status ?? 'none').not.toBe('pending');
  });

  test('standard workflow TEST stage 正確標記 spec/verify mode', () => {
    const s = state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, TEST_SESSION), 'standard', ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST']);

    // 第一個 TEST（在 DEV 之前）→ spec mode
    expect(s.stages.TEST.mode).toBe('spec');
    // 第二個 TEST（在 DEV 之後）→ verify mode
    expect(s.stages['TEST:2'].mode).toBe('verify');
  });
});
