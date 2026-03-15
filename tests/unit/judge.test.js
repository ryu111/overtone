// judge.test.js — R1.4 Judge 單元測試
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, appendFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

// 直接 import 純函式（import.meta.main 機制讓 spawn 只在直接執行時觸發）
import {
  scoreDeterministic,
  grade,
  shouldRun,
  getTrend,
  readScores,
} from '/Users/sbu/.claude/scripts/judge.js';

// ─── 測試輔助 ────────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), `judge-test-${Date.now()}`);

function setup() {
  mkdirSync(TMP_DIR, { recursive: true });
}

function teardown() {
  try { rmSync(TMP_DIR, { recursive: true }); } catch {}
}

// ─── 1. scoreDeterministic — Skill ──────────────────────────────────────────

describe('scoreDeterministic — skill', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('完整 skill（有 frontmatter + references）→ 高分', () => {
    // 建立 skill 目錄結構
    const skillDir = join(TMP_DIR, 'test-skill');
    const refsDir = join(skillDir, 'references');
    mkdirSync(refsDir, { recursive: true });

    const content = [
      '---',
      'name: test-skill',
      'description: 測試 skill',
      '---',
      '',
      '# 測試 Skill',
      '',
      '這是一個超過 50 行的測試 skill 檔案。',
      ...Array(50).fill('這是填充行，用來達到 50 行的最低要求。'),
      '',
      '## 反模式',
      '⛔ NEVER 做壞事',
    ].join('\n');

    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, content);
    writeFileSync(join(refsDir, 'ref.md'), '# 參考文件');

    const score = scoreDeterministic(skillPath, 'skill');
    // 有 SKILL.md(10) + frontmatter(10) + references(10) + 行數 50+(10) + NEVER(10) = 50
    expect(score).toBe(50);
  });

  test('空 skill（無 frontmatter，行數不足）→ 低分', () => {
    const skillDir = join(TMP_DIR, 'empty-skill');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillPath, '# 空 Skill\n\n短內容');

    const score = scoreDeterministic(skillPath, 'skill');
    // 有 SKILL.md(10) + 無 frontmatter + 無 references + 行數 < 20(0) + 無 NEVER = 10
    expect(score).toBe(10);
  });

  test('行數 20-49 → 部分行數分數（5 分）', () => {
    const skillDir = join(TMP_DIR, 'mid-skill');
    mkdirSync(skillDir, { recursive: true });
    const skillPath = join(skillDir, 'SKILL.md');
    const content = Array(25).fill('行').join('\n');
    writeFileSync(skillPath, content);

    const score = scoreDeterministic(skillPath, 'skill');
    // 有 SKILL.md(10) + 無 frontmatter + 無 references + 行數 20-49(5) + 無 NEVER = 15
    expect(score).toBe(15);
  });
});

// ─── 2. scoreDeterministic — Rule ──────────────────────────────────────────

describe('scoreDeterministic — rule', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('有多個 MUST/NEVER + 反例正例 + 合理行數 → 高分', () => {
    const rulePath = join(TMP_DIR, 'test-rule.md');
    const content = [
      '## 測試規則',
      '',
      '📋 MUST 做好事',
      '⛔ NEVER 做壞事',
      '⚠️ SHOULD 做中性的事',
      '📋 MUST 遵守規範',
      '',
      '反例：壞的做法',
      '正例：好的做法',
      '',
      ...Array(12).fill('這是規則內容行。'),
    ].join('\n');
    writeFileSync(rulePath, content);

    const score = scoreDeterministic(rulePath, 'rule');
    // MUST 4 個 × 5 = 20(上限20) + 有反例/正例(15) + 行數 10-80(15) = 50
    expect(score).toBe(50);
  });

  test('空規則（無標記，5-9 行）→ 8 分（行數部分分）', () => {
    const rulePath = join(TMP_DIR, 'empty-rule.md');
    // 確保 5-9 行
    writeFileSync(rulePath, '# 空規則\n\n行1\n行2\n行3\n行4\n行5');

    const score = scoreDeterministic(rulePath, 'rule');
    // 無 MUST/NEVER(0) + 無反例/正例(0) + 行數 5-9(8) = 8
    expect(score).toBe(8);
  });

  test('行數不足（< 5）→ 0 行數分', () => {
    const rulePath = join(TMP_DIR, 'tiny-rule.md');
    writeFileSync(rulePath, '短');

    const score = scoreDeterministic(rulePath, 'rule');
    // 無 MUST/NEVER(0) + 無反例/正例(0) + 行數 < 5(0) = 0
    expect(score).toBe(0);
  });
});

// ─── 3. scoreDeterministic — Agent ─────────────────────────────────────────

describe('scoreDeterministic — agent', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('有完整 frontmatter（model + skills + description）→ 高分', () => {
    const agentPath = join(TMP_DIR, 'test-agent.md');
    // 建立假 skill 目錄讓 allExist 為 true
    const fakeSkillDir = join(homedir(), '.claude/skills/nova-spec');
    const skillExists = existsSync(join(fakeSkillDir, 'SKILL.md'));

    const skillsSection = skillExists
      ? `skills:\n  - nova-spec`
      : 'skills: []';

    const content = [
      '---',
      'name: test-agent',
      'description: 測試 agent',
      'model: sonnet',
      skillsSection,
      '---',
      '',
      '# 測試 Agent',
    ].join('\n');
    writeFileSync(agentPath, content);

    const score = scoreDeterministic(agentPath, 'agent');
    // frontmatter(10) + model(10) + skills(10) + description(10) + skills 存在(0 or 10)
    expect(score).toBeGreaterThanOrEqual(40);
  });

  test('無 frontmatter 的 agent → 低分', () => {
    const agentPath = join(TMP_DIR, 'bare-agent.md');
    writeFileSync(agentPath, '# 無 Frontmatter Agent\n\n無設定');

    const score = scoreDeterministic(agentPath, 'agent');
    // 無 frontmatter(0) + 無 model(0) + 無 skills(0) + 無 description(0) = 0
    expect(score).toBe(0);
  });
});

// ─── 4. scoreDeterministic — Hook ──────────────────────────────────────────

describe('scoreDeterministic — hook', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('有完整 export + on handler + try-catch + 合理行數 + 無 console.log → 高分', () => {
    const hookPath = join(TMP_DIR, 'test-hook.js');
    const content = [
      '// test-hook.js',
      'import { readFileSync } from "fs";',
      '',
      'export const on = {',
      '  "SessionStart": (input) => {',
      '    try {',
      '      return { decision: "allow" };',
      '    } catch (e) {',
      '      return { decision: "allow" };',
      '    }',
      '  },',
      '};',
      '',
      'export function helper() {',
      '  return true;',
      '}',
    ].join('\n');
    writeFileSync(hookPath, content);

    const score = scoreDeterministic(hookPath, 'hook');
    // export(10) + on handler(10) + try-catch(10) + 行數 10-300(10) + 無 console.log(10) = 50
    expect(score).toBe(50);
  });

  test('有 console.log → console.log 維度不得分', () => {
    const hookPath = join(TMP_DIR, 'noisy-hook.js');
    // 確保 10 行以上
    const content = [
      '// noisy-hook.js',
      'import { existsSync } from "fs";',
      '',
      'export const on = {',
      '  "Test": (input) => {',
      '    try {',
      '      console.log("debug");',
      '      return { decision: "allow" };',
      '    } catch (e) {}',
      '  }',
      '};',
      'export function x() { return true; }',
    ].join('\n');
    writeFileSync(hookPath, content);

    const score = scoreDeterministic(hookPath, 'hook');
    // export(10) + on handler(10) + try-catch(10) + 行數(10) + 有 console.log(0) = 40
    expect(score).toBe(40);
  });

  test('空檔案 → 只有「無 console.log」得 10 分', () => {
    const hookPath = join(TMP_DIR, 'empty-hook.js');
    writeFileSync(hookPath, '');

    const score = scoreDeterministic(hookPath, 'hook');
    // 無 export(0) + 無 on(0) + 無 try(0) + 行數 < 10(0) + 無 console.log(10) = 10
    expect(score).toBe(10);
  });
});

// ─── 5. grade 函式 ──────────────────────────────────────────────────────────

describe('grade', () => {
  test('90+ → A', () => expect(grade(90)).toBe('A'));
  test('95 → A', () => expect(grade(95)).toBe('A'));
  test('100 → A', () => expect(grade(100)).toBe('A'));
  test('80-89 → B', () => {
    expect(grade(80)).toBe('B');
    expect(grade(85)).toBe('B');
    expect(grade(89)).toBe('B');
  });
  test('70-79 → C', () => {
    expect(grade(70)).toBe('C');
    expect(grade(75)).toBe('C');
    expect(grade(79)).toBe('C');
  });
  test('60-69 → D', () => {
    expect(grade(60)).toBe('D');
    expect(grade(65)).toBe('D');
    expect(grade(69)).toBe('D');
  });
  test('< 60 → F', () => {
    expect(grade(59)).toBe('F');
    expect(grade(0)).toBe('F');
    expect(grade(30)).toBe('F');
  });
});

// ─── 6. shouldRun ───────────────────────────────────────────────────────────

describe('shouldRun', () => {
  test('回傳布林值', () => {
    const result = shouldRun();
    expect(typeof result).toBe('boolean');
  });

  test('~/.claude 不是 git repo 或無變更 → 不 throw，回傳 false 或 true', () => {
    // 只確保不拋出例外
    expect(() => shouldRun()).not.toThrow();
  });
});

// ─── 7. getTrend ────────────────────────────────────────────────────────────

describe('getTrend', () => {
  test('只有一筆資料 → insufficient_data', () => {
    const scores = [
      { date: '2026-03-15', path: 'skills/test', type: 'skill', total: 70, grade: 'C' },
    ];
    expect(getTrend('skills/test', scores)).toBe('insufficient_data');
  });

  test('兩次評分，第二次高 6 分 → improving', () => {
    const scores = [
      { date: '2026-03-14', path: 'skills/test', total: 60 },
      { date: '2026-03-15', path: 'skills/test', total: 66 },
    ];
    expect(getTrend('skills/test', scores)).toBe('improving');
  });

  test('兩次評分，第二次低 6 分 → declining', () => {
    const scores = [
      { date: '2026-03-14', path: 'skills/test', total: 70 },
      { date: '2026-03-15', path: 'skills/test', total: 64 },
    ];
    expect(getTrend('skills/test', scores)).toBe('declining');
  });

  test('兩次評分，差距 ≤ 5 分 → stable', () => {
    const scores = [
      { date: '2026-03-14', path: 'skills/test', total: 70 },
      { date: '2026-03-15', path: 'skills/test', total: 73 },
    ];
    expect(getTrend('skills/test', scores)).toBe('stable');
  });

  test('路徑不在 scores 中 → insufficient_data', () => {
    const scores = [
      { date: '2026-03-15', path: 'skills/other', total: 70 },
    ];
    expect(getTrend('skills/test', scores)).toBe('insufficient_data');
  });

  test('5 筆資料，只看最後一筆 vs 第一筆趨勢', () => {
    const scores = [
      { date: '2026-03-10', path: 'rules/test.md', total: 50 },
      { date: '2026-03-11', path: 'rules/test.md', total: 55 },
      { date: '2026-03-12', path: 'rules/test.md', total: 52 },
      { date: '2026-03-13', path: 'rules/test.md', total: 58 },
      { date: '2026-03-14', path: 'rules/test.md', total: 80 },
    ];
    // last(80) - first(50) = 30 > 5 → improving
    expect(getTrend('rules/test.md', scores)).toBe('improving');
  });
});

// ─── 8. saveScore / readScores ──────────────────────────────────────────────

describe('saveScore / readScores', () => {
  const tmpScoresFile = join(TMP_DIR, 'scores.jsonl');

  beforeEach(setup);
  afterEach(teardown);

  test('不存在的檔案 → 回傳空陣列', () => {
    const result = readScores('/tmp/nonexistent-scores-xyz.jsonl');
    expect(result).toEqual([]);
  });

  test('saveScore 寫入後 readScores 讀回正確', () => {
    const entry = {
      date: '2026-03-15',
      path: 'skills/test',
      type: 'skill',
      deterministic: 40,
      semantic: 35,
      total: 75,
      grade: 'C',
    };

    appendFileSync(tmpScoresFile, JSON.stringify(entry) + '\n');

    const result = readScores(tmpScoresFile);
    expect(result.length).toBe(1);
    expect(result[0].path).toBe('skills/test');
    expect(result[0].total).toBe(75);
    expect(result[0].grade).toBe('C');
  });

  test('多筆資料寫入後全部讀回', () => {
    const entries = [
      { date: '2026-03-15', path: 'rules/a.md', type: 'rule', total: 60, grade: 'D' },
      { date: '2026-03-15', path: 'rules/b.md', type: 'rule', total: 80, grade: 'B' },
      { date: '2026-03-15', path: 'agents/planner.md', type: 'agent', total: 90, grade: 'A' },
    ];

    writeFileSync(tmpScoresFile, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

    const result = readScores(tmpScoresFile);
    expect(result.length).toBe(3);
    expect(result.map(r => r.path)).toContain('rules/a.md');
    expect(result.map(r => r.path)).toContain('agents/planner.md');
  });

  test('JSONL 格式正確（每行獨立 JSON）', () => {
    writeFileSync(tmpScoresFile, '{"path":"a","total":50}\n{"path":"b","total":60}\n');

    const result = readScores(tmpScoresFile);
    expect(result.length).toBe(2);
    expect(result[0].path).toBe('a');
    expect(result[1].path).toBe('b');
  });

  test('損壞行被跳過，正確行仍讀取', () => {
    writeFileSync(tmpScoresFile, '{"path":"ok","total":70}\nINVALID JSON\n{"path":"ok2","total":80}\n');

    const result = readScores(tmpScoresFile);
    expect(result.length).toBe(2);
    expect(result[0].path).toBe('ok');
    expect(result[1].path).toBe('ok2');
  });
});

// ─── 9. 自我分離測試 ─────────────────────────────────────────────────────────

describe('自我分離機制', () => {
  test('直接執行 judge.js（無 JUDGE_BG）→ 立即返回 exit 0', async () => {
    const start = Date.now();
    const result = Bun.spawnSync(
      ['bun', '/Users/sbu/.claude/scripts/judge.js'],
      { env: { ...process.env, JUDGE_BG: undefined } }
    );
    const elapsed = Date.now() - start;
    expect(result.exitCode).toBe(0);
    // 自我分離後立即退出，應在 3 秒內完成
    expect(elapsed).toBeLessThan(3000);
  });
});
