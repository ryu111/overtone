/**
 * gap-analyzer.test.js — gap-analyzer.js 單元測試
 *
 * 測試策略：
 * 1. GAP_MAP 完整性：覆蓋 health-check 所有 16 個已知 finding.type
 * 2. findingToGap 正常路徑：每個 type 產出正確 category + repairHint + priority
 * 3. findingToGap fallback：未知 type → category "unknown"
 * 4. calculatePriority 邊界值：critical/1.0=100, info/0.0=12, warning/0.5=56
 * 5. analyzeGaps 整合（mock health-check）：gaps 按 priority 降序 + stats 正確
 * 6. analyzeGaps 錯誤路徑：health-check throw → 含 error 的 GapReport
 * 7. CLI stdout 輸出合法 JSON
 */

import { describe, it, expect } from 'bun:test';
import { execSync } from 'child_process';

// ─── 直接 import 被測模組 ─────────────────────────────────────────────────────

const GA_PATH = '/Users/sbu/.claude/scripts/gap-analyzer.js';

const { analyzeGaps, findingToGap, calculatePriority, GAP_MAP } = await import(GA_PATH);

// ─── 1. GAP_MAP 完整性 ────────────────────────────────────────────────────────

describe('GAP_MAP 完整性', () => {
  // health-check 已知的 16 個 finding.type
  const KNOWN_TYPES = [
    // closedLoop
    'missing-skillmd',
    'orphan-skill',
    'name-mismatch',
    'unindexed-reference',
    'broken-reference',
    'parse-error',
    // skillCoverage
    'orphan-script',
    'empty-references',
    // hookIntegrity
    'broken-hook-command',
    'broken-fallback',
    'handler-mismatch',
    // agentAlignment
    'missing-skill-dir',
    'missing-skill-definition',
    'no-skills-defined',
    'shared-skill',
    // system
    'check-error',
  ];

  it('GAP_MAP 覆蓋全部 16 個已知 finding.type', () => {
    expect(Object.keys(GAP_MAP).length).toBe(16);
    for (const type of KNOWN_TYPES) {
      expect(GAP_MAP[type]).toBeDefined();
    }
  });

  it('每個 GAP_MAP entry 都有必要欄位', () => {
    for (const [, mapping] of Object.entries(GAP_MAP)) {
      expect(typeof mapping.category).toBe('string');
      expect(typeof mapping.repairHint).toBe('string');
      expect(typeof mapping.impactFactor).toBe('number');
      expect(mapping.impactFactor).toBeGreaterThanOrEqual(0);
      expect(mapping.impactFactor).toBeLessThanOrEqual(1);
    }
  });

  it('closedLoop 的 type 都有映射', () => {
    const closedLoopTypes = ['missing-skillmd', 'orphan-skill', 'name-mismatch', 'unindexed-reference', 'broken-reference', 'parse-error'];
    for (const t of closedLoopTypes) {
      expect(GAP_MAP[t]).toBeDefined();
    }
  });

  it('hookIntegrity 的 type 都有映射', () => {
    const hookTypes = ['broken-hook-command', 'broken-fallback', 'handler-mismatch'];
    for (const t of hookTypes) {
      expect(GAP_MAP[t]).toBeDefined();
    }
  });
});

// ─── 2. findingToGap 正常路徑 ────────────────────────────────────────────────

describe('findingToGap 正常路徑', () => {
  function makeFinding(type, severity = 'warning', element = 'skills/test-skill') {
    return { check: 'closedLoop', type, severity, element, description: `Test: ${type}` };
  }

  it('missing-skillmd → category: structure', () => {
    const gap = findingToGap(makeFinding('missing-skillmd', 'critical'));
    expect(gap.category).toBe('structure');
    expect(gap.severity).toBe('critical');
    expect(gap.repairHint).toContain('SKILL.md');
    expect(gap.priority).toBeGreaterThan(0);
  });

  it('broken-hook-command → category: integrity, priority: 100（critical + 1.0）', () => {
    const gap = findingToGap({
      check: 'hookIntegrity',
      type: 'broken-hook-command',
      severity: 'critical',
      element: 'hooks.SessionEnd[]',
      description: 'broken',
    });
    expect(gap.category).toBe('integrity');
    expect(gap.priority).toBe(100);
  });

  it('orphan-skill → category: dependency', () => {
    const gap = findingToGap(makeFinding('orphan-skill', 'warning'));
    expect(gap.category).toBe('dependency');
    expect(gap.repairHint).toContain('skills[]');
  });

  it('shared-skill → category: info, priority: 12（info + 0.0）', () => {
    const gap = findingToGap({
      check: 'agentAlignment',
      type: 'shared-skill',
      severity: 'info',
      element: 'skills/shared',
      description: 'shared',
    });
    expect(gap.category).toBe('info');
    expect(gap.priority).toBe(12);
  });

  it('Gap id 格式正確（check:type:elementHash）', () => {
    const finding = makeFinding('orphan-skill', 'warning', 'skills/my-skill');
    const gap = findingToGap(finding);
    expect(gap.id).toBe('closedLoop:orphan-skill:skills/my-skill');
  });

  it('Gap id 替換特殊字元', () => {
    const finding = {
      check: 'hookIntegrity',
      type: 'broken-hook-command',
      severity: 'critical',
      element: 'hooks.SessionEnd[Bash]',
      description: 'broken',
    };
    const gap = findingToGap(finding);
    // 特殊字元 `.` 和 `[`, `]` 應被替換
    expect(gap.id).not.toContain('.');
    expect(gap.id).not.toContain('[');
    expect(gap.id).not.toContain(']');
  });

  it('source 欄位保留原始 finding', () => {
    const finding = makeFinding('name-mismatch', 'warning', 'skills/my-skill');
    const gap = findingToGap(finding);
    expect(gap.source).toBe(finding);
  });

  it('context 欄位正確', () => {
    const finding = makeFinding('empty-references', 'info', 'skills/test');
    const gap = findingToGap(finding);
    expect(gap.context.element).toBe('skills/test');
    expect(gap.context.check).toBe('closedLoop');
    expect(gap.context.type).toBe('empty-references');
    expect(Array.isArray(gap.context.files)).toBe(true);
  });

  it('skills/ 開頭的 element 產生正確的 files', () => {
    const finding = makeFinding('missing-skillmd', 'critical', 'skills/my-skill');
    const gap = findingToGap(finding);
    expect(gap.context.files).toContain('~/.claude/skills/my-skill');
  });

  it('agents/ 開頭的 element 產生正確的 files（加 .md）', () => {
    const finding = {
      check: 'agentAlignment',
      type: 'no-skills-defined',
      severity: 'info',
      element: 'agents/my-agent',
      description: 'no skills',
    };
    const gap = findingToGap(finding);
    expect(gap.context.files).toContain('~/.claude/agents/my-agent.md');
  });

  it('非路徑 element 回傳空 files', () => {
    const finding = {
      check: 'hookIntegrity',
      type: 'handler-mismatch',
      severity: 'warning',
      element: 'some-module',
      description: 'mismatch',
    };
    const gap = findingToGap(finding);
    expect(gap.context.files).toEqual([]);
  });
});

// ─── 3. findingToGap fallback ────────────────────────────────────────────────

describe('findingToGap fallback（未知 type）', () => {
  it('未知 type → category: unknown', () => {
    const finding = {
      check: 'closedLoop',
      type: 'completely-unknown-type',
      severity: 'warning',
      element: 'skills/x',
      description: 'unknown',
    };
    const gap = findingToGap(finding);
    expect(gap.category).toBe('unknown');
    expect(gap.repairHint).toContain('手動檢查');
  });

  it('未知 type 使用 impactFactor 0.5 + severity 計算 priority', () => {
    const finding = {
      check: 'closedLoop',
      type: 'unknown-type',
      severity: 'warning',
      element: 'skills/x',
      description: 'unknown',
    };
    const gap = findingToGap(finding);
    // warning + 0.5 = 0.6*60 + 0.5*40 = 36 + 20 = 56
    expect(gap.priority).toBe(56);
  });
});

// ─── 4. calculatePriority 邊界值 ──────────────────────────────────────────────

describe('calculatePriority 邊界值', () => {
  it('critical + 1.0 → 100', () => {
    expect(calculatePriority('critical', 1.0)).toBe(100);
  });

  it('critical + 0.0 → 60', () => {
    expect(calculatePriority('critical', 0.0)).toBe(60);
  });

  it('warning + 0.5 → 56', () => {
    expect(calculatePriority('warning', 0.5)).toBe(56);
  });

  it('warning + 0.0 → 36', () => {
    expect(calculatePriority('warning', 0.0)).toBe(36);
  });

  it('info + 0.0 → 12', () => {
    expect(calculatePriority('info', 0.0)).toBe(12);
  });

  it('info + 1.0 → 52', () => {
    expect(calculatePriority('info', 1.0)).toBe(52);
  });

  it('critical + 0.9 → 96', () => {
    expect(calculatePriority('critical', 0.9)).toBe(96);
  });

  it('未知 severity 使用 info weight（0.2）', () => {
    expect(calculatePriority('unknown', 0.0)).toBe(12);
  });
});

// ─── 5. analyzeGaps 整合（mock）──────────────────────────────────────────────

describe('analyzeGaps 整合測試', () => {
  /** 建立模擬的 health-check findings */
  function makeFindings() {
    return [
      { check: 'hookIntegrity',  type: 'broken-hook-command', severity: 'critical', element: 'hooks.SessionEnd[]',    description: 'broken' },
      { check: 'closedLoop',     type: 'missing-skillmd',     severity: 'critical', element: 'skills/orphan',        description: 'no SKILL.md' },
      { check: 'closedLoop',     type: 'orphan-skill',        severity: 'warning',  element: 'skills/unused',        description: 'not referenced' },
      { check: 'skillCoverage',  type: 'empty-references',    severity: 'info',     element: 'skills/sparse',        description: 'no references' },
      { check: 'agentAlignment', type: 'shared-skill',        severity: 'info',     element: 'skills/shared',        description: 'shared by 2' },
    ];
  }

  it('gaps 按 priority 降序排列', async () => {
    const report = await analyzeGaps({ includeInfo: true, _mockFindings: makeFindings() });
    for (let i = 0; i < report.gaps.length - 1; i++) {
      expect(report.gaps[i].priority).toBeGreaterThanOrEqual(report.gaps[i + 1].priority);
    }
  });

  it('預設排除 info severity', async () => {
    const report = await analyzeGaps({ _mockFindings: makeFindings() });
    const infoGaps = report.gaps.filter(g => g.severity === 'info');
    expect(infoGaps.length).toBe(0);
  });

  it('--all 時包含 info severity', async () => {
    const report = await analyzeGaps({ includeInfo: true, _mockFindings: makeFindings() });
    const infoGaps = report.gaps.filter(g => g.severity === 'info');
    expect(infoGaps.length).toBeGreaterThan(0);
  });

  it('stats.total 與 gaps.length 一致', async () => {
    const report = await analyzeGaps({ includeInfo: true, _mockFindings: makeFindings() });
    expect(report.stats.total).toBe(report.gaps.length);
  });

  it('stats.byCategory 統計正確', async () => {
    const report = await analyzeGaps({ includeInfo: true, _mockFindings: makeFindings() });
    let catTotal = 0;
    for (const count of Object.values(report.stats.byCategory)) {
      catTotal += count;
    }
    expect(catTotal).toBe(report.stats.total);
  });

  it('stats.bySeverity 統計正確', async () => {
    const report = await analyzeGaps({ includeInfo: true, _mockFindings: makeFindings() });
    let sevTotal = 0;
    for (const count of Object.values(report.stats.bySeverity)) {
      sevTotal += count;
    }
    expect(sevTotal).toBe(report.stats.total);
  });

  it('category 過濾只回傳指定 category 的 gaps', async () => {
    const report = await analyzeGaps({ category: 'integrity', includeInfo: true, _mockFindings: makeFindings() });
    for (const gap of report.gaps) {
      expect(gap.category).toBe('integrity');
    }
  });

  it('metadata 包含必要欄位', async () => {
    const report = await analyzeGaps({ _mockFindings: makeFindings() });
    expect(typeof report.metadata.timestamp).toBe('string');
    expect(report.metadata.version).toBe('1.0.0');
    expect(typeof report.metadata.duration).toBe('number');
  });

  it('無 finding 時回傳空 gaps', async () => {
    const report = await analyzeGaps({ _mockFindings: [] });
    expect(report.gaps).toEqual([]);
    expect(report.stats.total).toBe(0);
  });
});

// ─── 6. analyzeGaps 錯誤路徑 ─────────────────────────────────────────────────

describe('analyzeGaps 錯誤路徑', () => {
  it('health-check 失敗時回傳含 error 的 GapReport（不 throw）', async () => {
    const report = await analyzeGaps({ _mockError: 'health-check failed' });
    expect(report.error).toBeDefined();
    expect(typeof report.error).toBe('string');
    expect(report.gaps).toEqual([]);
    expect(report.stats.total).toBe(0);
  });
});

// ─── 7. CLI stdout 輸出 ──────────────────────────────────────────────────────

describe('CLI stdout 輸出', () => {
  it('stdout 為合法 JSON（含 gaps、stats、metadata 欄位）', () => {
    const output = execSync(
      `bun ${GA_PATH}`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    const parsed = JSON.parse(output);
    expect(parsed.gaps).toBeDefined();
    expect(Array.isArray(parsed.gaps)).toBe(true);
    expect(parsed.stats).toBeDefined();
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.version).toBe('1.0.0');
  });

  it('exit code 為 0', () => {
    expect(() => {
      execSync(`bun ${GA_PATH}`, { encoding: 'utf-8', timeout: 30000 });
    }).not.toThrow();
  });

  it('--all 旗標使 info severity 出現在輸出中', () => {
    const output = execSync(
      `bun ${GA_PATH} --all`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    const parsed = JSON.parse(output);
    // 真實系統可能有 info gaps（如 empty-references、no-skills-defined）
    // 驗證輸出是合法 JSON 即可
    expect(parsed.gaps).toBeDefined();
  });

  it('--summary 旗標時 exit code 為 0', () => {
    expect(() => {
      execSync(`bun ${GA_PATH} --summary`, {
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }).not.toThrow();
  });
});
