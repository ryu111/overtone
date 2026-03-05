'use strict';
/**
 * gap-analyzer.test.js — gap-analyzer.js 單元測試
 *
 * 覆蓋：
 *   Feature 1: analyzeGaps 回傳 GapReport 結構
 *   Feature 2: GapType 映射（五種 type）
 *   Feature 3: severity 繼承
 *   Feature 4: 去重邏輯（同 type+file 只保留一筆）
 *   Feature 5: 同 file 不同 type 保留兩筆
 *   Feature 6: summary 統計正確（byType + bySeverity 加總 = total）
 *   Feature 7: checks 過濾（只執行指定 check）
 *   Feature 8: checks 空陣列時不執行任何 check
 *   Feature 9: suggestion 格式驗證（各 type 有對應工具指引）
 *   Feature 10: pluginRoot 不存在時不拋例外且結構完整
 *   Feature 11: 真實 pluginRoot — 全部 check 通過（無缺口）
 */

const { test, expect, describe, afterAll, beforeAll } = require('bun:test');
const path = require('path');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { analyzeGaps } = require(path.join(SCRIPTS_LIB, 'gap-analyzer'));

// ── 常數 ──────────────────────────────────────────────────────────────────

const ALL_GAP_TYPES = ['broken-chain', 'missing-skill', 'missing-consumer', 'no-references', 'sync-mismatch'];
const ALL_SEVERITIES = ['error', 'warning', 'info'];

// 不存在的 pluginRoot — 讓 component-chain check 產生 broken-chain gaps
const FAKE_ROOT = '/tmp/gap-analyzer-test-nonexistent-' + Date.now();

// ══════════════════════════════════════════════════════════════════
// Feature 1: GapReport 結構完整性
// ══════════════════════════════════════════════════════════════════

describe('analyzeGaps — GapReport 結構', () => {
  test('回傳物件含 gaps 陣列和 summary 物件', () => {
    const result = analyzeGaps({ checks: [] });

    expect(typeof result).toBe('object');
    expect(Array.isArray(result.gaps)).toBe(true);
    expect(typeof result.summary).toBe('object');
  });

  test('summary 含 total、byType、bySeverity 欄位', () => {
    const result = analyzeGaps({ checks: [] });
    const { summary } = result;

    expect(typeof summary.total).toBe('number');
    expect(typeof summary.byType).toBe('object');
    expect(typeof summary.bySeverity).toBe('object');
  });

  test('summary.byType 含全部五種 GapType', () => {
    const result = analyzeGaps({ checks: [] });
    const { byType } = result.summary;

    for (const t of ALL_GAP_TYPES) {
      expect(typeof byType[t]).toBe('number');
    }
  });

  test('summary.bySeverity 含 error/warning/info', () => {
    const result = analyzeGaps({ checks: [] });
    const { bySeverity } = result.summary;

    for (const s of ALL_SEVERITIES) {
      expect(typeof bySeverity[s]).toBe('number');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 8: checks 空陣列
// ══════════════════════════════════════════════════════════════════

describe('analyzeGaps — checks 空陣列', () => {
  test('不執行任何 check，gaps 為空陣列', () => {
    const result = analyzeGaps({ checks: [] });

    expect(result.gaps).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  test('checks 空陣列時 byType 全部為 0', () => {
    const result = analyzeGaps({ checks: [] });
    const { byType } = result.summary;

    for (const t of ALL_GAP_TYPES) {
      expect(byType[t]).toBe(0);
    }
  });

  test('checks 空陣列時 bySeverity 全部為 0', () => {
    const result = analyzeGaps({ checks: [] });
    const { bySeverity } = result.summary;

    for (const s of ALL_SEVERITIES) {
      expect(bySeverity[s]).toBe(0);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 10: pluginRoot 不存在時不拋例外
// ══════════════════════════════════════════════════════════════════

describe('analyzeGaps — pluginRoot 不存在', () => {
  test('不拋例外', () => {
    expect(() => {
      analyzeGaps({ pluginRoot: FAKE_ROOT });
    }).not.toThrow();
  });

  test('回傳結構完整（含 summary + gaps）', () => {
    const result = analyzeGaps({ pluginRoot: FAKE_ROOT });

    expect(typeof result).toBe('object');
    expect(Array.isArray(result.gaps)).toBe(true);
    expect(typeof result.summary).toBe('object');
    expect(typeof result.summary.total).toBe('number');
  });

  test('summary.byType 所有欄位存在且為數字', () => {
    const result = analyzeGaps({ pluginRoot: FAKE_ROOT });
    const { byType } = result.summary;

    for (const t of ALL_GAP_TYPES) {
      expect(typeof byType[t]).toBe('number');
    }
  });

  test('summary.bySeverity 所有欄位存在且為數字', () => {
    const result = analyzeGaps({ pluginRoot: FAKE_ROOT });
    const { bySeverity } = result.summary;

    for (const s of ALL_SEVERITIES) {
      expect(typeof bySeverity[s]).toBe('number');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2 & 3: GapType 映射 + severity 繼承（透過真實 check 輸出驗證）
// ══════════════════════════════════════════════════════════════════

describe('analyzeGaps — component-chain 產生 broken-chain gaps', () => {
  // 使用不存在的 pluginRoot，只執行 component-chain check
  // checkComponentChain 會因 agents 不存在而產生 broken-chain findings

  let result;

  beforeAll(() => {
    result = analyzeGaps({
      pluginRoot: FAKE_ROOT,
      checks: ['component-chain'],
    });
  });

  test('執行 component-chain check 後 gaps > 0（agents 不存在）', () => {
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  test('每個 gap 含必要欄位：type/severity/file/message/suggestion/sourceCheck', () => {
    for (const gap of result.gaps) {
      expect(typeof gap.type).toBe('string');
      expect(typeof gap.severity).toBe('string');
      expect(typeof gap.file).toBe('string');
      expect(typeof gap.message).toBe('string');
      expect(typeof gap.suggestion).toBe('string');
      expect(typeof gap.sourceCheck).toBe('string');
    }
  });

  test('sourceCheck 欄位等於 component-chain', () => {
    for (const gap of result.gaps) {
      expect(gap.sourceCheck).toBe('component-chain');
    }
  });

  test('type 只有合法的 GapType 值', () => {
    for (const gap of result.gaps) {
      expect(ALL_GAP_TYPES).toContain(gap.type);
    }
  });

  test('severity 只有合法值（error/warning/info）', () => {
    for (const gap of result.gaps) {
      expect(ALL_SEVERITIES).toContain(gap.severity);
    }
  });

  test('agent 不存在產生 broken-chain type', () => {
    // checkComponentChain 遇到 agent 不存在時，message 含 "agent" → broken-chain
    const broken = result.gaps.filter((g) => g.type === 'broken-chain');
    expect(broken.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: missing-skill 映射（透過臨時 pluginRoot 結構）
// ══════════════════════════════════════════════════════════════════

// registry.js 的 stages 包含 16 個 agent（PM/PLAN/ARCH/DESIGN/DEV/DEBUG/REVIEW/TEST/
// SECURITY/DB-REVIEW/QA/E2E/BUILD-FIX/REFACTOR/RETRO/DOCS）。
// checkComponentChain 先檢查 agent 存在性，找到不存在的 agent 就 continue（跳過 skill 檢查）。
// 所以必須建立全部 agent.md，才能讓 developer.md 的 skill 缺失被偵測到。

const ALL_AGENT_FILES = [
  'product-manager', 'planner', 'architect', 'designer', 'debugger',
  'code-reviewer', 'tester', 'security-reviewer', 'database-reviewer',
  'qa', 'e2e-runner', 'build-error-resolver', 'refactor-cleaner',
  'retrospective', 'doc-updater',
];

describe('analyzeGaps — component-chain 產生 missing-skill gap', () => {
  const TMP_ROOT = '/tmp/gap-analyzer-skill-test-' + Date.now();
  let result;

  beforeAll(() => {
    const agentsDir = path.join(TMP_ROOT, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    // 建立不含 skills 欄位的普通 agent.md（通過存在性檢查但不觸發 skill 偵測）
    const plainAgentMd = '---\nname: placeholder\nmodel: sonnet\n---\n# Placeholder\n';
    for (const agentName of ALL_AGENT_FILES) {
      writeFileSync(path.join(agentsDir, `${agentName}.md`), plainAgentMd);
    }

    // developer.md 引用不存在的 skill（SKILL.md 缺失 → missing-skill）
    const developerMd = '---\nname: developer\nmodel: sonnet\nskills:\n  - nonexistent-skill-xyz\n---\n# Developer\n';
    writeFileSync(path.join(agentsDir, 'developer.md'), developerMd);
    // skills 目錄不建立，讓 checkComponentChain 偵測到 SKILL.md 缺失

    result = analyzeGaps({
      pluginRoot: TMP_ROOT,
      checks: ['component-chain'],
    });
  });

  afterAll(() => {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });

  test('agent 存在但 skill 缺失時，產生 missing-skill gap', () => {
    const missingSkillGaps = result.gaps.filter((g) => g.type === 'missing-skill');
    expect(missingSkillGaps.length).toBeGreaterThan(0);
  });

  test('missing-skill gap 的 message 包含 skill 名稱', () => {
    const missingSkillGap = result.gaps.find((g) => g.type === 'missing-skill');
    expect(missingSkillGap).toBeTruthy();
    expect(missingSkillGap.message).toContain('nonexistent-skill-xyz');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 6: summary 統計正確性
// ══════════════════════════════════════════════════════════════════

describe('analyzeGaps — summary 統計正確', () => {
  test('byType 各值加總等於 total', () => {
    const result = analyzeGaps({ pluginRoot: FAKE_ROOT, checks: ['component-chain'] });
    const { summary } = result;

    const byTypeSum = Object.values(summary.byType).reduce((a, b) => a + b, 0);
    expect(byTypeSum).toBe(summary.total);
  });

  test('bySeverity 各值加總等於 total', () => {
    const result = analyzeGaps({ pluginRoot: FAKE_ROOT, checks: ['component-chain'] });
    const { summary } = result;

    const bySeveritySum = Object.values(summary.bySeverity).reduce((a, b) => a + b, 0);
    expect(bySeveritySum).toBe(summary.total);
  });

  test('gaps.length 等於 summary.total', () => {
    const result = analyzeGaps({ pluginRoot: FAKE_ROOT, checks: ['component-chain'] });
    expect(result.gaps.length).toBe(result.summary.total);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 4 & 5: 去重邏輯
// ══════════════════════════════════════════════════════════════════

describe('analyzeGaps — 去重邏輯', () => {
  // 同一個 check 不會對同一個 type+file 產生兩個 finding，
  // 但傳入重複的 checkName 會讓 check 執行兩次，驗證去重
  test('同 check 傳兩次時不重複（去重）', () => {
    const r1 = analyzeGaps({ pluginRoot: FAKE_ROOT, checks: ['component-chain'] });
    const r2 = analyzeGaps({ pluginRoot: FAKE_ROOT, checks: ['component-chain', 'component-chain'] });

    // 去重後結果相同（先到者勝）
    expect(r2.summary.total).toBe(r1.summary.total);
    expect(r2.gaps.length).toBe(r1.gaps.length);
  });

  test('所有 gap 的 type+file 組合唯一', () => {
    const result = analyzeGaps({ pluginRoot: FAKE_ROOT, checks: ['component-chain'] });
    const seen = new Set();

    for (const gap of result.gaps) {
      const key = `${gap.type}:${gap.file}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 7: checks 過濾
// ══════════════════════════════════════════════════════════════════

describe('analyzeGaps — checks 過濾', () => {
  test('只傳 dependency-sync 時 sourceCheck 全為 dependency-sync', () => {
    const result = analyzeGaps({ checks: ['dependency-sync'] });

    for (const gap of result.gaps) {
      expect(gap.sourceCheck).toBe('dependency-sync');
    }
  });

  test('只傳 component-chain 時 sourceCheck 全為 component-chain', () => {
    const result = analyzeGaps({ pluginRoot: FAKE_ROOT, checks: ['component-chain'] });

    for (const gap of result.gaps) {
      expect(gap.sourceCheck).toBe('component-chain');
    }
  });

  test('invalid check name 靜默跳過，不拋例外', () => {
    expect(() => {
      analyzeGaps({ checks: ['nonexistent-check'] });
    }).not.toThrow();
  });

  test('invalid check name 靜默跳過，gaps 為空', () => {
    const result = analyzeGaps({ checks: ['nonexistent-check'] });
    expect(result.gaps).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 9: suggestion 格式驗證
// ══════════════════════════════════════════════════════════════════

describe('analyzeGaps — suggestion 格式', () => {
  test('broken-chain suggestion 包含 manage-component.js', () => {
    const result = analyzeGaps({ pluginRoot: FAKE_ROOT, checks: ['component-chain'] });
    const brokenGap = result.gaps.find((g) => g.type === 'broken-chain');

    expect(brokenGap).toBeTruthy();
    expect(brokenGap.suggestion).toContain('manage-component.js');
  });

  test('所有 gap 的 suggestion 不為空字串', () => {
    const result = analyzeGaps({ pluginRoot: FAKE_ROOT, checks: ['component-chain'] });

    for (const gap of result.gaps) {
      expect(gap.suggestion.length).toBeGreaterThan(0);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 11: 真實 pluginRoot — 全部 check 通過（無缺口）
// ══════════════════════════════════════════════════════════════════

describe('analyzeGaps — 真實 pluginRoot（全部 check 應通過）', () => {
  test('使用真實 plugin root 時不拋例外', () => {
    expect(() => {
      analyzeGaps();
    }).not.toThrow();
  });

  test('使用真實 plugin root 時 gaps 為 0（系統健康）', () => {
    const result = analyzeGaps();
    expect(result.summary.total).toBe(0);
    expect(result.gaps).toHaveLength(0);
  });

  test('summary 結構在無缺口時仍完整', () => {
    const result = analyzeGaps();

    expect(result.summary.total).toBe(0);
    for (const t of ALL_GAP_TYPES) {
      expect(result.summary.byType[t]).toBe(0);
    }
    for (const s of ALL_SEVERITIES) {
      expect(result.summary.bySeverity[s]).toBe(0);
    }
  });
});
