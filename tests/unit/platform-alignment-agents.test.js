'use strict';
/**
 * platform-alignment-agents.test.js
 *
 * Feature 1a: disallowedTools 遷移
 * Feature 1b: Agent skills 預載（agent frontmatter 部分）
 * BDD 規格：specs/features/in-progress/platform-alignment-phase1/bdd.md
 *
 * 策略：讀取 agent .md 的 frontmatter，驗證 disallowedTools 和 skills 欄位正確性。
 * 使用 gray-matter 解析 YAML frontmatter。
 */

const { describe, test, expect, beforeAll } = require('bun:test');
const { join } = require('path');
const fs = require('fs');
const { PLUGIN_ROOT } = require('../helpers/paths');
const { parseFrontmatter } = require('../helpers/frontmatter');

const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');

// ── 讀取所有 agent frontmatter ──

const agentFrontmatters = {};

const agentFiles = [
  'code-reviewer', 'debugger', 'security-reviewer', 'database-reviewer', 'retrospective',
  'architect', 'planner', 'qa', 'product-manager', 'designer',
  'tester', 'developer', 'doc-updater', 'e2e-runner', 'build-error-resolver',
  'refactor-cleaner', 'grader',
];

beforeAll(() => {
  for (const name of agentFiles) {
    const path = join(AGENTS_DIR, `${name}.md`);
    if (fs.existsSync(path)) {
      agentFrontmatters[name] = parseFrontmatter(path);
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 1a: disallowedTools 遷移
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1a: disallowedTools 遷移', () => {

  // Scenario 1a-1: 純唯讀 agent 使用 disallowedTools 禁止 Write、Edit、Task、NotebookEdit
  describe('Scenario 1a-1: 純唯讀 agent 設定 disallowedTools', () => {
    const readonlyAgents = [
      'code-reviewer', 'debugger', 'security-reviewer', 'database-reviewer', 'retrospective',
    ];

    test('所有唯讀 agent 的 disallowedTools 包含 Write、Edit、Task、NotebookEdit', () => {
      for (const agentName of readonlyAgents) {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools, `${agentName}: disallowedTools should be defined`).toBeDefined();
        expect(fm.disallowedTools, `${agentName}: should contain Write`).toContain('Write');
        expect(fm.disallowedTools, `${agentName}: should contain Edit`).toContain('Edit');
        expect(fm.disallowedTools, `${agentName}: should contain Task`).toContain('Task');
        expect(fm.disallowedTools, `${agentName}: should contain NotebookEdit`).toContain('NotebookEdit');
      }
    });
  });

  // Scenario 1a-2: architect 可使用 Write 和 Edit（只禁 Task 和 NotebookEdit）
  describe('Scenario 1a-2: architect disallowedTools 只含 Task 和 NotebookEdit', () => {
    test('architect disallowedTools 包含 Task 和 NotebookEdit，不包含 Write 和 Edit', () => {
      const fm = agentFrontmatters['architect'];
      expect(fm.disallowedTools).toBeDefined();
      expect(fm.disallowedTools).toContain('Task');
      expect(fm.disallowedTools).toContain('NotebookEdit');
      expect(fm.disallowedTools).not.toContain('Write');
      expect(fm.disallowedTools).not.toContain('Edit');
    });
  });

  // Scenario 1a-3: planner 可使用 Write 和 Edit
  describe('Scenario 1a-3: planner disallowedTools 只含 Task 和 NotebookEdit', () => {
    test('planner disallowedTools 包含 Task 和 NotebookEdit，不包含 Write 和 Edit', () => {
      const fm = agentFrontmatters['planner'];
      expect(fm.disallowedTools).toBeDefined();
      expect(fm.disallowedTools).toContain('Task');
      expect(fm.disallowedTools).toContain('NotebookEdit');
      expect(fm.disallowedTools).not.toContain('Write');
      expect(fm.disallowedTools).not.toContain('Edit');
    });
  });

  // Scenario 1a-4: qa 可使用 Write 但無法使用 Edit
  describe('Scenario 1a-4: qa 禁用 Edit 但允許 Write', () => {
    test('qa disallowedTools 包含 Edit、Task、NotebookEdit，不包含 Write', () => {
      const fm = agentFrontmatters['qa'];
      expect(fm.disallowedTools).toBeDefined();
      expect(fm.disallowedTools).toContain('Edit');
      expect(fm.disallowedTools).toContain('Task');
      expect(fm.disallowedTools).toContain('NotebookEdit');
      expect(fm.disallowedTools).not.toContain('Write');
    });
  });

  // Scenario 1a-5: product-manager 和 designer 保留 Write 和 Edit
  describe('Scenario 1a-5: product-manager 和 designer 只禁 Task 和 NotebookEdit', () => {
    test('product-manager 和 designer 的 disallowedTools 包含 Task 和 NotebookEdit，不包含 Write 和 Edit', () => {
      for (const agentName of ['product-manager', 'designer']) {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools, `${agentName}: disallowedTools should be defined`).toBeDefined();
        expect(fm.disallowedTools, `${agentName}: should contain Task`).toContain('Task');
        expect(fm.disallowedTools, `${agentName}: should contain NotebookEdit`).toContain('NotebookEdit');
        expect(fm.disallowedTools, `${agentName}: should not contain Write`).not.toContain('Write');
        expect(fm.disallowedTools, `${agentName}: should not contain Edit`).not.toContain('Edit');
      }
    });
  });

  // Scenario 1a-6: grader 維持 tools 白名單
  describe('Scenario 1a-6: grader 維持 tools 白名單不使用 disallowedTools', () => {
    test('grader tools 白名單包含 Read 和 Bash', () => {
      const fm = agentFrontmatters['grader'];
      expect(fm.tools).toBeDefined();
      expect(fm.tools).toContain('Read');
      expect(fm.tools).toContain('Bash');
    });
  });

  // Scenario 1a-7: 無限制工具的 agent 不含 tools 或 disallowedTools
  describe('Scenario 1a-7: tester、developer、e2e-runner 等不含工具限制欄位', () => {
    const unrestrictedAgents = ['tester', 'developer', 'e2e-runner', 'build-error-resolver', 'refactor-cleaner', 'doc-updater'];

    test('所有無限制 agent 不含 tools 白名單欄位和 disallowedTools 欄位', () => {
      for (const agentName of unrestrictedAgents) {
        const fm = agentFrontmatters[agentName];
        expect(fm.tools, `${agentName}: should not have tools whitelist`).toBeUndefined();
        expect(fm.disallowedTools, `${agentName}: should not have disallowedTools`).toBeUndefined();
      }
    });
  });

  // Scenario 1a-8: 10 個遷移 agent 不含舊的 tools 白名單
  describe('Scenario 1a-8: 遷移後 agent 不含舊 tools 白名單欄位', () => {
    const migratedAgents = [
      'code-reviewer', 'debugger', 'security-reviewer', 'database-reviewer', 'retrospective',
      'architect', 'planner', 'qa', 'product-manager', 'designer',
    ];

    test('所有遷移 agent 不含 tools 白名單欄位（已遷移至 disallowedTools）', () => {
      for (const agentName of migratedAgents) {
        const fm = agentFrontmatters[agentName];
        expect(fm.tools, `${agentName}: should not have tools whitelist after migration`).toBeUndefined();
      }
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 1b: Agent skills 預載（agent frontmatter 部分）
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1b: Agent skills 預載（agent frontmatter）', () => {

  // Scenario 1b-5: tester 預載 testing skill
  describe('Scenario 1b-5: tester 的 skills 欄位', () => {
    test('tester skills 包含 testing，不含已刪除的舊 ref', () => {
      const fm = agentFrontmatters['tester'];
      expect(fm.skills).toBeDefined();
      expect(fm.skills).toContain('testing');
      expect(fm.skills).not.toContain('ref-bdd-guide');
      expect(fm.skills).not.toContain('ref-failure-handling');
    });
  });

  // Scenario 1b-6: developer 預載 commit-convention
  describe('Scenario 1b-6: developer 的 skills 欄位', () => {
    test('developer skills 包含 commit-convention，不含已刪除的舊 ref', () => {
      const fm = agentFrontmatters['developer'];
      expect(fm.skills).toBeDefined();
      expect(fm.skills).toContain('commit-convention');
      expect(fm.skills).not.toContain('ref-commit-convention');
      expect(fm.skills).not.toContain('ref-bdd-guide');
    });
  });

  // Scenario 1b-7: code-reviewer 預載 code-review
  describe('Scenario 1b-7: code-reviewer 的 skills 欄位', () => {
    test('code-reviewer skills 包含 code-review，不含已刪除的舊 ref', () => {
      const fm = agentFrontmatters['code-reviewer'];
      expect(fm.skills).toBeDefined();
      expect(fm.skills).toContain('code-review');
      expect(fm.skills).not.toContain('ref-pr-review-checklist');
      expect(fm.skills).not.toContain('ref-wording-guide');
    });
  });

  // Scenario 1b-8: qa 含 testing skill；doc-updater 含 wording skill
  describe('Scenario 1b-8: qa 含 testing skill；doc-updater 含 wording skill', () => {
    test('qa skills 包含 testing，doc-updater skills 包含 wording', () => {
      const qaFm = agentFrontmatters['qa'];
      expect(qaFm.skills).toBeDefined();
      expect(qaFm.skills).toContain('testing');

      const docFm = agentFrontmatters['doc-updater'];
      expect(docFm.skills).toBeDefined();
      const skills = Array.isArray(docFm.skills) ? docFm.skills : [docFm.skills];
      expect(skills).toContain('wording');
    });
  });

  // Scenario 1b-10: 未指定預載的 agent 不含 skills 欄位（debugger 為代表）
  describe('Scenario 1b-10: 未被指定預載的 agent 不含 skills 欄位', () => {
    // architect、planner 已加入 wording skill，不再符合「無 skills」
    // 僅驗證未加入任何 skill 的 agent
    const noSkillsAgents = ['designer'];

    test('designer 不含 skills 欄位', () => {
      for (const agentName of noSkillsAgents) {
        const fm = agentFrontmatters[agentName];
        expect(fm.skills, `${agentName}: should not have skills`).toBeUndefined();
      }
    });
  });

  // Scenario 1b-12: architect 和 planner 含 wording skill（新增）
  describe('Scenario 1b-12: architect 和 planner 含 wording skill', () => {
    test('architect 和 planner 的 skills 包含 wording', () => {
      for (const agentName of ['architect', 'planner']) {
        const fm = agentFrontmatters[agentName];
        expect(fm.skills, `${agentName}: skills should be defined`).toBeDefined();
        const skills = Array.isArray(fm.skills) ? fm.skills : [fm.skills];
        expect(skills, `${agentName}: should contain wording`).toContain('wording');
      }
    });
  });

  // Scenario 1b-11: security-reviewer 預載 security-kb
  describe('Scenario 1b-11: security-reviewer 的 skills 欄位', () => {
    test('security-reviewer skills 包含 security-kb', () => {
      const fm = agentFrontmatters['security-reviewer'];
      expect(fm.skills).toBeDefined();
      expect(fm.skills).toContain('security-kb');
    });
  });

  // Scenario 1b-12: database-reviewer 預載 database
  describe('Scenario 1b-12: database-reviewer 的 skills 欄位', () => {
    test('database-reviewer skills 包含 database', () => {
      const fm = agentFrontmatters['database-reviewer'];
      expect(fm.skills).toBeDefined();
      expect(fm.skills).toContain('database');
    });
  });

  // Scenario 1b-13: refactor-cleaner 預載 dead-code
  describe('Scenario 1b-13: refactor-cleaner 的 skills 欄位', () => {
    test('refactor-cleaner skills 包含 dead-code', () => {
      const fm = agentFrontmatters['refactor-cleaner'];
      expect(fm.skills).toBeDefined();
      expect(fm.skills).toContain('dead-code');
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature S10: Agent Memory
// ────────────────────────────────────────────────────────────────────────────

describe('Feature S10: Agent Memory', () => {

  // S10-1: 啟用 memory 的 agent
  // 決策型（opus）：code-reviewer、security-reviewer、product-manager
  // 執行型（sonnet，Phase 2 個體學習升級）：developer、tester、debugger、planner、architect
  const memoryAgents = [
    'code-reviewer', 'security-reviewer', 'product-manager',
    'developer', 'tester', 'debugger', 'planner', 'architect',
  ];
  describe('S10-1: memory: local agent', () => {
    test('所有啟用 memory 的 agent frontmatter 包含 memory: local', () => {
      for (const agentName of memoryAgents) {
        const fm = agentFrontmatters[agentName];
        expect(fm.memory, `${agentName}: memory should be local`).toBe('local');
      }
    });
  });

  // S10-2: 未啟用 memory 的 agent
  describe('S10-2: 其他 agent 不含 memory 欄位', () => {
    const noMemoryAgents = agentFiles.filter(a => !memoryAgents.includes(a));
    test('所有未啟用 memory 的 agent 不含 memory 欄位', () => {
      for (const agentName of noMemoryAgents) {
        const fm = agentFrontmatters[agentName];
        expect(fm.memory, `${agentName}: should not have memory`).toBeUndefined();
      }
    });
  });
});
