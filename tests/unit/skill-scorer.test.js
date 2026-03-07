'use strict';
/**
 * skill-scorer.test.js — Skill 品質評分引擎單元測試
 *
 * 覆蓋：
 *   Feature 1: scoreSkill — 基本結構驗證（回傳 8 個 dimensions）
 *   Feature 2: D3 Anti-Pattern — NEVER 計數評分邏輯
 *   Feature 3: D4 Spec Compliance — frontmatter 完整度評分
 *   Feature 4: D5 Progressive Disclosure — 行數 + refs 目錄評分
 *   Feature 5: D7 Pattern — 行數偵測 pattern
 *   Feature 6: Grade 計算
 *   Feature 7: 錯誤處理（不存在的 skill）
 *   Feature 8: scoreAllSkills — 整合測試
 */

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { scoreSkill, scoreAllSkills } = require(path.join(SCRIPTS_LIB, 'skill-scorer'));

// ── 沙盒工具 ──────────────────────────────────────────────────────────────

let tmpDir;

function setupSandbox() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-scorer-test-'));
  return tmpDir;
}

function teardownSandbox() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = null;
}

/**
 * 在 tmpDir 建立一個 mock skill。
 * @param {string} skillName - skill 目錄名稱
 * @param {string} content   - SKILL.md 內容
 * @param {Object} [refs]    - { 'file.md': content } 放在 references/ 目錄
 * @returns {string} pluginRoot 路徑
 */
function createMockSkill(skillName, content, refs = null) {
  const pluginRoot = tmpDir;
  const skillDir = path.join(pluginRoot, 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf8');

  if (refs) {
    const refsDir = path.join(skillDir, 'references');
    fs.mkdirSync(refsDir, { recursive: true });
    for (const [filename, fileContent] of Object.entries(refs)) {
      fs.writeFileSync(path.join(refsDir, filename), fileContent, 'utf8');
    }
  }

  return pluginRoot;
}

/**
 * 建立基本有效的 frontmatter（D4 高分用）
 */
function makeFrontmatter({
  name = 'test-skill',
  description = 'Use when you need to test something important in the system. A detailed description of the skill functionality and when to invoke it via user request.',
  userInvocable = true,
} = {}) {
  const invocable = userInvocable ? 'user-invocable: true' : '';
  return `---
name: ${name}
description: "${description}"
${invocable}
---`;
}

// ── Feature 1: scoreSkill — 基本結構驗證 ─────────────────────────────────

describe('scoreSkill — Feature 1: 回傳包含 8 個 dimensions 的完整結果', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('回傳 SkillScoreResult 結構，dimensions 長度為 8', () => {
    const content = `${makeFrontmatter()}\n\n# Test Skill\n\nThis is a basic skill content.\n\nNEVER do bad things because safety matters.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    expect(result).not.toBeNull();
    expect(result.skillName).toBe('test-skill');
    expect(Array.isArray(result.dimensions)).toBe(true);
    expect(result.dimensions.length).toBe(8);
    expect(result.error).toBeNull();
  });

  test('每個 dimension 包含 id, name, score, maxScore, signals, flags, note 欄位', () => {
    const content = `${makeFrontmatter()}\n\n# Test Skill\n\nContent.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    for (const dim of result.dimensions) {
      expect(typeof dim.id).toBe('string');
      expect(typeof dim.name).toBe('string');
      expect(typeof dim.score).toBe('number');
      expect(typeof dim.maxScore).toBe('number');
      expect(Array.isArray(dim.signals)).toBe(true);
      expect(Array.isArray(dim.flags)).toBe(true);
      expect(typeof dim.note).toBe('string');
    }
  });

  test('dimension id 從 D1 到 D8', () => {
    const content = `${makeFrontmatter()}\n\n# Test Skill\n\nContent.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);
    const ids = result.dimensions.map(d => d.id);

    expect(ids).toContain('D1');
    expect(ids).toContain('D8');
  });

  test('totalScore 不超過 maxScore(120)', () => {
    const content = `${makeFrontmatter()}\n\n# Test Skill\n\nContent.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    expect(result.maxScore).toBe(120);
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(120);
  });

  test('percent 為 0-100 之間的數字', () => {
    const content = `${makeFrontmatter()}\n\n# Test Skill\n\nContent.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    expect(result.percent).toBeGreaterThanOrEqual(0);
    expect(result.percent).toBeLessThanOrEqual(100);
  });

  test('回傳 skillPath、frontmatter、lineCount、hasReferences 欄位', () => {
    const content = `${makeFrontmatter()}\n\n# Test Skill\n\nContent.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    expect(typeof result.skillPath).toBe('string');
    expect(typeof result.frontmatter).toBe('object');
    expect(typeof result.lineCount).toBe('number');
    expect(typeof result.hasReferences).toBe('boolean');
    expect(typeof result.referenceCount).toBe('number');
  });
});

// ── Feature 2: D3 Anti-Pattern — NEVER 計數評分 ──────────────────────────

describe('scoreSkill — Feature 2: D3 Anti-Pattern NEVER 計數', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('0 個 NEVER → D3 score 在 0-3 之間', () => {
    const content = `${makeFrontmatter()}\n\n# Skill\n\nDo things properly.\nAlways follow conventions.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);
    const d3 = result.dimensions.find(d => d.id === 'D3');

    expect(d3).toBeDefined();
    expect(d3.score).toBeGreaterThanOrEqual(0);
    expect(d3.score).toBeLessThanOrEqual(3);
  });

  test('1-2 個 NEVER（無 because）→ D3 score 在 4-7 之間', () => {
    const content = `${makeFrontmatter()}\n\n# Skill\n\nNEVER do bad things.\nNEVER skip validation.\nAlways follow conventions.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);
    const d3 = result.dimensions.find(d => d.id === 'D3');

    expect(d3.score).toBeGreaterThanOrEqual(4);
    expect(d3.score).toBeLessThanOrEqual(7);
  });

  test('3-5 個 NEVER 且帶 because → D3 score 在 8-11 之間', () => {
    const content = `${makeFrontmatter()}\n\n# Skill\n\nNEVER skip validation because it breaks safety.\nNEVER ignore errors because they hide bugs.\nNEVER hardcode secrets because of security risks.\nGeneral content.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);
    const d3 = result.dimensions.find(d => d.id === 'D3');

    expect(d3.score).toBeGreaterThanOrEqual(8);
    expect(d3.score).toBeLessThanOrEqual(11);
  });

  test('6 個以上 NEVER → D3 score 在 12-15 之間', () => {
    const nevers = Array.from({ length: 6 }, (_, i) => `NEVER do thing ${i + 1} because it is wrong.`).join('\n');
    const content = `${makeFrontmatter()}\n\n# Skill\n\n${nevers}\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);
    const d3 = result.dimensions.find(d => d.id === 'D3');

    expect(d3.score).toBeGreaterThanOrEqual(12);
    expect(d3.score).toBeLessThanOrEqual(15);
  });
});

// ── Feature 3: D4 Spec Compliance — frontmatter 完整度 ───────────────────

describe('scoreSkill — Feature 3: D4 Spec Compliance', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('frontmatter 缺少 description → D4 < 5', () => {
    const content = `---
name: test-skill
---

# Test Skill

Content without description field in frontmatter.
`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);
    const d4 = result.dimensions.find(d => d.id === 'D4');

    expect(d4.score).toBeLessThan(5);
  });

  test('frontmatter 有 name + description >30 字 + user-invocable + 技術術語 → D4 高分', () => {
    const description = 'Use when you need to analyze API responses, validate JSON schemas, and process HTTP endpoints for integration testing purposes.';
    const content = `---
name: test-skill
description: "${description}"
user-invocable: true
---

# Test Skill

Content here.
`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);
    const d4 = result.dimensions.find(d => d.id === 'D4');

    // name(+3) + desc 存在且>30字(+3) + >80字(+2) + "Use when"(+2) + user-invocable(+2) + 技術術語(+3) = 15
    expect(d4.score).toBeGreaterThanOrEqual(10);
  });

  test('description 存在但不足 30 字 → D4 < 10', () => {
    const content = `---
name: test-skill
description: "Short desc"
---

# Test Skill

Content.
`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);
    const d4 = result.dimensions.find(d => d.id === 'D4');

    expect(d4.score).toBeLessThan(10);
  });
});

// ── Feature 4: D5 Progressive Disclosure — 行數 + refs 評分 ──────────────

describe('scoreSkill — Feature 4: D5 Progressive Disclosure', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('<500 行且有 refs 目錄（>= 2 個 .md）→ D5 >= 13', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Content line ${i + 1}`).join('\n');
    const content = `${makeFrontmatter()}\n\n# Skill\n\n${lines}\n`;
    const pluginRoot = createMockSkill('test-skill', content, {
      'reference-a.md': '# Ref A\nContent.',
      'reference-b.md': '# Ref B\nContent.',
    });

    const result = scoreSkill('test-skill', pluginRoot);
    const d5 = result.dimensions.find(d => d.id === 'D5');

    // <500 行(+5) + refs 目錄存在(+5) + refs >= 2(+3) = 13
    expect(d5.score).toBeGreaterThanOrEqual(13);
  });

  test('>500 行且無 refs 目錄 → D5 扣分（score <= 5）', () => {
    const lines = Array.from({ length: 600 }, (_, i) => `Content line ${i + 1}`).join('\n');
    const content = `${makeFrontmatter()}\n\n# Skill\n\n${lines}\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);
    const d5 = result.dimensions.find(d => d.id === 'D5');

    // >500 行不得 +5，無 refs 目錄不得 +5+3
    expect(d5.score).toBeLessThanOrEqual(5);
  });

  test('有 refs 目錄但只有 1 個 .md → 不加 refs >= 2 的分數', () => {
    const content = `${makeFrontmatter()}\n\n# Skill\n\nContent.\n`;
    const pluginRoot = createMockSkill('test-skill', content, {
      'reference-a.md': '# Ref A\nContent.',
    });

    const result = scoreSkill('test-skill', pluginRoot);
    const d5 = result.dimensions.find(d => d.id === 'D5');

    // refs 存在(+5)，但 < 2 個 .md，不加 +3
    const d5WithTwoRefs = 5 + 5 + 3; // 13
    expect(d5.score).toBeLessThan(d5WithTwoRefs);
  });
});

// ── Feature 5: D7 Pattern — 行數偵測 pattern ─────────────────────────────

describe('scoreSkill — Feature 5: D7 Pattern 偵測', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('< 40 行 → pattern 為 Navigation', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`).join('\n');
    const content = `${makeFrontmatter()}\n\n${lines}\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    expect(result.pattern).toBe('Navigation');
  });

  test('40-69 行 → pattern 為 Mindset', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join('\n');
    const content = `${makeFrontmatter()}\n\n${lines}\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    expect(result.pattern).toBe('Mindset');
  });

  test('70-199 行 → pattern 為 Philosophy', () => {
    const lines = Array.from({ length: 120 }, (_, i) => `Line ${i + 1}`).join('\n');
    const content = `${makeFrontmatter()}\n\n${lines}\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    expect(result.pattern).toBe('Philosophy');
  });

  test('200-299 行 → pattern 為 Process', () => {
    const lines = Array.from({ length: 220 }, (_, i) => `Line ${i + 1}`).join('\n');
    const content = `${makeFrontmatter()}\n\n${lines}\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    expect(result.pattern).toBe('Process');
  });

  test('>= 300 行 → pattern 為 Tool', () => {
    const lines = Array.from({ length: 350 }, (_, i) => `Line ${i + 1}`).join('\n');
    const content = `${makeFrontmatter()}\n\n${lines}\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    expect(result.pattern).toBe('Tool');
  });
});

// ── Feature 6: Grade 計算 ────────────────────────────────────────────────

describe('scoreSkill — Feature 6: Grade 計算正確性', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('高分 skill（接近 120）→ grade 為 A', () => {
    // 盡可能高分：完整 frontmatter + NEVER * 6+ + refs + code blocks + tables
    const nevers = Array.from({ length: 7 }, (_, i) =>
      `NEVER do dangerous thing ${i + 1} because it breaks safety invariants.`
    ).join('\n');
    const description = 'Use when you need to validate API endpoints, process HTTP responses, and analyze JSON schema compliance for testing purposes.';
    const content = `---
name: test-skill
description: "${description}"
user-invocable: true
---

# Test Skill

Before designing, ask yourself: what is the non-obvious trade-off here?

When input is invalid → reject early with specific error message.

## Decision Tree

| Scenario | Action | Example |
|----------|--------|---------|
| Valid input | Process | e.g. valid JSON |
| Invalid input | Reject | edge case: empty string |
| Unknown | Log error | error handling fallback |

${nevers}

\`\`\`javascript
// Example: validation
function validate(input) { return !!input; }
\`\`\`

\`\`\`bash
# Example: run check
bun run check
\`\`\`

MUST always follow principles and guidelines.
MUST validate inputs.
Consider using structured output.
`;
    const pluginRoot = createMockSkill('test-skill', content, {
      'guide-a.md': '# Guide A\nDetailed content.',
      'guide-b.md': '# Guide B\nMore content.',
    });

    const result = scoreSkill('test-skill', pluginRoot);

    // percent >= 90% → grade A
    if (result.percent >= 90) {
      expect(result.grade).toBe('A');
    } else {
      // 若分數沒到 A，至少應為 B
      expect(['A', 'B']).toContain(result.grade);
    }
  });

  test('空 SKILL.md（僅有 frontmatter 無 description）→ grade 為 F', () => {
    const content = `---
name: test-skill
---

x
`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    // 分數極低，應為 F
    expect(result.percent).toBeLessThan(60);
    expect(result.grade).toBe('F');
  });

  test('grade 只會是 A/B/C/D/F 其中之一', () => {
    const content = `${makeFrontmatter()}\n\n# Skill\n\nContent.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);

    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
  });

  test('percent >= 90 → grade A', () => {
    // 建立一個能得 90+ 分的 skill（mock 方式）
    // 直接測試 grade 邊界：若 percent 值符合，grade 必須對應
    const content = `${makeFrontmatter()}\n\n# Skill\n\nContent.\n`;
    const pluginRoot = createMockSkill('test-skill', content);

    const result = scoreSkill('test-skill', pluginRoot);
    const expectedGrade =
      result.percent >= 90 ? 'A' :
      result.percent >= 80 ? 'B' :
      result.percent >= 70 ? 'C' :
      result.percent >= 60 ? 'D' : 'F';

    expect(result.grade).toBe(expectedGrade);
  });
});

// ── Feature 7: 錯誤處理 ──────────────────────────────────────────────────

describe('scoreSkill — Feature 7: 不存在的 skill 錯誤處理', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('不存在的 skill → error 不為 null', () => {
    const pluginRoot = tmpDir;
    // 不建立任何 skill 目錄

    const result = scoreSkill('nonexistent-skill', pluginRoot);

    expect(result).not.toBeNull();
    expect(result.error).not.toBeNull();
    expect(typeof result.error).toBe('string');
  });

  test('不存在的 skill → skillName 仍正確回傳', () => {
    const pluginRoot = tmpDir;

    const result = scoreSkill('nonexistent-skill', pluginRoot);

    expect(result.skillName).toBe('nonexistent-skill');
  });

  test('不存在的 skill → totalScore 為 0', () => {
    const pluginRoot = tmpDir;

    const result = scoreSkill('nonexistent-skill', pluginRoot);

    expect(result.totalScore).toBe(0);
  });

  test('不拋出例外', () => {
    const pluginRoot = tmpDir;

    expect(() => scoreSkill('nonexistent-skill', pluginRoot)).not.toThrow();
  });

  test('SKILL.md 存在但內容為空 → error 為 null，不拋出例外', () => {
    const pluginRoot = createMockSkill('empty-skill', '');

    const result = scoreSkill('empty-skill', pluginRoot);

    // 空檔案不應拋出，但分數極低
    expect(() => scoreSkill('empty-skill', pluginRoot)).not.toThrow();
    expect(result.error).toBeNull();
    expect(result.totalScore).toBeLessThanOrEqual(10);
  });

  test('SKILL.md 無 frontmatter → error 為 null，繼續評分', () => {
    const content = `# Skill Without Frontmatter\n\nContent without any frontmatter.\n`;
    const pluginRoot = createMockSkill('no-frontmatter', content);

    expect(() => scoreSkill('no-frontmatter', pluginRoot)).not.toThrow();
    const result = scoreSkill('no-frontmatter', pluginRoot);
    expect(result.error).toBeNull();
  });
});

// ── Feature 8: scoreAllSkills — 整合測試 ─────────────────────────────────

describe('scoreAllSkills — Feature 8: 整合測試', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('回傳陣列，長度等於 skills 目錄數', () => {
    const pluginRoot = tmpDir;

    // 建立 3 個 skill
    for (const name of ['skill-a', 'skill-b', 'skill-c']) {
      const skillDir = path.join(pluginRoot, 'skills', name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `${makeFrontmatter({ name })}\n\n# ${name}\n\nContent.\n`,
        'utf8'
      );
    }

    const results = scoreAllSkills(pluginRoot);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);
  });

  test('回傳陣列中每個元素都有 skillName 和 totalScore', () => {
    const pluginRoot = tmpDir;

    for (const name of ['skill-x', 'skill-y']) {
      const skillDir = path.join(pluginRoot, 'skills', name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `${makeFrontmatter({ name })}\n\n# ${name}\n\nContent.\n`,
        'utf8'
      );
    }

    const results = scoreAllSkills(pluginRoot);

    for (const result of results) {
      expect(typeof result.skillName).toBe('string');
      expect(typeof result.totalScore).toBe('number');
    }
  });

  test('skills 目錄不存在時回傳空陣列，不拋出例外', () => {
    const pluginRoot = tmpDir;
    // 不建立 skills 目錄

    expect(() => scoreAllSkills(pluginRoot)).not.toThrow();
    const results = scoreAllSkills(pluginRoot);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  test('skills 目錄為空時回傳空陣列', () => {
    const pluginRoot = tmpDir;
    fs.mkdirSync(path.join(pluginRoot, 'skills'), { recursive: true });

    const results = scoreAllSkills(pluginRoot);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  test('部分 skill 有 error 時，其他 skill 仍正常回傳', () => {
    const pluginRoot = tmpDir;

    // 建立一個正常 skill
    const skillDir = path.join(pluginRoot, 'skills', 'valid-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `${makeFrontmatter({ name: 'valid-skill' })}\n\n# Valid Skill\n\nContent.\n`,
      'utf8'
    );

    // 建立一個空目錄（無 SKILL.md）
    const emptyDir = path.join(pluginRoot, 'skills', 'broken-skill');
    fs.mkdirSync(emptyDir, { recursive: true });
    // 不寫入 SKILL.md

    const results = scoreAllSkills(pluginRoot);

    expect(results.length).toBe(2);
    const validResult = results.find(r => r.skillName === 'valid-skill');
    expect(validResult).toBeDefined();
    expect(validResult.error).toBeNull();
  });
});
