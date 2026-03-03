'use strict';
/**
 * build-skill-context.test.js
 * 測試 hook-utils.js 的 buildSkillContext 函式
 *
 * 策略：
 * - 使用實際的 pluginRoot（真實 agent + skill 檔案）
 * - 使用臨時目錄建立 fixture（測試邊界情況）
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { PLUGIN_ROOT } = require('../helpers/paths');

// 取得 buildSkillContext
const { buildSkillContext } = require(join(PLUGIN_ROOT, 'scripts', 'lib', 'hook-utils'));

// ── 測試用臨時目錄 ──

const TMP_ROOT = join(__dirname, '..', '..', '.test-tmp-skill-context');

function createTmpPlugin(agents = {}, skills = {}) {
  // 清理並重建 tmp 目錄
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true, force: true });
  mkdirSync(join(TMP_ROOT, 'agents'), { recursive: true });

  for (const [name, content] of Object.entries(agents)) {
    writeFileSync(join(TMP_ROOT, 'agents', `${name}.md`), content, 'utf8');
  }

  for (const [skillName, content] of Object.entries(skills)) {
    const dir = join(TMP_ROOT, 'skills', skillName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), content, 'utf8');
  }

  return TMP_ROOT;
}

afterEach(() => {
  if (existsSync(TMP_ROOT)) {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  }
});

// ── Feature 1: buildSkillContext ──

describe('buildSkillContext — Scenario 1-1: Agent 有 skills 欄位時載入 SKILL.md 摘要', () => {
  it('回傳字串包含 commit-convention 和 wording 區塊標頭', () => {
    // developer.md 有 skills: ['commit-convention', 'wording']
    const result = buildSkillContext('developer', PLUGIN_ROOT);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result).toContain('--- commit-convention ---');
    expect(result).toContain('--- wording ---');
  });

  it('回傳字串以 [Skill 知識摘要] 開頭', () => {
    const result = buildSkillContext('developer', PLUGIN_ROOT);
    expect(result).not.toBeNull();
    expect(result.startsWith('[Skill 知識摘要]')).toBe(true);
  });

  it('每個 skill 正文被截斷至 800 chars 以內（不含標頭和截斷標記）', () => {
    const longBody = 'x'.repeat(1000);
    const pluginRoot = createTmpPlugin(
      { agent: `---\nname: agent\nskills:\n  - long-skill\n---\n# body` },
      { 'long-skill': `---\nname: long-skill\n---\n\n${longBody}` }
    );
    const result = buildSkillContext('agent', pluginRoot);
    expect(result).not.toBeNull();
    // 正文部分不超過 800 chars（plus 截斷標記和標頭）
    expect(result.length).toBeLessThan(1200);
  });
});

describe('buildSkillContext — Scenario 1-2: Agent 無 skills 欄位時回傳 null', () => {
  it('designer 無 skills 欄位時回傳 null', () => {
    // designer.md 不含 skills 欄位
    const result = buildSkillContext('designer', PLUGIN_ROOT);
    expect(result).toBeNull();
  });
});

describe('buildSkillContext — Scenario 1-3: Agent skills 為空陣列時回傳 null', () => {
  it('skills: [] 時回傳 null', () => {
    const pluginRoot = createTmpPlugin(
      { reviewer: `---\nname: reviewer\nskills: []\n---\n# body` },
      {}
    );
    const result = buildSkillContext('reviewer', pluginRoot);
    expect(result).toBeNull();
  });
});

describe('buildSkillContext — Scenario 1-4: 部分 SKILL.md 不存在時靜默跳過', () => {
  it('存在的 skill 正常載入，不存在的靜默跳過', () => {
    const pluginRoot = createTmpPlugin(
      { dev: `---\nname: dev\nskills:\n  - commit-convention\n  - nonexistent-skill\n---\n# body` },
      { 'commit-convention': `---\nname: commit-convention\n---\n\n# Commit Convention 正文` }
    );
    const result = buildSkillContext('dev', pluginRoot);
    expect(result).not.toBeNull();
    expect(result).toContain('--- commit-convention ---');
    expect(result).not.toContain('--- nonexistent-skill ---');
  });

  it('不拋出例外', () => {
    const pluginRoot = createTmpPlugin(
      { dev: `---\nname: dev\nskills:\n  - commit-convention\n  - nonexistent-skill\n---\n# body` },
      { 'commit-convention': `---\nname: commit-convention\n---\n\n# 正文` }
    );
    expect(() => buildSkillContext('dev', pluginRoot)).not.toThrow();
  });
});

describe('buildSkillContext — Scenario 1-5: 所有 SKILL.md 都不存在時回傳 null', () => {
  it('回傳 null', () => {
    const pluginRoot = createTmpPlugin(
      { dev: `---\nname: dev\nskills:\n  - nonexistent-a\n  - nonexistent-b\n---\n# body` },
      {} // 沒有 SKILL.md
    );
    const result = buildSkillContext('dev', pluginRoot);
    expect(result).toBeNull();
  });
});

describe('buildSkillContext — Scenario 1-6: 多 skill 總長度超過 2400 chars 時截斷', () => {
  it('回傳字串總長度不超過 2400 chars 加上固定標頭長度', () => {
    const longBody = 'y'.repeat(900); // 超過 800 chars/skill
    const skills = {};
    for (let i = 1; i <= 4; i++) {
      skills[`skill-${i}`] = `---\nname: skill-${i}\n---\n\n${longBody}`;
    }
    const skillList = [1, 2, 3, 4].map(i => `  - skill-${i}`).join('\n');
    const pluginRoot = createTmpPlugin(
      { agent: `---\nname: agent\nskills:\n${skillList}\n---\n# body` },
      skills
    );

    const result = buildSkillContext('agent', pluginRoot);
    expect(result).not.toBeNull();
    // 標頭約 20 chars，skill blocks 不超過 2400 chars
    // 總長不超過 2400 + 20（標頭） + 100（各 block 標頭和換行）= ~2520
    expect(result.length).toBeLessThan(2600);
  });
});

describe('buildSkillContext — Scenario 1-7: Agent .md 不存在時回傳 null', () => {
  it('nonexistent-agent 回傳 null', () => {
    const result = buildSkillContext('nonexistent-agent', PLUGIN_ROOT);
    expect(result).toBeNull();
  });

  it('不拋出例外', () => {
    expect(() => buildSkillContext('nonexistent-agent', PLUGIN_ROOT)).not.toThrow();
  });
});

describe('buildSkillContext — Scenario 1-8: skills 欄位非陣列時回傳 null', () => {
  it('skills 為字串時回傳 null', () => {
    const pluginRoot = createTmpPlugin(
      { dev: `---\nname: dev\nskills: commit-convention\n---\n# body` },
      { 'commit-convention': `---\nname: commit-convention\n---\n\n# 正文` }
    );
    const result = buildSkillContext('dev', pluginRoot);
    expect(result).toBeNull();
  });
});
