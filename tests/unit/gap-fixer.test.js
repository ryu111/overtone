/**
 * gap-fixer.test.js — gap-fixer.js 單元測試
 *
 * 測試策略：
 * 1. REPAIR_STRATEGIES 完整性：覆蓋 16 個 gap type + fallback
 * 2. auto 修復：missing-skillmd / missing-skill-dir / name-mismatch / empty-references / no-skills-defined
 * 3. guided 修復：orphan-skill / broken-reference / parse-error 等
 * 4. fixGaps 整合：dry-run / category 過濾 / 錯誤處理
 * 5. 工具函式：resolveSkillDir / resolveAgentPath
 */

import { describe, it, expect } from 'bun:test';

const GF_PATH = '/Users/sbu/.claude/scripts/gap-fixer.js';
const { fixGaps, REPAIR_STRATEGIES, resolveSkillDir, resolveAgentPath } = await import(GF_PATH);

// ─── 測試用 mock deps ────────────────────────────────────────────────────────

function createMockDeps(files = {}) {
  const written = {};
  const dirs = {};
  return {
    claudeDir: '/tmp/test-claude',
    existsSync(p) { return !!files[p]; },
    readFileSync(p) {
      if (!files[p]) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
    writeFileSync(p, content) { written[p] = content; files[p] = content; },
    mkdirSync(p, opts) { dirs[p] = opts; },
    _written: written,
    _dirs: dirs,
  };
}

function makeGap(type, element = 'skills/test-skill', severity = 'warning', extra = {}) {
  return {
    id: `check:${type}:${element.replace(/[^a-zA-Z0-9\-_\/]/g, '_')}`,
    category: 'structure',
    severity,
    priority: 60,
    repairHint: `修復 ${type}`,
    source: { check: 'closedLoop', type, severity, element, description: `${type} 問題`, ...extra.source },
    context: { element, check: 'closedLoop', type, files: [], ...extra.context },
  };
}

// ─── 1. REPAIR_STRATEGIES 完整性 ────────────────────────────────────────────

describe('REPAIR_STRATEGIES 完整性', () => {
  const ALL_TYPES = [
    'missing-skillmd', 'missing-skill-dir', 'missing-skill-definition',
    'name-mismatch', 'empty-references', 'no-skills-defined', 'unindexed-reference',
    'orphan-skill', 'orphan-script', 'broken-reference', 'parse-error',
    'broken-hook-command', 'broken-fallback', 'handler-mismatch',
    'shared-skill', 'check-error',
  ];

  it('覆蓋全部 16 個 gap type', () => {
    for (const type of ALL_TYPES) {
      expect(REPAIR_STRATEGIES[type]).toBeDefined();
    }
  });

  it('每個策略都有 mode 和 fix', () => {
    for (const [, strategy] of Object.entries(REPAIR_STRATEGIES)) {
      expect(['auto', 'guided']).toContain(strategy.mode);
      expect(typeof strategy.fix).toBe('function');
    }
  });

  it('auto 策略有 7 個', () => {
    const autoCount = Object.values(REPAIR_STRATEGIES).filter(s => s.mode === 'auto').length;
    expect(autoCount).toBe(7);
  });

  it('guided 策略有 9 個', () => {
    const guidedCount = Object.values(REPAIR_STRATEGIES).filter(s => s.mode === 'guided').length;
    expect(guidedCount).toBe(9);
  });
});

// ─── 2. auto 修復策略 ───────────────────────────────────────────────────────

describe('auto 修復 — missing-skillmd', () => {
  it('建立 SKILL.md 骨架', () => {
    const deps = createMockDeps();
    const gap = makeGap('missing-skillmd', 'skills/my-skill');
    const result = REPAIR_STRATEGIES['missing-skillmd'].fix(gap, deps);

    expect(result.status).toBe('fixed');
    expect(result.filesChanged).toContain('/tmp/test-claude/skills/my-skill/SKILL.md');

    const content = deps._written['/tmp/test-claude/skills/my-skill/SKILL.md'];
    expect(content).toContain('name: my-skill');
    expect(content).toContain('---');
    expect(content).toContain('# my-skill');
  });

  it('已存在時跳過', () => {
    const deps = createMockDeps({
      '/tmp/test-claude/skills/existing/SKILL.md': '---\nname: existing\n---\n',
    });
    const gap = makeGap('missing-skillmd', 'skills/existing');
    const result = REPAIR_STRATEGIES['missing-skillmd'].fix(gap, deps);
    expect(result.status).toBe('skipped');
  });
});

describe('auto 修復 — missing-skill-dir', () => {
  it('建立目錄和 references/', () => {
    const deps = createMockDeps();
    const gap = makeGap('missing-skill-dir', 'skills/new-skill');
    const result = REPAIR_STRATEGIES['missing-skill-dir'].fix(gap, deps);

    expect(result.status).toBe('fixed');
    expect(deps._dirs).toHaveProperty('/tmp/test-claude/skills/new-skill/references');
  });

  it('目錄已存在時跳過', () => {
    const deps = createMockDeps({ '/tmp/test-claude/skills/exists': true });
    const gap = makeGap('missing-skill-dir', 'skills/exists');
    const result = REPAIR_STRATEGIES['missing-skill-dir'].fix(gap, deps);
    expect(result.status).toBe('skipped');
  });
});

describe('auto 修復 — name-mismatch', () => {
  it('修正 frontmatter name', () => {
    const deps = createMockDeps({
      '/tmp/test-claude/skills/correct-name/SKILL.md': '---\nname: wrong-name\ndescription: test\n---\n',
    });
    const gap = makeGap('name-mismatch', 'skills/correct-name');
    const result = REPAIR_STRATEGIES['name-mismatch'].fix(gap, deps);

    expect(result.status).toBe('fixed');
    expect(deps._written['/tmp/test-claude/skills/correct-name/SKILL.md']).toContain('name: correct-name');
  });

  it('name 已一致時跳過', () => {
    const deps = createMockDeps({
      '/tmp/test-claude/skills/my-skill/SKILL.md': '---\nname: my-skill\n---\n',
    });
    const gap = makeGap('name-mismatch', 'skills/my-skill');
    const result = REPAIR_STRATEGIES['name-mismatch'].fix(gap, deps);
    expect(result.status).toBe('skipped');
  });
});

describe('auto 修復 — empty-references', () => {
  it('建立 references/README.md', () => {
    const deps = createMockDeps();
    const gap = makeGap('empty-references', 'skills/bare-skill');
    const result = REPAIR_STRATEGIES['empty-references'].fix(gap, deps);

    expect(result.status).toBe('fixed');
    expect(deps._written['/tmp/test-claude/skills/bare-skill/references/README.md']).toContain('參考資料');
  });
});

describe('auto 修復 — no-skills-defined', () => {
  it('在 agent frontmatter 加入 skills 區塊', () => {
    const deps = createMockDeps({
      '/tmp/test-claude/agents/executor.md': '---\nname: executor\nmodel: sonnet\n---\n# Executor\n',
    });
    const gap = makeGap('no-skills-defined', 'agents/executor');
    const result = REPAIR_STRATEGIES['no-skills-defined'].fix(gap, deps);

    expect(result.status).toBe('fixed');
    const content = deps._written['/tmp/test-claude/agents/executor.md'];
    expect(content).toContain('skills:');
  });

  it('skills 已存在時跳過', () => {
    const deps = createMockDeps({
      '/tmp/test-claude/agents/executor.md': '---\nname: executor\nskills:\n  - foo\n---\n',
    });
    const gap = makeGap('no-skills-defined', 'agents/executor');
    const result = REPAIR_STRATEGIES['no-skills-defined'].fix(gap, deps);
    expect(result.status).toBe('skipped');
  });
});

// ─── 3. guided 修復策略 ─────────────────────────────────────────────────────

describe('guided 修復策略', () => {
  const guidedTypes = [
    'orphan-skill', 'orphan-script', 'broken-reference', 'parse-error',
    'broken-hook-command', 'broken-fallback', 'handler-mismatch',
    'shared-skill', 'check-error',
  ];

  for (const type of guidedTypes) {
    it(`${type} 回傳 guided 狀態`, () => {
      const gap = makeGap(type, `skills/test-${type}`);
      const result = REPAIR_STRATEGIES[type].fix(gap, {});
      expect(result.status).toBe('guided');
      expect(typeof result.description).toBe('string');
      expect(result.description.length).toBeGreaterThan(0);
    });
  }
});

// ─── 4. fixGaps 整合測試 ────────────────────────────────────────────────────

describe('fixGaps 整合', () => {
  it('dry-run 不修改檔案', () => {
    const gaps = [
      makeGap('missing-skillmd', 'skills/new'),
      makeGap('orphan-skill', 'skills/orphan'),
    ];
    const report = fixGaps(gaps, { dryRun: true });

    expect(report.metadata.dryRun).toBe(true);
    expect(report.results).toHaveLength(2);
    expect(report.results[0].description).toContain('[dry-run]');
  });

  it('category 過濾', () => {
    const gaps = [
      { ...makeGap('missing-skillmd', 'skills/a'), category: 'structure' },
      { ...makeGap('orphan-skill', 'skills/b'), category: 'dependency' },
    ];
    const deps = createMockDeps();
    const report = fixGaps(gaps, { category: 'structure', _deps: deps });

    expect(report.results).toHaveLength(1);
    expect(report.results[0].type).toBe('missing-skillmd');
  });

  it('正確統計 fixed / skipped / guided / failed', () => {
    const deps = createMockDeps({
      '/tmp/test-claude/skills/existing/SKILL.md': '---\nname: existing\n---\n',
    });
    const gaps = [
      makeGap('missing-skillmd', 'skills/new'),
      makeGap('missing-skillmd', 'skills/existing'),
      makeGap('orphan-skill', 'skills/orphan'),
    ];
    const report = fixGaps(gaps, { _deps: deps });

    expect(report.stats.fixed).toBe(1);
    expect(report.stats.skipped).toBe(1);
    expect(report.stats.guided).toBe(1);
  });

  it('fix 函式拋錯時 status = failed', () => {
    const deps = createMockDeps();
    deps.mkdirSync = () => { throw new Error('EPERM'); };

    const gaps = [makeGap('missing-skillmd', 'skills/fail')];
    const report = fixGaps(gaps, { _deps: deps });

    expect(report.results[0].status).toBe('failed');
    expect(report.results[0].error).toBe('EPERM');
    expect(report.stats.failed).toBe(1);
  });

  it('未知 gap type 走 fallback', () => {
    const gaps = [makeGap('unknown-type-xyz', 'skills/whatever')];
    const report = fixGaps(gaps, { dryRun: true });

    expect(report.results[0].mode).toBe('guided');
  });

  it('空 gap 列表正常回傳', () => {
    const report = fixGaps([]);
    expect(report.results).toHaveLength(0);
    expect(report.stats.fixed).toBe(0);
  });

  it('metadata 包含必要欄位', () => {
    const report = fixGaps([]);
    expect(report.metadata.timestamp).toBeDefined();
    expect(report.metadata.version).toBe('1.0.0');
    expect(typeof report.metadata.duration).toBe('number');
  });
});

// ─── 5. 工具函式 ─────────────────────────────────────────────────────────────

describe('resolveSkillDir', () => {
  it('skills/ 前綴正確解析', () => {
    expect(resolveSkillDir('skills/my-skill', '/home/.claude')).toBe('/home/.claude/skills/my-skill');
  });

  it('移除 SKILL.md 後綴', () => {
    expect(resolveSkillDir('skills/test/SKILL.md', '/home/.claude')).toBe('/home/.claude/skills/test');
  });

  it('無 skills/ 前綴時自動加入', () => {
    expect(resolveSkillDir('bare-name', '/home/.claude')).toBe('/home/.claude/skills/bare-name');
  });
});

describe('resolveAgentPath', () => {
  it('agents/ 前綴加 .md', () => {
    expect(resolveAgentPath('agents/executor', '/home/.claude')).toBe('/home/.claude/agents/executor.md');
  });

  it('已有 .md 不重複加', () => {
    expect(resolveAgentPath('agents/executor.md', '/home/.claude')).toBe('/home/.claude/agents/executor.md');
  });

  it('無 agents/ 前綴時自動加入', () => {
    expect(resolveAgentPath('planner', '/home/.claude')).toBe('/home/.claude/agents/planner.md');
  });
});
