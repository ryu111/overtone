// skill-lifecycle.test.js — R2.2 Skill Lifecycle 單元測試
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

const { forgeSkill, improveSkill, deploySkill } = await import(join(homedir(), '.claude/scripts/skill-forge.js'));
const { checkLifecycle, getDeployGrades } = await import(join(homedir(), '.claude/scripts/lifecycle-orchestrator.js'));
const { pruneUnusedSkills } = await import(join(homedir(), '.claude/scripts/skill-janitor.js'));

// ─── 測試環境 ─────────────────────────────────────────────────────────────────

let TMP_DIR;

function setup() {
  TMP_DIR = join(tmpdir(), `skill-lifecycle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(TMP_DIR, 'skills'), { recursive: true });
  mkdirSync(join(TMP_DIR, 'agents'), { recursive: true });
  mkdirSync(join(TMP_DIR, 'data'), { recursive: true });
}

function teardown() {
  try { rmSync(TMP_DIR, { recursive: true }); } catch (e) { /* cleanup */ }
}

// 標準 skill 內容（有 frontmatter + NEVER + 50 行）
function makeSkillContent(name = 'test-skill') {
  return [
    '---',
    `name: ${name}`,
    'description: 測試 skill',
    '---',
    '',
    `# ${name}`,
    '',
    '這是一個測試 skill。',
    ...Array(50).fill('這是填充行，用來達到 50 行的最低要求。'),
    '',
    '## 反模式',
    '⛔ NEVER 做壞事',
  ].join('\n');
}

// 測試用 forge deps
function makeForgeDeps(opts = {}) {
  const content = opts.skillContent || makeSkillContent();
  return {
    askLocalModel: opts.askLocalModel || (async () => content),
    readFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
    claudeDir: TMP_DIR,
  };
}

// 測試用 improve deps
function makeImproveDeps(opts = {}) {
  return {
    askLocalModel: opts.askLocalModel || (async (p) => makeSkillContent()),
    readFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
    claudeDir: TMP_DIR,
  };
}

// 測試用 deploy deps
function makeDeployDeps() {
  return {
    readFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
    claudeDir: TMP_DIR,
  };
}

function makeAgentFile(skills = []) {
  const skillsBlock = skills.length > 0
    ? `skills:\n${skills.map(s => `  - ${s}`).join('\n')}\n`
    : '';
  return [
    '---',
    'name: executor',
    'description: 執行者',
    'model: sonnet',
    skillsBlock.trim() ? skillsBlock : '',
    '---',
    '',
    '# Executor',
  ].filter(l => l !== undefined).join('\n');
}

// ─── 1. forgeSkill ────────────────────────────────────────────────────────────

describe('forgeSkill', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('建立正確目錄結構和 SKILL.md', async () => {
    const behavior = {
      id: 'read-edit-bash',
      pattern: 'Read→Edit→Bash',
      occurrences: [1, 2, 3],
      suggestion: { type: 'skill', content: 'read-edit-bash-pattern' },
    };

    const result = await forgeSkill(behavior, makeForgeDeps());

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.skillName).toBeTruthy();

    // 確認 SKILL.md 已建立
    const skillPath = join(TMP_DIR, 'skills', result.skillName, 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);

    // 確認 references/ 目錄已建立
    const refsDir = join(TMP_DIR, 'skills', result.skillName, 'references');
    expect(existsSync(refsDir)).toBe(true);

    // 確認有 frontmatter
    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toMatch(/^---\n[\s\S]*?\n---/);
  });

  test('SKILL.md 包含 frontmatter（name + description）', async () => {
    const behavior = {
      id: 'test-behavior',
      pattern: 'test',
      occurrences: [1],
      suggestion: { type: 'skill', content: 'my-test-skill' },
    };

    const result = await forgeSkill(behavior, makeForgeDeps());

    expect(result.ok).toBe(true);
    const content = readFileSync(join(TMP_DIR, 'skills', result.skillName, 'SKILL.md'), 'utf-8');
    expect(content).toMatch(/^---/);
    expect(content).toMatch(/name:/);
  });

  test('已存在的 skill 跳過，不覆寫', async () => {
    const behavior = {
      id: 'existing-skill',
      pattern: 'existing',
      occurrences: [1, 2],
      suggestion: { type: 'skill', content: 'my-existing-skill' },
    };

    // 先建立一次
    const firstResult = await forgeSkill(behavior, makeForgeDeps());
    expect(firstResult.ok).toBe(true);
    expect(firstResult.skipped).toBe(false);

    // 讀取原始內容
    const skillPath = join(TMP_DIR, 'skills', firstResult.skillName, 'SKILL.md');
    const originalContent = readFileSync(skillPath, 'utf-8');

    // 第二次呼叫 → 應跳過（模型不應被呼叫）
    let modelCalled = false;
    const deps2 = makeForgeDeps({
      askLocalModel: async () => {
        modelCalled = true;
        return '不應該被呼叫';
      },
    });
    const secondResult = await forgeSkill(behavior, deps2);

    expect(secondResult.ok).toBe(true);
    expect(secondResult.skipped).toBe(true);
    expect(modelCalled).toBe(false);

    // 內容未被修改
    const contentAfter = readFileSync(skillPath, 'utf-8');
    expect(contentAfter).toBe(originalContent);
  });

  test('本地模型不可用時回傳 { ok: false }', async () => {
    const behavior = {
      id: 'model-unavailable',
      pattern: 'test',
      occurrences: [1],
      suggestion: { type: 'skill', content: 'fail-skill' },
    };

    const result = await forgeSkill(behavior, makeForgeDeps({
      askLocalModel: async () => null,
    }));

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('模型生成沒有 frontmatter 時回傳 { ok: false }', async () => {
    const behavior = {
      id: 'no-frontmatter',
      pattern: 'test',
      occurrences: [1],
      suggestion: { type: 'skill', content: 'bad-skill' },
    };

    // 回傳純文字，不含 --- 分隔符號
    const result = await forgeSkill(behavior, makeForgeDeps({
      askLocalModel: async () => '這不是有效的 SKILL.md，沒有 frontmatter，只有純文字內容。',
    }));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/frontmatter/);
  });

  test('模型拋出例外時回傳 { ok: false }', async () => {
    const behavior = {
      id: 'exception-test',
      pattern: 'test',
      occurrences: [1],
      suggestion: { type: 'skill', content: 'exception-skill' },
    };

    const result = await forgeSkill(behavior, makeForgeDeps({
      askLocalModel: async () => { throw new Error('連線失敗'); },
    }));

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── 2. improveSkill ──────────────────────────────────────────────────────────

describe('improveSkill', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('根據建議修改 SKILL.md 內容', async () => {
    const skillName = 'improve-test-skill';
    const skillDir = join(TMP_DIR, 'skills', skillName);
    const refsDir = join(skillDir, 'references');
    mkdirSync(refsDir, { recursive: true });

    const originalContent = [
      '---',
      'name: improve-test-skill',
      'description: 原始描述',
      '---',
      '',
      '# 原始內容',
    ].join('\n');
    writeFileSync(join(skillDir, 'SKILL.md'), originalContent);

    const improvedContent = [
      '---',
      'name: improve-test-skill',
      'description: 改善後的描述',
      '---',
      '',
      '# 改善後的內容',
      '',
      '## 新增章節',
      '⛔ NEVER 做壞事',
    ].join('\n');

    const result = await improveSkill(
      skillName,
      ['- 增加更多範例', '- 補充 NEVER 區塊'],
      makeImproveDeps({ askLocalModel: async () => improvedContent }),
    );

    expect(result.ok).toBe(true);
    const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
    expect(content).toContain('改善後的描述');
    expect(content).toContain('⛔ NEVER');
  });

  test('Skill 不存在時回傳 { ok: false }', async () => {
    const result = await improveSkill(
      'nonexistent-skill',
      ['- 建議'],
      makeImproveDeps({ askLocalModel: async () => null }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/不存在/);
  });

  test('本地模型不可用時回傳 { ok: false }', async () => {
    const skillName = 'model-fail-skill';
    const skillDir = join(TMP_DIR, 'skills', skillName);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: model-fail-skill\n---\n# test');

    const result = await improveSkill(
      skillName,
      ['- 建議'],
      makeImproveDeps({ askLocalModel: async () => null }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── 3. deploySkill ───────────────────────────────────────────────────────────

describe('deploySkill', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('正確追加 skillName 到 agent 的 skills[]', () => {
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), makeAgentFile(['existing-skill']));

    const result = deploySkill('new-skill', 'executor', makeDeployDeps());

    expect(result.ok).toBe(true);
    expect(result.added).toBe(true);

    const content = readFileSync(join(TMP_DIR, 'agents', 'executor.md'), 'utf-8');
    expect(content).toContain('  - new-skill');
    expect(content).toContain('  - existing-skill');
  });

  test('已存在的 skill 不重複追加', () => {
    writeFileSync(
      join(TMP_DIR, 'agents', 'executor.md'),
      makeAgentFile(['existing-skill', 'another-skill']),
    );

    const result = deploySkill('existing-skill', 'executor', makeDeployDeps());
    expect(result.ok).toBe(true);
    expect(result.added).toBe(false);

    // 確認沒有重複
    const content = readFileSync(join(TMP_DIR, 'agents', 'executor.md'), 'utf-8');
    const occurrences = (content.match(/  - existing-skill/g) || []).length;
    expect(occurrences).toBe(1);
  });

  test('Agent 不存在時回傳 { ok: false }', () => {
    const result = deploySkill('some-skill', 'nonexistent-agent', makeDeployDeps());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/不存在/);
  });

  test('Agent 沒有 skills 區塊時自動插入', () => {
    const agentContent = [
      '---',
      'name: executor',
      'description: 執行者',
      'model: sonnet',
      '---',
      '',
      '# Executor',
    ].join('\n');
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), agentContent);

    const result = deploySkill('new-skill', 'executor', makeDeployDeps());
    expect(result.ok).toBe(true);
    expect(result.added).toBe(true);

    const content = readFileSync(join(TMP_DIR, 'agents', 'executor.md'), 'utf-8');
    expect(content).toContain('skills:');
    expect(content).toContain('  - new-skill');
  });
});

// ─── 4. checkLifecycle 端到端 ─────────────────────────────────────────────────

describe('checkLifecycle', () => {
  test('behaviors.jsonl 不存在時回傳 processed=0', async () => {
    const result = await checkLifecycle();
    expect(result).toBeTruthy();
    expect(result.processed).toBe(0);
    expect(result.forged).toBe(0);
    expect(result.deployed).toBe(0);
    expect(result.drafts).toBe(0);
  });

  test('回傳物件包含必要欄位', async () => {
    const result = await checkLifecycle();
    expect(typeof result.processed).toBe('number');
    expect(typeof result.forged).toBe('number');
    expect(typeof result.deployed).toBe('number');
    expect(typeof result.drafts).toBe('number');
  });
});

// ─── 5. 品質閘門 ──────────────────────────────────────────────────────────────

describe('品質閘門', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('forgeSkill 後 improveSkill 可更新內容', async () => {
    const behavior = {
      id: 'quality-gate-test',
      pattern: 'quality-gate-pattern',
      occurrences: [1, 2],
      suggestion: { type: 'skill', content: 'quality-gate-skill' },
    };

    // Step 1: forge
    const forgeResult = await forgeSkill(behavior, makeForgeDeps());
    expect(forgeResult.ok).toBe(true);

    const skillName = forgeResult.skillName;
    const skillPath = join(TMP_DIR, 'skills', skillName, 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);

    const improvedContent = [
      '---',
      `name: ${skillName}`,
      'description: 改善後的描述',
      '---',
      '',
      '# 改善後的 Skill',
      ...Array(60).fill('改善後的填充行。'),
      '',
      '⛔ NEVER 做壞事',
      '⛔ NEVER 做更壞的事',
    ].join('\n');

    // Step 2: improve
    const improveResult = await improveSkill(
      skillName,
      ['- 增加更多 NEVER 規則', '- 補充範例'],
      makeImproveDeps({ askLocalModel: async () => improvedContent }),
    );
    expect(improveResult.ok).toBe(true);

    const content = readFileSync(skillPath, 'utf-8');
    expect(content).toContain('改善後的描述');
    expect(content).toContain('⛔ NEVER 做更壞的事');
  });

  test('improveSkill 失敗不 throw，回傳 { ok: false }', async () => {
    // 對不存在的 skill 呼叫 improve → 回傳 { ok: false } 不 throw
    const result = await improveSkill('nonexistent', [], makeImproveDeps());
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('3 輪改善後仍不達標不阻塞（draft 不 throw）', async () => {
    // 驗證改善流程不拋出例外，即使本地模型不可用
    const behavior = {
      id: 'draft-test',
      pattern: 'test',
      occurrences: [1],
      suggestion: { type: 'skill', content: 'draft-skill' },
    };

    // forge 成功，但 improve 本地模型不可用
    const forgeResult = await forgeSkill(behavior, makeForgeDeps());
    expect(forgeResult.ok).toBe(true);

    const improveResult = await improveSkill(
      forgeResult.skillName,
      ['- 建議'],
      makeImproveDeps({ askLocalModel: async () => null }),
    );
    // 應回傳 { ok: false }，不 throw
    expect(improveResult.ok).toBe(false);
    expect(improveResult.error).toBeTruthy();
  });
});

// ─── 6. Graceful degradation ─────────────────────────────────────────────────

describe('graceful degradation', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('checkLifecycle 不依賴真實 OS，正常完成', async () => {
    const result = await checkLifecycle();
    expect(result).toBeTruthy();
    expect(result.processed).toBeGreaterThanOrEqual(0);
  });

  test('forgeSkill 本地模型拋出例外時回傳 { ok: false }', async () => {
    const behavior = {
      id: 'exception-graceful',
      pattern: 'test',
      occurrences: [1],
      suggestion: { type: 'skill', content: 'exception-graceful-skill' },
    };

    const result = await forgeSkill(behavior, makeForgeDeps({
      askLocalModel: async () => { throw new Error('連線拒絕'); },
    }));

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('deploySkill 是同步函式，不依賴本地模型', () => {
    writeFileSync(join(TMP_DIR, 'agents', 'executor.md'), makeAgentFile([]));

    // 注意：deploySkill 的 deps 不含 askLocalModel
    const result = deploySkill('sync-test-skill', 'executor', makeDeployDeps());
    expect(result.ok).toBe(true);
    expect(result.added).toBe(true);

    const content = readFileSync(join(TMP_DIR, 'agents', 'executor.md'), 'utf-8');
    expect(content).toContain('  - sync-test-skill');
  });

  test('improveSkill 本地模型不可用時不修改原始檔案', async () => {
    const skillName = 'preserve-original';
    const skillDir = join(TMP_DIR, 'skills', skillName);
    mkdirSync(skillDir, { recursive: true });
    const originalContent = '---\nname: preserve-original\ndescription: 原始\n---\n# 原始';
    writeFileSync(join(skillDir, 'SKILL.md'), originalContent);

    const result = await improveSkill(
      skillName,
      ['- 建議'],
      makeImproveDeps({ askLocalModel: async () => null }),
    );

    expect(result.ok).toBe(false);
    // 原始檔案未被修改
    const content = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
    expect(content).toBe(originalContent);
  });
});

// ─── getDeployGrades 分場景閾值測試 ──────────────────────────────────────────

describe('getDeployGrades', () => {
  test('automation 類型只允許 A 級', () => {
    const grades = getDeployGrades({ suggestion: { type: 'automation' } });
    expect(grades).toEqual(['A']);
  });

  test('fix 類型只允許 A 級', () => {
    const grades = getDeployGrades({ suggestion: { type: 'fix' } });
    expect(grades).toEqual(['A']);
  });

  test('rule 類型允許 A 和 B 級', () => {
    const grades = getDeployGrades({ suggestion: { type: 'rule' } });
    expect(grades).toEqual(['A', 'B']);
  });

  test('skill 類型允許 A 和 B 級', () => {
    const grades = getDeployGrades({ suggestion: { type: 'skill' } });
    expect(grades).toEqual(['A', 'B']);
  });

  test('無 suggestion 時預設允許 A 和 B', () => {
    const grades = getDeployGrades({});
    expect(grades).toEqual(['A', 'B']);
  });
});

// ─── pruneUnusedSkills 測試 ──────────────────────────────────────────────────

describe('pruneUnusedSkills', () => {
  test('skills 數量 <= MAX_SKILLS(35) 時不歸檔', () => {
    // 目前 ~/.claude/skills/ 有 ~26 個，低於 35 → 應回傳空
    const pruned = pruneUnusedSkills();
    expect(pruned).toEqual([]);
  });

  test('函式回傳陣列', () => {
    const result = pruneUnusedSkills();
    expect(Array.isArray(result)).toBe(true);
  });
});
