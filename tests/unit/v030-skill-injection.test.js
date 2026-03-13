'use strict';
/**
 * v030-skill-injection.test.js
 * 驗證動態 Skill 注入機制
 *
 * 驗證項目：
 *   1. buildSkillContext extraSkills 合併（去重 + 載入）
 *   2. pre-task-handler 解析 [EXTRA_SKILLS: ...] header
 */

const { describe, it, expect, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { PLUGIN_ROOT } = require('../helpers/paths');
const { buildSkillContext } = require(join(PLUGIN_ROOT, 'scripts', 'lib', 'hook-utils'));

// ── Fixture helper ──

const TMP_ROOT = join(__dirname, '..', '..', '.test-tmp-skill-injection');

function createTmpPlugin(agents = {}, skills = {}) {
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
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true, force: true });
});

// ── Feature 1: buildSkillContext extraSkills 合併 ──

describe('buildSkillContext — extraSkills 動態注入', () => {
  it('extraSkills 中的 skill 會被載入並出現在輸出中', () => {
    const root = createTmpPlugin(
      {
        myagent: '---\nname: myagent\nskills:\n  - base-skill\n---\nBody',
      },
      {
        'base-skill': '---\nname: base-skill\n---\n# Base Skill content',
        'extra-skill': '---\nname: extra-skill\n---\n# Extra Skill content',
      }
    );

    const result = buildSkillContext('myagent', root, { extraSkills: ['extra-skill'] });
    expect(result).not.toBeNull();
    expect(result).toContain('base-skill');
    expect(result).toContain('extra-skill');
  });

  it('extraSkills 與 frontmatter skills 重複時只載入一次', () => {
    const root = createTmpPlugin(
      {
        myagent: '---\nname: myagent\nskills:\n  - shared-skill\n---\nBody',
      },
      {
        'shared-skill': '---\nname: shared-skill\n---\n# Shared Skill content',
      }
    );

    const result = buildSkillContext('myagent', root, { extraSkills: ['shared-skill'] });
    expect(result).not.toBeNull();
    // 只出現一次（去重）
    const count = (result.match(/--- shared-skill ---/g) || []).length;
    expect(count).toBe(1);
  });

  it('agent 無 frontmatter skills 但有 extraSkills 時仍能載入', () => {
    const root = createTmpPlugin(
      {
        myagent: '---\nname: myagent\n---\nNo skills in frontmatter',
      },
      {
        'extra-only': '---\nname: extra-only\n---\n# Extra Only content',
      }
    );

    const result = buildSkillContext('myagent', root, { extraSkills: ['extra-only'] });
    expect(result).not.toBeNull();
    expect(result).toContain('extra-only');
  });

  it('extraSkills 不傳時行為與原本一致', () => {
    const root = createTmpPlugin(
      {
        myagent: '---\nname: myagent\nskills:\n  - base-skill\n---\nBody',
      },
      {
        'base-skill': '---\nname: base-skill\n---\n# Base content',
      }
    );

    const result = buildSkillContext('myagent', root);
    expect(result).not.toBeNull();
    expect(result).toContain('base-skill');
  });

  it('extraSkills 為空陣列時行為與原本一致', () => {
    const root = createTmpPlugin(
      {
        myagent: '---\nname: myagent\nskills:\n  - base-skill\n---\nBody',
      },
      {
        'base-skill': '---\nname: base-skill\n---\n# Base content',
      }
    );

    const result = buildSkillContext('myagent', root, { extraSkills: [] });
    expect(result).not.toBeNull();
    expect(result).toContain('base-skill');
  });
});

// ── Feature 2: pre-task [EXTRA_SKILLS:] header 解析 ──

describe('[EXTRA_SKILLS: ...] header 解析邏輯', () => {
  // 直接測試解析邏輯（從 prompt 擷取 skill 名稱）
  function parseExtraSkills(prompt) {
    const extraSkills = [];
    const match = (prompt || '').match(/\[EXTRA_SKILLS:\s*([^\]]+)\]/);
    if (match) {
      match[1].split(',').forEach(s => {
        const name = s.trim();
        if (name) extraSkills.push(name);
      });
    }
    return extraSkills;
  }

  it('正確解析單一 skill', () => {
    const result = parseExtraSkills('[EXTRA_SKILLS: security-kb]\n請審查這段程式碼');
    expect(result).toEqual(['security-kb']);
  });

  it('正確解析多個 skills（逗號分隔）', () => {
    const result = parseExtraSkills('[EXTRA_SKILLS: security-kb, database, thinking]\n請審查...');
    expect(result).toEqual(['security-kb', 'database', 'thinking']);
  });

  it('prompt 無 [EXTRA_SKILLS:] 時回傳空陣列', () => {
    const result = parseExtraSkills('這是一個普通的 prompt，沒有 extra skills');
    expect(result).toEqual([]);
  });

  it('prompt 為 undefined 時回傳空陣列', () => {
    const result = parseExtraSkills(undefined);
    expect(result).toEqual([]);
  });

  it('忽略空白 skill 名稱', () => {
    const result = parseExtraSkills('[EXTRA_SKILLS: security-kb, , thinking]');
    expect(result).toEqual(['security-kb', 'thinking']);
  });

  it('header 前後有空白時正確 trim', () => {
    const result = parseExtraSkills('[EXTRA_SKILLS:  security-kb  ,  database  ]');
    expect(result).toEqual(['security-kb', 'database']);
  });
});
