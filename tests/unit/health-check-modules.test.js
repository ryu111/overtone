// health-check-modules.test.js — health-check-utils/scan/checks 獨立單元測試
import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';

const HOME = homedir();

const {
  safeReadFile, safeReadLines, parseFrontmatter,
  extractReferencePaths, finding,
} = await import(join(HOME, '.claude/scripts/health-check-utils.js'));

const {
  scanSkills, scanAgents, scanHooks, scanModules,
  scanScripts, scanCommands, scanRules,
} = await import(join(HOME, '.claude/scripts/health-check-scan.js'));

const {
  checkClosedLoop, checkSkillCoverage,
  checkHookIntegrity, checkAgentAlignment,
} = await import(join(HOME, '.claude/scripts/health-check-checks.js'));

// ─── Utils 測試 ─────────────────────────────────────────────────────────────

describe('health-check-utils', () => {
  test('safeReadFile 讀取存在的檔案', () => {
    const content = safeReadFile(join(HOME, '.claude/CLAUDE.md'));
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
  });

  test('safeReadFile 不存在的檔案回傳 null', () => {
    expect(safeReadFile('/tmp/nonexistent-file-12345.md')).toBeNull();
  });

  test('safeReadLines 限制行數', () => {
    const lines = safeReadLines(join(HOME, '.claude/CLAUDE.md'), 5);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  test('parseFrontmatter 正確解析 YAML frontmatter', () => {
    const lines = ['---', 'name: test-skill', 'description: A test', '---', '# Content'];
    const result = parseFrontmatter(lines);
    expect(result.name).toBe('test-skill');
    expect(result.description).toBe('A test');
  });

  test('parseFrontmatter 無 frontmatter 回傳空物件', () => {
    const lines = ['# No frontmatter', 'Just content'];
    const result = parseFrontmatter(lines);
    expect(result).toEqual({});
  });

  test('parseFrontmatter 解析不完整回傳空物件或 _parseError', () => {
    // 無 closing --- 回傳空物件
    const lines = ['---', 'key: value'];
    const result = parseFrontmatter(lines);
    expect(Object.keys(result).length === 0 || result._parseError).toBe(true);
  });

  test('extractReferencePaths 匹配 backtick 格式', () => {
    const content = 'See `./references/guide.md` and `./examples/demo.md`';
    const paths = extractReferencePaths(content);
    expect(paths).toContain('./references/guide.md');
    expect(paths).toContain('./examples/demo.md');
  });

  test('extractReferencePaths 匹配表格格式', () => {
    const content = '| ./references/review-flow.md | description |';
    const paths = extractReferencePaths(content);
    expect(paths).toContain('./references/review-flow.md');
  });

  test('extractReferencePaths 去重', () => {
    const content = '`./references/a.md` and `./references/a.md`';
    const paths = extractReferencePaths(content);
    expect(paths.filter(p => p === './references/a.md')).toHaveLength(1);
  });

  test('finding 建立正確格式', () => {
    const f = finding('closedLoop', 'test-type', 'warning', 'element/path', 'description');
    expect(f.check).toBe('closedLoop');
    expect(f.type).toBe('test-type');
    expect(f.severity).toBe('warning');
    expect(f.element).toBe('element/path');
    expect(f.description).toBe('description');
  });
});

// ─── Scan 測試 ───────────────────────────────────────────────────────────────

describe('health-check-scan', () => {
  test('scanSkills 回傳 skills 陣列', () => {
    const skills = scanSkills();
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
    // 每個 skill 應有 name 和 dir
    const first = skills[0];
    expect(first.name).toBeTruthy();
    expect(first.dir).toBeTruthy();
  });

  test('scanAgents 回傳 agents 陣列', () => {
    const agents = scanAgents();
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
  });

  test('scanHooks 回傳 hooks 陣列', () => {
    const hooks = scanHooks();
    expect(Array.isArray(hooks)).toBe(true);
  });

  test('scanModules 回傳 modules 陣列', () => {
    const modules = scanModules();
    expect(Array.isArray(modules)).toBe(true);
    expect(modules.length).toBeGreaterThan(0);
    // 應包含 guards.js
    expect(modules.some(m => m.name === 'guards.js')).toBe(true);
  });

  test('scanRules 回傳 rules 陣列', () => {
    const rules = scanRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThanOrEqual(18);
  });

  test('scanCommands 回傳 commands 陣列', () => {
    const commands = scanCommands();
    expect(Array.isArray(commands)).toBe(true);
  });
});

// ─── Checks 測試 ─────────────────────────────────────────────────────────────

describe('health-check-checks', () => {
  test('checkClosedLoop 回傳 findings 陣列', async () => {
    const findings = await checkClosedLoop();
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.check).toBe('closedLoop');
      expect(['critical', 'warning', 'info']).toContain(f.severity);
    }
  });

  test('checkSkillCoverage 回傳 findings 陣列', async () => {
    const findings = await checkSkillCoverage();
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.check).toBe('skillCoverage');
    }
  });

  test('checkHookIntegrity 回傳 findings 陣列', async () => {
    const findings = await checkHookIntegrity();
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.check).toBe('hookIntegrity');
    }
  });

  test('checkAgentAlignment 回傳 findings 陣列', async () => {
    const findings = await checkAgentAlignment();
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.check).toBe('agentAlignment');
    }
  });

  test('共享 cache 減少重複掃描', async () => {
    const cache = {};
    await checkClosedLoop(cache);
    // cache 應被填充
    expect(Object.keys(cache).length).toBeGreaterThan(0);
    // 第二次呼叫應使用 cache
    await checkSkillCoverage(cache);
  });
});
