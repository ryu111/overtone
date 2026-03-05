'use strict';
/**
 * dependency-graph.test.js
 *
 * Feature: dependency-graph.js — Overtone plugin 依賴圖核心模組
 *
 * Feature 1: buildGraph — 建立依賴圖
 * Feature 2: 掃描器 1 — Agent Skills（agent → skill）
 * Feature 3: 掃描器 2 — Skill References（skill → references）
 * Feature 4: 掃描器 3 — Registry Stages（registry-data.json → agent）
 * Feature 5: 掃描器 4 — Hook Requires（hook script → lib modules）
 * Feature 6: getImpacted — 雙向影響查詢
 * Feature 7: getDependencies — 正向依賴查詢
 * Feature 8: getRawGraph — 原始圖資料
 * Feature 10: 邊界條件與錯誤處理
 */

const { describe, it, expect, beforeAll, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { buildGraph, inferType } = require(join(SCRIPTS_LIB, 'dependency-graph'));

// ── fixture 工廠 ────────────────────────────────────────────────────────────

const FIXTURE_BASE = join(tmpdir(), `ot_depgraph_${Date.now()}`);

/**
 * 建立一個完整的 fixture plugin 目錄
 * @param {string} name - fixture 名稱（子目錄）
 * @param {object} opts
 * @returns {string} pluginRoot 絕對路徑
 */
function createFixture(name, opts = {}) {
  const root = join(FIXTURE_BASE, name);
  mkdirSync(root, { recursive: true });

  // 建立標準子目錄
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, 'skills', 'testing', 'references'), { recursive: true });
  mkdirSync(join(root, 'skills', 'craft', 'references'), { recursive: true });
  mkdirSync(join(root, 'skills', 'commit-convention'), { recursive: true });
  mkdirSync(join(root, 'hooks', 'scripts', 'session'), { recursive: true });
  mkdirSync(join(root, 'hooks', 'scripts', 'agent'), { recursive: true });
  mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });

  // 可選：自訂寫入
  if (opts.write) {
    for (const [relPath, content] of Object.entries(opts.write)) {
      const abs = join(root, relPath);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, content, 'utf8');
    }
  }

  return root;
}

afterAll(() => {
  rmSync(FIXTURE_BASE, { recursive: true, force: true });
});

// ── Feature 1: buildGraph ───────────────────────────────────────────────────

describe('Feature 1: buildGraph — 建立依賴圖', () => {
  it('Scenario 1-1: 正常 plugin 目錄建立圖成功，回傳具有三個方法的 DependencyGraph', () => {
    const root = createFixture('f1s1');
    const graph = buildGraph(root);
    expect(typeof graph.getImpacted).toBe('function');
    expect(typeof graph.getDependencies).toBe('function');
    expect(typeof graph.getRawGraph).toBe('function');
  });

  it('Scenario 1-2: pluginRoot 不存在時拋出錯誤', () => {
    expect(() => buildGraph('/tmp/nonexistent-plugin-overtone-abc123')).toThrow();
  });

  it('Scenario 1-2: 錯誤訊息包含 "pluginRoot 不存在"', () => {
    let err;
    try {
      buildGraph('/tmp/nonexistent-plugin-overtone-abc123');
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.message).toContain('pluginRoot 不存在');
  });

  it('Scenario 1-3: 空 plugin 目錄（無元件）回傳空圖', () => {
    const emptyRoot = join(FIXTURE_BASE, 'f1s3-empty');
    mkdirSync(emptyRoot, { recursive: true });

    const graph = buildGraph(emptyRoot);
    const raw = graph.getRawGraph();
    expect(raw).toEqual({ dependencies: {}, dependents: {} });
  });

  it('Scenario 1-4: 單一 agent 檔案損壞（非法 frontmatter）不中斷掃描', () => {
    const root = createFixture('f1s4', {
      write: {
        'agents/broken.md': '---\n{invalid: yaml: colon\n---\ncontent',
        'agents/good.md': '---\nname: good\nskills:\n  - testing\n---\n',
        'skills/testing/SKILL.md': '# Testing\n',
      },
    });
    // 不應拋出
    const graph = buildGraph(root);
    // good.md 的依賴應正常建立
    const deps = graph.getDependencies('agents/good.md');
    expect(deps).toContain('skills/testing/SKILL.md');
  });
});

// ── Feature 2: 掃描器 1 — Agent Skills ─────────────────────────────────────

describe('Feature 2: 掃描器 1 — Agent Skills', () => {
  let root;
  let graph;

  beforeAll(() => {
    root = createFixture('f2', {
      write: {
        'agents/developer.md': [
          '---',
          'name: developer',
          'skills:',
          '  - craft',
          '  - commit-convention',
          '---',
          '# Developer',
        ].join('\n'),
        'agents/grader.md': [
          '---',
          'name: grader',
          'description: no skills here',
          '---',
          '# Grader',
        ].join('\n'),
        'agents/designer.md': [
          '---',
          'name: designer',
          'skills: []',
          '---',
          '# Designer',
        ].join('\n'),
        'agents/tester.md': [
          '---',
          'name: tester',
          'skills:',
          '  - testing',
          '---',
          '# Tester',
        ].join('\n'),
        'agents/qa.md': [
          '---',
          'name: qa',
          'skills:',
          '  - testing',
          '---',
          '# QA',
        ].join('\n'),
      },
    });
    graph = buildGraph(root);
  });

  it('Scenario 2-1: developer.md → craft + commit-convention SKILL.md', () => {
    const deps = graph.getDependencies('agents/developer.md');
    expect(deps).toContain('skills/craft/SKILL.md');
    expect(deps).toContain('skills/commit-convention/SKILL.md');
  });

  it('Scenario 2-2: Agent 無 skills 欄位時不建立任何 skill 依賴', () => {
    const deps = graph.getDependencies('agents/grader.md');
    expect(deps).toEqual([]);
  });

  it('Scenario 2-3: Agent skills 欄位為空陣列時跳過', () => {
    const deps = graph.getDependencies('agents/designer.md');
    expect(deps).toEqual([]);
  });

  it('Scenario 2-4: 多個 Agent 共用同一個 Skill — testing SKILL.md 的 dependents 包含 tester 和 qa', () => {
    const result = graph.getImpacted('skills/testing/SKILL.md');
    const paths = result.impacted.map((i) => i.path);
    expect(paths).toContain('agents/tester.md');
    expect(paths).toContain('agents/qa.md');
  });
});

// ── Feature 3: 掃描器 2 — Skill References ──────────────────────────────────

describe('Feature 3: 掃描器 2 — Skill References', () => {
  let root;
  let graph;

  beforeAll(() => {
    root = createFixture('f3', {
      write: {
        'skills/testing/SKILL.md': [
          '# Testing Skill',
          '',
          '💡 BDD 語法：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/bdd-spec-guide.md`',
          '💡 測試慣例：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/testing-conventions.md`',
          '💡 方法論：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/bdd-methodology.md`',
          '💡 策略：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/test-strategy.md`',
          '💡 範例：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/examples/bdd-spec-samples.md`',
          '💡 反模式：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/test-anti-patterns.md`',
          '💡 E2E：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/e2e-patterns.md`',
        ].join('\n'),
        'skills/wording/SKILL.md': [
          '# Wording Skill',
          '',
          '| 檔案 | 說明 |',
          '| `${CLAUDE_PLUGIN_ROOT}/skills/wording/references/wording-guide.md` | 措詞指南 |',
        ].join('\n'),
      },
    });
    graph = buildGraph(root);
  });

  it('Scenario 3-1: SKILL.md 中的 reference 路徑正確建立依賴', () => {
    const deps = graph.getDependencies('skills/testing/SKILL.md');
    expect(deps).toContain('skills/testing/references/bdd-spec-guide.md');
  });

  it('Scenario 3-2: ${CLAUDE_PLUGIN_ROOT} 變數替換 — 依賴路徑為相對路徑', () => {
    const deps = graph.getDependencies('skills/testing/SKILL.md');
    for (const dep of deps) {
      expect(dep).not.toContain('${CLAUDE_PLUGIN_ROOT}');
    }
  });

  it('Scenario 3-3: 表格格式的 reference 路徑也能掃描（wording SKILL.md）', () => {
    const deps = graph.getDependencies('skills/wording/SKILL.md');
    expect(deps).toContain('skills/wording/references/wording-guide.md');
  });

  it('Scenario 3-4: Reference 路徑指向不存在的檔案時仍建立依賴記錄', () => {
    const root2 = createFixture('f3s4', {
      write: {
        'skills/testing/SKILL.md': [
          '# Testing',
          '💡 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/nonexistent.md`',
        ].join('\n'),
      },
    });
    const g2 = buildGraph(root2);
    const deps = g2.getDependencies('skills/testing/SKILL.md');
    expect(deps).toContain('skills/testing/references/nonexistent.md');
  });

  it('Scenario 3-5: testing SKILL.md 的 dependencies 包含 7 條路徑', () => {
    const deps = graph.getDependencies('skills/testing/SKILL.md');
    expect(deps.length).toBe(7);
  });
});

// ── Feature 4: 掃描器 3 — Registry Stages ───────────────────────────────────

describe('Feature 4: 掃描器 3 — Registry Stages', () => {
  it('Scenario 4-1: registry-data.json stage-agent 映射建立依賴', () => {
    const root = createFixture('f4s1', {
      write: {
        'scripts/lib/registry-data.json': JSON.stringify({
          stages: {
            DEV: { label: '開發', agent: 'developer' },
          },
        }),
      },
    });
    const graph = buildGraph(root);
    const deps = graph.getDependencies('scripts/lib/registry-data.json');
    expect(deps).toContain('agents/developer.md');
  });

  it('Scenario 4-2: 多個 stage 映射到同一個 agent — 只建立一條依賴', () => {
    const root = createFixture('f4s2', {
      write: {
        'scripts/lib/registry-data.json': JSON.stringify({
          stages: {
            DEV: { label: '開發', agent: 'developer' },
            'DEV:2': { label: '開發2', agent: 'developer' },
          },
        }),
      },
    });
    const graph = buildGraph(root);
    const deps = graph.getDependencies('scripts/lib/registry-data.json');
    const devDeps = deps.filter((d) => d === 'agents/developer.md');
    expect(devDeps.length).toBe(1);
  });

  it('Scenario 4-3: registry-data.json 不存在時靜默跳過', () => {
    const root = createFixture('f4s3');
    // 不寫入 registry-data.json
    const graph = buildGraph(root);
    const deps = graph.getDependencies('scripts/lib/registry-data.json');
    expect(deps).toEqual([]);
  });

  it('Scenario 4-4: registry-data.json 格式損壞時靜默跳過', () => {
    const root = createFixture('f4s4', {
      write: {
        'scripts/lib/registry-data.json': '{invalid json',
        'agents/developer.md': '---\nname: developer\nskills:\n  - craft\n---\n',
      },
    });
    // 不應拋出
    const graph = buildGraph(root);
    // Agent skills 掃描器應仍正常工作
    const deps = graph.getDependencies('agents/developer.md');
    expect(deps).toContain('skills/craft/SKILL.md');
  });
});

// ── Feature 5: 掃描器 4 — Hook Requires ─────────────────────────────────────

describe('Feature 5: 掃描器 4 — Hook Requires', () => {
  let root;
  let graph;

  beforeAll(() => {
    root = createFixture('f5', {
      write: {
        // on-stop.js 使用 ../../../scripts/lib/... 格式（相對於 hooks/scripts/session/）
        'hooks/scripts/session/on-stop.js': [
          "const state = require('../../../scripts/lib/state');",
          "const registry = require('../../../scripts/lib/registry');",
          "const gm = require('gray-matter');", // npm 套件，不追蹤
          "const path = require('path');", // 內建模組，不追蹤
          "module.exports = {};",
        ].join('\n'),
        // 子目錄 handler
        'hooks/scripts/agent/on-stop.js': [
          "const hookUtils = require('../../../scripts/lib/hook-utils');",
          "module.exports = {};",
        ].join('\n'),
        // 雙引號 require
        'hooks/scripts/session/pre-compact.js': [
          'const state = require("../../../scripts/lib/state");',
          "module.exports = {};",
        ].join('\n'),
      },
    });
    graph = buildGraph(root);
  });

  it('Scenario 5-1: 相對路徑 require 建立依賴（state + registry）', () => {
    const deps = graph.getDependencies('hooks/scripts/session/on-stop.js');
    expect(deps).toContain('scripts/lib/state.js');
    expect(deps).toContain('scripts/lib/registry.js');
  });

  it('Scenario 5-2: require 無 .js 副檔名時自動補全', () => {
    const deps = graph.getDependencies('hooks/scripts/session/on-stop.js');
    // 確認帶 .js 而非無副檔名
    expect(deps.some((d) => d.endsWith('.js'))).toBe(true);
    expect(deps).toContain('scripts/lib/state.js');
  });

  it('Scenario 5-3: npm 套件 require 不建立依賴', () => {
    const deps = graph.getDependencies('hooks/scripts/session/on-stop.js');
    expect(deps).not.toContain('gray-matter');
    expect(deps).not.toContain('path');
  });

  it('Scenario 5-5: 子目錄中的 .js 檔案也被遞迴掃描', () => {
    const deps = graph.getDependencies('hooks/scripts/agent/on-stop.js');
    expect(deps).toContain('scripts/lib/hook-utils.js');
  });

  it('Scenario 10-1: require 使用雙引號也能掃描', () => {
    const deps = graph.getDependencies('hooks/scripts/session/pre-compact.js');
    expect(deps).toContain('scripts/lib/state.js');
  });

  it('Scenario 5-4: require 路徑解析後在 pluginRoot 外時排除', () => {
    const root2 = createFixture('f5s4', {
      write: {
        'hooks/scripts/session/escape.js': [
          "const x = require('../../../../outside/module');",
          "module.exports = {};",
        ].join('\n'),
      },
    });
    const g2 = buildGraph(root2);
    const deps = g2.getDependencies('hooks/scripts/session/escape.js');
    expect(deps.some((d) => d.startsWith('..'))).toBe(false);
  });
});

// ── Feature 6: getImpacted — 雙向影響查詢 ───────────────────────────────────

describe('Feature 6: getImpacted — 雙向影響查詢', () => {
  let root;
  let graph;

  beforeAll(() => {
    root = createFixture('f6', {
      write: {
        'skills/testing/SKILL.md': [
          '# Testing',
          '💡 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/testing-conventions.md`',
          '💡 讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/bdd-spec-guide.md`',
        ].join('\n'),
        'agents/tester.md': [
          '---', 'name: tester', 'skills:', '  - testing', '---',
        ].join('\n'),
        'agents/qa.md': [
          '---', 'name: qa', 'skills:', '  - testing', '---',
        ].join('\n'),
      },
    });
    graph = buildGraph(root);
  });

  it('Scenario 6-1: PM 驗收 — 修改 testing-conventions.md 影響 SKILL.md + tester + qa', () => {
    const result = graph.getImpacted('skills/testing/references/testing-conventions.md');
    expect(result.path).toBe('skills/testing/references/testing-conventions.md');

    const paths = result.impacted.map((i) => i.path);
    expect(paths).toContain('skills/testing/SKILL.md');
    expect(paths).toContain('agents/tester.md');
    expect(paths).toContain('agents/qa.md');
  });

  it('Scenario 6-2: 查詢不在圖中的路徑回傳空陣列', () => {
    const result = graph.getImpacted('skills/nonexistent/SKILL.md');
    expect(result.path).toBe('skills/nonexistent/SKILL.md');
    expect(result.impacted).toEqual([]);
  });

  it('Scenario 6-3: 輸入絕對路徑時自動轉換為相對路徑', () => {
    const absPath = join(root, 'skills/testing/references/testing-conventions.md');
    const resultAbs = graph.getImpacted(absPath);
    const resultRel = graph.getImpacted('skills/testing/references/testing-conventions.md');
    expect(resultAbs.impacted.map((i) => i.path)).toEqual(
      resultRel.impacted.map((i) => i.path),
    );
  });

  it('Scenario 6-4: ImpactedItem 包含正確的 type 欄位', () => {
    const result = graph.getImpacted('skills/testing/references/bdd-spec-guide.md');
    const skillItem = result.impacted.find((i) => i.path === 'skills/testing/SKILL.md');
    expect(skillItem).toBeDefined();
    expect(skillItem.type).toBe('skill');

    const testerItem = result.impacted.find((i) => i.path === 'agents/tester.md');
    expect(testerItem).toBeDefined();
    expect(testerItem.type).toBe('agent');
  });

  it('Scenario 6-5: ImpactedItem 包含非空的 reason 欄位', () => {
    const result = graph.getImpacted('skills/testing/references/testing-conventions.md');
    for (const item of result.impacted) {
      expect(typeof item.reason).toBe('string');
      expect(item.reason.length).toBeGreaterThan(0);
    }
  });
});

// ── Feature 7: getDependencies — 正向依賴查詢 ───────────────────────────────

describe('Feature 7: getDependencies — 正向依賴查詢', () => {
  let root;
  let graph;

  beforeAll(() => {
    root = createFixture('f7', {
      write: {
        'agents/developer.md': [
          '---',
          'name: developer',
          'skills:',
          '  - craft',
          '  - commit-convention',
          '  - code-review',
          '---',
          '# Developer',
        ].join('\n'),
        'hooks/scripts/session/on-stop.js': [
          "const state = require('../../../scripts/lib/state');",
          "const registry = require('../../../scripts/lib/registry');",
          "module.exports = {};",
        ].join('\n'),
      },
    });
    graph = buildGraph(root);
  });

  it('Scenario 7-1: PM 驗收 — developer.md 的依賴包含三個 SKILL.md', () => {
    const deps = graph.getDependencies('agents/developer.md');
    expect(deps).toContain('skills/craft/SKILL.md');
    expect(deps).toContain('skills/commit-convention/SKILL.md');
    expect(deps).toContain('skills/code-review/SKILL.md');
  });

  it('Scenario 7-2: 查詢不在圖中的路徑回傳空陣列', () => {
    const deps = graph.getDependencies('agents/nonexistent.md');
    expect(deps).toEqual([]);
  });

  it('Scenario 7-3: 輸入絕對路徑時自動轉換', () => {
    const absPath = join(root, 'agents/developer.md');
    const depsAbs = graph.getDependencies(absPath);
    const depsRel = graph.getDependencies('agents/developer.md');
    expect(depsAbs).toEqual(depsRel);
  });

  it('Scenario 7-4: hook script 依賴查詢回傳 lib modules', () => {
    const deps = graph.getDependencies('hooks/scripts/session/on-stop.js');
    expect(deps).toContain('scripts/lib/state.js');
    expect(deps).toContain('scripts/lib/registry.js');
  });
});

// ── Feature 8: getRawGraph — 原始圖資料 ─────────────────────────────────────

describe('Feature 8: getRawGraph — 原始圖資料', () => {
  let root;
  let graph;

  beforeAll(() => {
    root = createFixture('f8', {
      write: {
        'agents/tester.md': [
          '---', 'name: tester', 'skills:', '  - testing', '---',
        ].join('\n'),
      },
    });
    graph = buildGraph(root);
  });

  it('Scenario 8-1: getRawGraph 回傳可序列化的 plain object', () => {
    const raw = graph.getRawGraph();
    expect(typeof raw).toBe('object');
    expect(raw).not.toBeNull();
    expect(Array.isArray(raw.dependencies['agents/tester.md'])).toBe(true);
    // JSON.stringify 不應拋出
    expect(() => JSON.stringify(raw)).not.toThrow();
  });

  it('Scenario 8-2: getRawGraph 正向與反向索引一致', () => {
    const raw = graph.getRawGraph();
    // tester.md → skills/testing/SKILL.md
    expect(raw.dependencies['agents/tester.md']).toContain('skills/testing/SKILL.md');
    expect(raw.dependents['skills/testing/SKILL.md']).toContain('agents/tester.md');
  });
});

// ── Feature 10: 額外邊界條件 ────────────────────────────────────────────────

describe('Feature 10: 邊界條件與錯誤處理', () => {
  it('Scenario 10-2: SKILL.md 中同一行多個 reference 路徑均被掃描', () => {
    const root = createFixture('f10s2', {
      write: {
        'skills/testing/SKILL.md': [
          '# Testing',
          '同一行：`${CLAUDE_PLUGIN_ROOT}/skills/testing/references/a.md` 和 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/b.md`',
        ].join('\n'),
      },
    });
    const graph = buildGraph(root);
    const deps = graph.getDependencies('skills/testing/SKILL.md');
    expect(deps).toContain('skills/testing/references/a.md');
    expect(deps).toContain('skills/testing/references/b.md');
  });

  it('Scenario 10-3: Agent skills 欄位包含不存在的 skill — 仍建立依賴記錄', () => {
    const root = createFixture('f10s3', {
      write: {
        'agents/foo.md': [
          '---', 'name: foo', 'skills:', '  - nonexistent-skill', '---',
        ].join('\n'),
      },
    });
    const graph = buildGraph(root);
    const deps = graph.getDependencies('agents/foo.md');
    expect(deps).toContain('skills/nonexistent-skill/SKILL.md');
  });

  it('Scenario 10-4: 路徑存在於圖中但無元件依賴時 impacted 為空陣列而非 null', () => {
    const root = createFixture('f10s4', {
      write: {
        'agents/isolated.md': [
          '---', 'name: isolated', 'skills:', '  - orphan-skill', '---',
        ].join('\n'),
      },
    });
    const graph = buildGraph(root);
    // agents/isolated.md 有依賴但沒有元件依賴它
    const result = graph.getImpacted('agents/isolated.md');
    expect(Array.isArray(result.impacted)).toBe(true);
    expect(result.impacted).not.toBeNull();
    expect(result.impacted).not.toBeUndefined();
  });

  it('Scenario 10-5: getDependencies 回傳值不含重複路徑', () => {
    const root = createFixture('f10s5', {
      write: {
        'hooks/scripts/session/dup.js': [
          "const state = require('../../../scripts/lib/state');",
          "// 再次 require 同一個模組",
          "const state2 = require('../../../scripts/lib/state');",
          "module.exports = {};",
        ].join('\n'),
      },
    });
    const graph = buildGraph(root);
    const deps = graph.getDependencies('hooks/scripts/session/dup.js');
    const unique = new Set(deps);
    expect(deps.length).toBe(unique.size);
  });
});

// ── inferType 單元測試 ───────────────────────────────────────────────────────

describe('inferType — ComponentType 推斷', () => {
  it('agents/ 路徑 → agent', () => {
    expect(inferType('agents/developer.md')).toBe('agent');
  });

  it('skills/X/SKILL.md → skill', () => {
    expect(inferType('skills/testing/SKILL.md')).toBe('skill');
  });

  it('skills/X/references/... → skill-reference', () => {
    expect(inferType('skills/testing/references/bdd-spec-guide.md')).toBe('skill-reference');
  });

  it('hooks/scripts/... → hook-script', () => {
    expect(inferType('hooks/scripts/session/on-stop.js')).toBe('hook-script');
  });

  it('scripts/lib/... → lib-module', () => {
    expect(inferType('scripts/lib/state.js')).toBe('lib-module');
  });

  it('scripts/lib/registry-data.json → registry', () => {
    expect(inferType('scripts/lib/registry-data.json')).toBe('registry');
  });

  it('未知路徑 → unknown', () => {
    expect(inferType('something/else.txt')).toBe('unknown');
  });
});
