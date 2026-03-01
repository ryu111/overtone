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

const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');

// ── 輔助函式：解析 frontmatter ──

/**
 * 手動解析 YAML frontmatter（簡易版，僅解析頂層 key: value 和 list 結構）
 * @param {string} filePath
 * @returns {object} frontmatter 物件
 */
function parseFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};
  let currentKey = null;
  let inList = false;

  for (const line of yaml.split('\n')) {
    const listItemMatch = line.match(/^  - (.+)$/);
    const kvMatch = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);

    if (listItemMatch && inList && currentKey) {
      if (!Array.isArray(result[currentKey])) {
        result[currentKey] = [];
      }
      result[currentKey].push(listItemMatch[1].trim());
    } else if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === '') {
        // 後面接 list 的情形
        result[currentKey] = [];
        inList = true;
      } else if (value === 'true') {
        result[currentKey] = true;
        inList = false;
      } else if (value === 'false') {
        result[currentKey] = false;
        inList = false;
      } else if (!isNaN(Number(value))) {
        result[currentKey] = Number(value);
        inList = false;
      } else {
        result[currentKey] = value;
        inList = false;
      }
    }
  }

  return result;
}

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

    for (const agentName of readonlyAgents) {
      test(`${agentName} disallowedTools 包含 Write`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools).toBeDefined();
        expect(fm.disallowedTools).toContain('Write');
      });

      test(`${agentName} disallowedTools 包含 Edit`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools).toContain('Edit');
      });

      test(`${agentName} disallowedTools 包含 Task`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools).toContain('Task');
      });

      test(`${agentName} disallowedTools 包含 NotebookEdit`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools).toContain('NotebookEdit');
      });
    }
  });

  // Scenario 1a-2: architect 可使用 Write 和 Edit（只禁 Task 和 NotebookEdit）
  describe('Scenario 1a-2: architect disallowedTools 只含 Task 和 NotebookEdit', () => {
    test('architect disallowedTools 包含 Task', () => {
      const fm = agentFrontmatters['architect'];
      expect(fm.disallowedTools).toBeDefined();
      expect(fm.disallowedTools).toContain('Task');
    });

    test('architect disallowedTools 包含 NotebookEdit', () => {
      const fm = agentFrontmatters['architect'];
      expect(fm.disallowedTools).toContain('NotebookEdit');
    });

    test('architect disallowedTools 不包含 Write', () => {
      const fm = agentFrontmatters['architect'];
      expect(fm.disallowedTools).not.toContain('Write');
    });

    test('architect disallowedTools 不包含 Edit', () => {
      const fm = agentFrontmatters['architect'];
      expect(fm.disallowedTools).not.toContain('Edit');
    });
  });

  // Scenario 1a-3: planner 可使用 Write 和 Edit
  describe('Scenario 1a-3: planner disallowedTools 只含 Task 和 NotebookEdit', () => {
    test('planner disallowedTools 包含 Task', () => {
      const fm = agentFrontmatters['planner'];
      expect(fm.disallowedTools).toBeDefined();
      expect(fm.disallowedTools).toContain('Task');
    });

    test('planner disallowedTools 包含 NotebookEdit', () => {
      const fm = agentFrontmatters['planner'];
      expect(fm.disallowedTools).toContain('NotebookEdit');
    });

    test('planner disallowedTools 不包含 Write', () => {
      const fm = agentFrontmatters['planner'];
      expect(fm.disallowedTools).not.toContain('Write');
    });

    test('planner disallowedTools 不包含 Edit', () => {
      const fm = agentFrontmatters['planner'];
      expect(fm.disallowedTools).not.toContain('Edit');
    });
  });

  // Scenario 1a-4: qa 可使用 Write 但無法使用 Edit
  describe('Scenario 1a-4: qa 禁用 Edit 但允許 Write', () => {
    test('qa disallowedTools 包含 Edit', () => {
      const fm = agentFrontmatters['qa'];
      expect(fm.disallowedTools).toBeDefined();
      expect(fm.disallowedTools).toContain('Edit');
    });

    test('qa disallowedTools 包含 Task', () => {
      const fm = agentFrontmatters['qa'];
      expect(fm.disallowedTools).toContain('Task');
    });

    test('qa disallowedTools 包含 NotebookEdit', () => {
      const fm = agentFrontmatters['qa'];
      expect(fm.disallowedTools).toContain('NotebookEdit');
    });

    test('qa disallowedTools 不包含 Write（可使用 Write）', () => {
      const fm = agentFrontmatters['qa'];
      expect(fm.disallowedTools).not.toContain('Write');
    });
  });

  // Scenario 1a-5: product-manager 和 designer 保留 Write 和 Edit
  describe('Scenario 1a-5: product-manager 和 designer 只禁 Task 和 NotebookEdit', () => {
    for (const agentName of ['product-manager', 'designer']) {
      test(`${agentName} disallowedTools 不包含 Write`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools).not.toContain('Write');
      });

      test(`${agentName} disallowedTools 不包含 Edit`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools).not.toContain('Edit');
      });

      test(`${agentName} disallowedTools 包含 Task`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools).toBeDefined();
        expect(fm.disallowedTools).toContain('Task');
      });

      test(`${agentName} disallowedTools 包含 NotebookEdit`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools).toContain('NotebookEdit');
      });
    }
  });

  // Scenario 1a-6: grader 維持 tools 白名單
  describe('Scenario 1a-6: grader 維持 tools 白名單不使用 disallowedTools', () => {
    test('grader frontmatter 包含 tools 欄位', () => {
      const fm = agentFrontmatters['grader'];
      expect(fm.tools).toBeDefined();
    });

    test('grader tools 包含 Read', () => {
      const fm = agentFrontmatters['grader'];
      expect(fm.tools).toContain('Read');
    });

    test('grader tools 包含 Bash', () => {
      const fm = agentFrontmatters['grader'];
      expect(fm.tools).toContain('Bash');
    });
  });

  // Scenario 1a-7: 無限制工具的 agent 不含 tools 或 disallowedTools
  describe('Scenario 1a-7: tester、developer、e2e-runner 等不含工具限制欄位', () => {
    const unrestrictedAgents = ['tester', 'developer', 'e2e-runner', 'build-error-resolver', 'refactor-cleaner', 'doc-updater'];

    for (const agentName of unrestrictedAgents) {
      test(`${agentName} frontmatter 不含 tools 白名單欄位`, () => {
        const fm = agentFrontmatters[agentName];
        // 這些 agent 沒有 tools（白名單）也沒有 disallowedTools
        expect(fm.tools).toBeUndefined();
      });

      test(`${agentName} frontmatter 不含 disallowedTools 欄位`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.disallowedTools).toBeUndefined();
      });
    }
  });

  // Scenario 1a-8: 10 個遷移 agent 不含舊的 tools 白名單
  describe('Scenario 1a-8: 遷移後 agent 不含舊 tools 白名單欄位', () => {
    const migratedAgents = [
      'code-reviewer', 'debugger', 'security-reviewer', 'database-reviewer', 'retrospective',
      'architect', 'planner', 'qa', 'product-manager', 'designer',
    ];

    for (const agentName of migratedAgents) {
      test(`${agentName} frontmatter 不含 tools 白名單欄位（已遷移至 disallowedTools）`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.tools).toBeUndefined();
      });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 1b: Agent skills 預載（agent frontmatter 部分）
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1b: Agent skills 預載（agent frontmatter）', () => {

  // Scenario 1b-5: tester 預載 ref-bdd-guide 和 ref-failure-handling
  describe('Scenario 1b-5: tester 的 skills 欄位', () => {
    test('tester frontmatter 含 skills 欄位', () => {
      const fm = agentFrontmatters['tester'];
      expect(fm.skills).toBeDefined();
    });

    test('tester skills 包含 ref-bdd-guide', () => {
      const fm = agentFrontmatters['tester'];
      expect(fm.skills).toContain('ref-bdd-guide');
    });

    test('tester skills 包含 ref-failure-handling', () => {
      const fm = agentFrontmatters['tester'];
      expect(fm.skills).toContain('ref-failure-handling');
    });
  });

  // Scenario 1b-6: developer 預載 ref-bdd-guide 和 ref-failure-handling
  describe('Scenario 1b-6: developer 的 skills 欄位', () => {
    test('developer frontmatter 含 skills 欄位', () => {
      const fm = agentFrontmatters['developer'];
      expect(fm.skills).toBeDefined();
    });

    test('developer skills 包含 ref-bdd-guide', () => {
      const fm = agentFrontmatters['developer'];
      expect(fm.skills).toContain('ref-bdd-guide');
    });

    test('developer skills 包含 ref-failure-handling', () => {
      const fm = agentFrontmatters['developer'];
      expect(fm.skills).toContain('ref-failure-handling');
    });
  });

  // Scenario 1b-7: code-reviewer 預載 ref-failure-handling 和 ref-wording-guide
  describe('Scenario 1b-7: code-reviewer 的 skills 欄位', () => {
    test('code-reviewer frontmatter 含 skills 欄位', () => {
      const fm = agentFrontmatters['code-reviewer'];
      expect(fm.skills).toBeDefined();
    });

    test('code-reviewer skills 包含 ref-failure-handling', () => {
      const fm = agentFrontmatters['code-reviewer'];
      expect(fm.skills).toContain('ref-failure-handling');
    });

    test('code-reviewer skills 包含 ref-wording-guide', () => {
      const fm = agentFrontmatters['code-reviewer'];
      expect(fm.skills).toContain('ref-wording-guide');
    });
  });

  // Scenario 1b-8: qa 預載 ref-bdd-guide，doc-updater 預載 ref-wording-guide
  describe('Scenario 1b-8: qa 和 doc-updater 的 skills 欄位', () => {
    test('qa frontmatter 含 skills 欄位', () => {
      const fm = agentFrontmatters['qa'];
      expect(fm.skills).toBeDefined();
    });

    test('qa skills 包含 ref-bdd-guide', () => {
      const fm = agentFrontmatters['qa'];
      expect(fm.skills).toContain('ref-bdd-guide');
    });

    test('doc-updater frontmatter 含 skills 欄位', () => {
      const fm = agentFrontmatters['doc-updater'];
      expect(fm.skills).toBeDefined();
    });

    test('doc-updater skills 包含 ref-wording-guide', () => {
      const fm = agentFrontmatters['doc-updater'];
      expect(fm.skills).toContain('ref-wording-guide');
    });
  });

  // Scenario 1b-10: 未指定預載的 agent 不含 skills 欄位
  describe('Scenario 1b-10: 未被指定預載的 agent 不含 skills 欄位', () => {
    const noSkillsAgents = ['architect', 'planner', 'security-reviewer', 'debugger'];

    for (const agentName of noSkillsAgents) {
      test(`${agentName} frontmatter 不含 skills 欄位`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.skills).toBeUndefined();
      });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature S10: Agent Memory
// ────────────────────────────────────────────────────────────────────────────

describe('Feature S10: Agent Memory', () => {

  // S10-1: 啟用 memory 的 agent
  describe('S10-1: memory: local agent', () => {
    for (const agentName of ['code-reviewer', 'retrospective', 'architect', 'security-reviewer', 'product-manager']) {
      test(`${agentName} frontmatter 包含 memory: local`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.memory).toBe('local');
      });
    }
  });

  // S10-2: 未啟用 memory 的 agent
  describe('S10-2: 其他 agent 不含 memory 欄位', () => {
    const noMemoryAgents = agentFiles.filter(a => !['code-reviewer', 'retrospective', 'architect', 'security-reviewer', 'product-manager'].includes(a));
    for (const agentName of noMemoryAgents) {
      test(`${agentName} frontmatter 不含 memory 欄位`, () => {
        const fm = agentFrontmatters[agentName];
        expect(fm.memory).toBeUndefined();
      });
    }
  });
});
