'use strict';
/**
 * platform-alignment-skills.test.js
 *
 * Feature 1b: Agent skills 預載（ref skill SKILL.md frontmatter）
 * BDD 規格：specs/features/in-progress/platform-alignment-phase1/bdd.md
 *
 * 驗證三個 ref skill 的 SKILL.md frontmatter 設定正確性。
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const fs = require('fs');
const { PLUGIN_ROOT } = require('../helpers/paths');

const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');

// ── 輔助函式：解析 frontmatter ──

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
        result[currentKey] = [];
        inList = true;
      } else if (value === 'true') {
        result[currentKey] = true;
        inList = false;
      } else if (value === 'false') {
        result[currentKey] = false;
        inList = false;
      } else if (!isNaN(Number(value)) && value !== '') {
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

// ── 計算大致 token 數（字元數 / 4）──

function estimateTokens(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // 移除 frontmatter，只計算主體內容
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, '');
  return withoutFrontmatter.length;
}

// ────────────────────────────────────────────────────────────────────────────
// Feature 1b: ref skill SKILL.md frontmatter 驗證
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1b: ref skill SKILL.md frontmatter', () => {

  // Scenario 1b-1: testing skill 具備正確設定
  describe('Scenario 1b-1: testing SKILL.md frontmatter', () => {
    const skillPath = join(SKILLS_DIR, 'testing', 'SKILL.md');

    test('testing SKILL.md 檔案存在', () => {
      expect(fs.existsSync(skillPath)).toBe(true);
    });

    test('testing frontmatter 包含 name: testing', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm.name).toBe('testing');
    });

    test('testing frontmatter 包含 disable-model-invocation: true', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['disable-model-invocation']).toBe(true);
    });

    test('testing frontmatter 包含 user-invocable: false', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['user-invocable']).toBe(false);
    });
  });

  // Scenario 1b-2: ref-pr-review-checklist 具備正確設定
  describe('Scenario 1b-2: ref-pr-review-checklist SKILL.md frontmatter', () => {
    const skillPath = join(SKILLS_DIR, 'ref-pr-review-checklist', 'SKILL.md');

    test('ref-pr-review-checklist SKILL.md 檔案存在', () => {
      expect(fs.existsSync(skillPath)).toBe(true);
    });

    test('ref-pr-review-checklist frontmatter 包含 name: ref-pr-review-checklist', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm.name).toBe('ref-pr-review-checklist');
    });

    test('ref-pr-review-checklist frontmatter 包含 disable-model-invocation: true', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['disable-model-invocation']).toBe(true);
    });

    test('ref-pr-review-checklist frontmatter 包含 user-invocable: false', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['user-invocable']).toBe(false);
    });
  });

  // Scenario 1b-3: ref-commit-convention 具備正確設定
  describe('Scenario 1b-3: ref-commit-convention SKILL.md frontmatter', () => {
    const skillPath = join(SKILLS_DIR, 'ref-commit-convention', 'SKILL.md');

    test('ref-commit-convention SKILL.md 檔案存在', () => {
      expect(fs.existsSync(skillPath)).toBe(true);
    });

    test('ref-commit-convention frontmatter 包含 name: ref-commit-convention', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm.name).toBe('ref-commit-convention');
    });

    test('ref-commit-convention frontmatter 包含 disable-model-invocation: true', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['disable-model-invocation']).toBe(true);
    });

    test('ref-commit-convention frontmatter 包含 user-invocable: false', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['user-invocable']).toBe(false);
    });
  });

  // Scenario 1b-4: 已刪除的 ref-* skill 不存在
  describe('Scenario 1b-4: 已刪除的 ref-* skill 目錄不存在', () => {
    const deletedSkills = ['ref-bdd-guide', 'ref-failure-handling', 'ref-wording-guide', 'ref-agent-prompt-patterns', 'ref-test-strategy'];

    for (const skillName of deletedSkills) {
      test(`${skillName} 目錄已被刪除`, () => {
        const skillPath = join(SKILLS_DIR, skillName, 'SKILL.md');
        expect(fs.existsSync(skillPath)).toBe(false);
      });
    }
  });

  // Scenario 1b-9: ref skill 內容不超過 3000 字元（約 750 token）
  // 新 ref-* skill 來自 CBP，內容較舊版本豐富，上限調整為 3000 字元
  describe('Scenario 1b-9: ref skill 內容精簡在 3000 字元以內', () => {
    const refSkills = ['ref-pr-review-checklist', 'ref-commit-convention'];

    for (const skillName of refSkills) {
      test(`${skillName} 的有效內容不超過 3000 字元`, () => {
        const skillPath = join(SKILLS_DIR, skillName, 'SKILL.md');
        const charCount = estimateTokens(skillPath);
        expect(charCount).toBeLessThanOrEqual(3000);
      });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature: Skill 引用完整性驗證
// ────────────────────────────────────────────────────────────────────────────

describe('Feature: Skill 引用完整性驗證', () => {

  // 共用輔助：收集所有 SKILL.md 中的靜態 💡 引用路徑（相對於 skills/）
  function collectSkillRefs() {
    const refPattern = /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/([^\`\s]+)/g;
    const refs = new Set();

    const skillDirs = fs.readdirSync(SKILLS_DIR);
    for (const skillDir of skillDirs) {
      const skillPath = join(SKILLS_DIR, skillDir, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const content = fs.readFileSync(skillPath, 'utf8');
      let m;
      while ((m = refPattern.exec(content)) !== null) {
        const refPath = m[1];
        // 排除動態路徑（含 < > 或 { }）
        if (!refPath.includes('<') && !refPath.includes('{')) {
          refs.add(refPath);
        }
      }
    }

    return refs;
  }

  // 共用輔助：列出所有 references/ 和 examples/ 下的 .md 檔案（相對於 skills/）
  function collectReferenceFiles() {
    const files = [];
    const skillDirs = fs.readdirSync(SKILLS_DIR);

    for (const skillDir of skillDirs) {
      for (const subDir of ['references', 'examples']) {
        const dirPath = join(SKILLS_DIR, skillDir, subDir);
        if (!fs.existsSync(dirPath)) continue;
        for (const file of fs.readdirSync(dirPath)) {
          if (file.endsWith('.md')) {
            files.push(`${skillDir}/${subDir}/${file}`);
          }
        }
      }
    }

    return files;
  }

  // Scenario: 所有 💡 引用的目標檔案存在
  test('所有 💡 引用的目標檔案存在', () => {
    const refs = collectSkillRefs();
    const missing = [];

    for (const ref of refs) {
      const fullPath = join(SKILLS_DIR, ref);
      if (!fs.existsSync(fullPath)) {
        missing.push(ref);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `以下 💡 引用的目標檔案不存在（共 ${missing.length} 個）：\n` +
        missing.map(p => `  - skills/${p}`).join('\n')
      );
    }
  });

  // Scenario: 所有 reference/example 檔案至少被一個 SKILL.md 引用
  test('所有 reference/example 檔案至少被一個 SKILL.md 引用', () => {
    const refs = collectSkillRefs();
    const allFiles = collectReferenceFiles();
    const orphans = allFiles.filter(f => !refs.has(f));

    if (orphans.length > 0) {
      throw new Error(
        `以下 reference/example 檔案未被任何 SKILL.md 引用（孤立檔案，共 ${orphans.length} 個）：\n` +
        orphans.map(p => `  - skills/${p}`).join('\n')
      );
    }
  });
});
