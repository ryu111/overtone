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
const { parseFrontmatter } = require('../helpers/frontmatter');

const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');

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

  // Scenario 1b-2: code-review knowledge domain 具備正確設定
  describe('Scenario 1b-2: code-review SKILL.md frontmatter', () => {
    const skillPath = join(SKILLS_DIR, 'code-review', 'SKILL.md');

    test('code-review SKILL.md 檔案存在', () => {
      expect(fs.existsSync(skillPath)).toBe(true);
    });

    test('code-review frontmatter 包含 name: code-review', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm.name).toBe('code-review');
    });

    test('code-review frontmatter 包含 disable-model-invocation: true', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['disable-model-invocation']).toBe(true);
    });

    test('code-review frontmatter 包含 user-invocable: false', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['user-invocable']).toBe(false);
    });
  });

  // Scenario 1b-3: commit-convention knowledge domain 具備正確設定
  describe('Scenario 1b-3: commit-convention SKILL.md frontmatter', () => {
    const skillPath = join(SKILLS_DIR, 'commit-convention', 'SKILL.md');

    test('commit-convention SKILL.md 檔案存在', () => {
      expect(fs.existsSync(skillPath)).toBe(true);
    });

    test('commit-convention frontmatter 包含 name: commit-convention', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm.name).toBe('commit-convention');
    });

    test('commit-convention frontmatter 包含 disable-model-invocation: true', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['disable-model-invocation']).toBe(true);
    });

    test('commit-convention frontmatter 包含 user-invocable: false', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['user-invocable']).toBe(false);
    });
  });

  // Scenario 1b-14: craft knowledge domain 具備正確設定
  describe('Scenario 1b-14: craft SKILL.md frontmatter', () => {
    const skillPath = join(SKILLS_DIR, 'craft', 'SKILL.md');

    test('craft SKILL.md 檔案存在', () => {
      expect(fs.existsSync(skillPath)).toBe(true);
    });

    test('craft frontmatter 包含 name: craft', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm.name).toBe('craft');
    });

    test('craft frontmatter 包含 disable-model-invocation: true', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['disable-model-invocation']).toBe(true);
    });

    test('craft frontmatter 包含 user-invocable: false', () => {
      const fm = parseFrontmatter(skillPath);
      expect(fm['user-invocable']).toBe(false);
    });
  });

  // Scenario 1b-4: 已刪除的 ref-* skill 不存在
  describe('Scenario 1b-4: 已刪除的 ref-* skill 目錄不存在', () => {
    const deletedSkills = ['ref-bdd-guide', 'ref-failure-handling', 'ref-wording-guide', 'ref-agent-prompt-patterns', 'ref-test-strategy', 'ref-commit-convention', 'ref-pr-review-checklist'];

    for (const skillName of deletedSkills) {
      test(`${skillName} 目錄已被刪除`, () => {
        const skillPath = join(SKILLS_DIR, skillName, 'SKILL.md');
        expect(fs.existsSync(skillPath)).toBe(false);
      });
    }
  });

  // Scenario 1b-9: knowledge domain index SKILL.md 精簡（索引式，非內容式）
  describe('Scenario 1b-9: knowledge domain index SKILL.md 精簡', () => {
    const knowledgeDomains = ['code-review', 'commit-convention', 'testing', 'workflow-core', 'security-kb', 'database', 'dead-code', 'craft'];

    for (const skillName of knowledgeDomains) {
      test(`${skillName} index SKILL.md 不超過 3000 字元`, () => {
        const skillPath = join(SKILLS_DIR, skillName, 'SKILL.md');
        const charCount = estimateTokens(skillPath);
        expect(charCount).toBeLessThanOrEqual(3000);
      });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature: Workflow command 可呼叫性驗證
// ────────────────────────────────────────────────────────────────────────────

describe('Feature: Workflow command 可呼叫性', () => {

  // auto 路由到的 16 個 workflow commands — model 必須能呼叫
  const workflowCommands = [
    'dev', 'quick', 'standard', 'full', 'secure', 'tdd', 'debug', 'refactor',
    'review', 'security', 'build-fix', 'e2e', 'test', 'diagnose', 'db-review', 'clean',
  ];

  // 非 workflow commands — 應保持 disable-model-invocation: true
  const nonWorkflowCommands = [
    'architect', 'audit', 'design', 'plan', 'qa', 'mul-agent',
    'dashboard', 'doc-sync', 'remote', 'status', 'stop',
  ];

  for (const cmd of workflowCommands) {
    test(`workflow command ${cmd} 不可有 disable-model-invocation: true`, () => {
      const cmdPath = join(COMMANDS_DIR, `${cmd}.md`);
      expect(fs.existsSync(cmdPath)).toBe(true);
      const fm = parseFrontmatter(cmdPath);
      expect(fm['disable-model-invocation']).not.toBe(true);
    });
  }

  for (const cmd of nonWorkflowCommands) {
    test(`non-workflow command ${cmd} 應有 disable-model-invocation: true`, () => {
      const cmdPath = join(COMMANDS_DIR, `${cmd}.md`);
      expect(fs.existsSync(cmdPath)).toBe(true);
      const fm = parseFrontmatter(cmdPath);
      expect(fm['disable-model-invocation']).toBe(true);
    });
  }

  // pm skill 也需要 model 可呼叫（auto 路由到 PM workflows）
  test('pm skill 不可有 disable-model-invocation: true', () => {
    const pmPath = join(SKILLS_DIR, 'pm', 'SKILL.md');
    const fm = parseFrontmatter(pmPath);
    expect(fm['disable-model-invocation']).not.toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature: 術語一致性驗證
// ────────────────────────────────────────────────────────────────────────────

describe('Feature: 術語一致性', () => {

  test('plugin 目錄下不應有「workflow skill」術語（應為 workflow command）', () => {
    const violations = [];

    // 掃描 skills/
    const skillDirs = fs.readdirSync(SKILLS_DIR);
    for (const dir of skillDirs) {
      const filePath = join(SKILLS_DIR, dir, 'SKILL.md');
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('workflow skill')) {
        violations.push(`skills/${dir}/SKILL.md`);
      }
    }

    // 掃描 commands/
    if (fs.existsSync(COMMANDS_DIR)) {
      const cmdFiles = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.md'));
      for (const file of cmdFiles) {
        const content = fs.readFileSync(join(COMMANDS_DIR, file), 'utf8');
        if (content.includes('workflow skill')) {
          violations.push(`commands/${file}`);
        }
      }
    }

    // 掃描 hooks/scripts/
    const hooksDir = join(PLUGIN_ROOT, 'hooks', 'scripts');
    if (fs.existsSync(hooksDir)) {
      const walkDir = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            walkDir(join(dir, entry.name));
          } else if (entry.name.endsWith('.js')) {
            const content = fs.readFileSync(join(dir, entry.name), 'utf8');
            if (content.includes('workflow skill')) {
              violations.push(join(dir, entry.name).replace(PLUGIN_ROOT + '/', ''));
            }
          }
        }
      };
      walkDir(hooksDir);
    }

    if (violations.length > 0) {
      throw new Error(
        `以下檔案仍使用「workflow skill」術語（應為 workflow command），共 ${violations.length} 個：\n` +
        violations.map(p => `  - ${p}`).join('\n')
      );
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature: Skill 引用完整性驗證
// ────────────────────────────────────────────────────────────────────────────

describe('Feature: Skill 引用完整性驗證', () => {

  // 共用輔助：讀取所有 SKILL.md 和 command .md 的內容
  function collectAllMdContents() {
    const contents = [];

    // 掃描 skills/ 下的 SKILL.md
    const skillDirs = fs.readdirSync(SKILLS_DIR);
    for (const skillDir of skillDirs) {
      const skillPath = join(SKILLS_DIR, skillDir, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      contents.push({ source: `skills/${skillDir}/SKILL.md`, content: fs.readFileSync(skillPath, 'utf8') });
    }

    // 掃描 commands/ 下的 .md
    if (fs.existsSync(COMMANDS_DIR)) {
      const cmdFiles = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.md'));
      for (const cmdFile of cmdFiles) {
        contents.push({ source: `commands/${cmdFile}`, content: fs.readFileSync(join(COMMANDS_DIR, cmdFile), 'utf8') });
      }
    }

    return contents;
  }

  // 共用輔助：收集 skills/ 引用（相對於 skills/）
  // 支援三種格式：
  //   1. 舊格式：${CLAUDE_PLUGIN_ROOT}/skills/{skill}/references/{file}
  //   2. 新格式（同 skill）：./references/{file} 或 ./examples/{file}（需結合 source 推算 skillName）
  //   3. 新格式（跨 skill）：../{otherSkill}/references/{file}
  function collectSkillRefs() {
    const refs = new Set();

    // 格式 1：舊格式（保留相容）
    const oldPattern = /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/([^\`\s]+)/g;
    // 格式 2：同 skill 相對路徑 ./references/xxx 或 ./examples/xxx（在 SKILL.md 中）
    const selfRelPattern = /`\.\/(references|examples)\/([^\s`'"]+\.md)`/g;
    // 格式 3：跨 skill 相對路徑 ../otherSkill/references/xxx（在 SKILL.md 中）
    const crossRelPattern = /`\.\.\/([\w-]+)\/(references|examples)\/([^\s`'"]+\.md)`/g;
    // 格式 4：全域路徑 ~/.claude/skills/xxx/references/yyy（在 command .md 中）
    const globalPattern = /~\/\.claude\/skills\/([^\s`'"]+)/g;

    for (const { source, content } of collectAllMdContents()) {
      let m;

      // 格式 1
      oldPattern.lastIndex = 0;
      while ((m = oldPattern.exec(content)) !== null) {
        const refPath = m[1];
        if (!refPath.includes('<') && !refPath.includes('{')) {
          refs.add(refPath);
        }
      }

      // 格式 4
      globalPattern.lastIndex = 0;
      while ((m = globalPattern.exec(content)) !== null) {
        const refPath = m[1];
        if (!refPath.includes('<') && !refPath.includes('{')) {
          refs.add(refPath);
        }
      }

      // 格式 2/3：只在 SKILL.md 中使用相對路徑
      if (source.includes('/SKILL.md') || source.endsWith('SKILL.md')) {
        // 從 source 推算 skillName（e.g. "skills/craft/SKILL.md" → "craft"）
        const skillMatch = source.match(/skills\/([^/]+)\/SKILL\.md/);
        const skillName = skillMatch ? skillMatch[1] : null;

        if (skillName) {
          // 格式 2：同 skill
          selfRelPattern.lastIndex = 0;
          while ((m = selfRelPattern.exec(content)) !== null) {
            refs.add(`${skillName}/${m[1]}/${m[2]}`);
          }

          // 格式 3：跨 skill
          crossRelPattern.lastIndex = 0;
          while ((m = crossRelPattern.exec(content)) !== null) {
            refs.add(`${m[1]}/${m[2]}/${m[3]}`);
          }
        }
      }
    }

    return refs;
  }

  // 共用輔助：收集 commands/ 引用（相對於 commands/）
  function collectCommandRefs() {
    const oldPattern = /\$\{CLAUDE_PLUGIN_ROOT\}\/commands\/([^\`\s]+)/g;
    const globalPattern = /~\/\.claude\/commands\/([^\s`'"]+)/g;
    const refs = new Set();

    for (const { content } of collectAllMdContents()) {
      let m;

      oldPattern.lastIndex = 0;
      while ((m = oldPattern.exec(content)) !== null) {
        const refPath = m[1];
        if (!refPath.includes('<') && !refPath.includes('{')) {
          refs.add(refPath);
        }
      }

      globalPattern.lastIndex = 0;
      while ((m = globalPattern.exec(content)) !== null) {
        const refPath = m[1];
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

  // Scenario: 所有 💡 引用的目標檔案存在（skills/ 和 commands/）
  test('所有 💡 引用的目標檔案存在', () => {
    const missing = [];

    // 驗證 skills/ 引用
    for (const ref of collectSkillRefs()) {
      const fullPath = join(SKILLS_DIR, ref);
      if (!fs.existsSync(fullPath)) {
        missing.push(`skills/${ref}`);
      }
    }

    // 驗證 commands/ 引用
    for (const ref of collectCommandRefs()) {
      const fullPath = join(COMMANDS_DIR, ref);
      if (!fs.existsSync(fullPath)) {
        missing.push(`commands/${ref}`);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `以下 💡 引用的目標檔案不存在（共 ${missing.length} 個）：\n` +
        missing.map(p => `  - ${p}`).join('\n')
      );
    }
  });

  // Scenario: 所有 reference/example 檔案至少被一個 SKILL.md 或 command .md 引用
  test('所有 reference/example 檔案至少被一個 SKILL.md 或 command 引用', () => {
    const refs = collectSkillRefs();
    const allFiles = collectReferenceFiles();
    // auto-discovered.md 是 knowledge-engine 在 runtime 動態生成的，不被 SKILL.md 引用
    const orphans = allFiles.filter(f => !refs.has(f) && !f.endsWith('auto-discovered.md'));

    if (orphans.length > 0) {
      throw new Error(
        `以下 reference/example 檔案未被任何 SKILL.md 引用（孤立檔案，共 ${orphans.length} 個）：\n` +
        orphans.map(p => `  - skills/${p}`).join('\n')
      );
    }
  });
});
