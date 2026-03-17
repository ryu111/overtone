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
  saveScore,
  resolveSemanticScore,
  deduplicateImprovements,
  deduplicateScores,
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

// ─── 9. resolveSemanticScore ──────────────────────────────────────────────────

describe('resolveSemanticScore', () => {
  const noopLog = () => {};
  const logMessages = [];
  const captureLog = (msg) => logMessages.push(msg);

  beforeEach(() => { logMessages.length = 0; });

  test('模型成功（sem.total > 0）→ 直接使用新分數', () => {
    const sem = { knowledge: 10, clarity: 15, total: 40 };
    const result = resolveSemanticScore(sem, 'skills/test', [], noopLog);
    expect(result).toBe(40);
  });

  test('模型失敗（sem === null）+ 有歷史分數 → 使用歷史分數', () => {
    const existingScores = [
      { path: 'skills/test', semantic: 35, total: 75 },
      { path: 'skills/other', semantic: 40, total: 80 },
    ];
    const result = resolveSemanticScore(null, 'skills/test', existingScores, captureLog);
    expect(result).toBe(35);
    expect(logMessages[0]).toContain('歷史語意分數 35');
  });

  test('模型失敗（sem === null）+ 無歷史分數 → 回傳 null', () => {
    const result = resolveSemanticScore(null, 'skills/new', [], noopLog);
    expect(result).toBeNull();
  });

  test('模型回傳 total=0（視為失敗）+ 有歷史 → 使用歷史', () => {
    const sem = { total: 0 };
    const existingScores = [
      { path: 'rules/test.md', semantic: 40, total: 75 },
    ];
    const result = resolveSemanticScore(sem, 'rules/test.md', existingScores, captureLog);
    expect(result).toBe(40);
  });

  test('多筆歷史 → 使用最新的有效分數', () => {
    const existingScores = [
      { path: 'hooks/modules/guard.js', semantic: 20, total: 60 },
      { path: 'hooks/modules/guard.js', semantic: 0, total: 40 },
      { path: 'hooks/modules/guard.js', semantic: 35, total: 75 },
    ];
    const result = resolveSemanticScore(null, 'hooks/modules/guard.js', existingScores, captureLog);
    // 從最新往回找，第一個 semantic > 0 是 35
    expect(result).toBe(35);
  });

  test('歷史分數全為 0 → 回傳 null', () => {
    const existingScores = [
      { path: 'skills/bad', semantic: 0, total: 30 },
      { path: 'skills/bad', semantic: 0, total: 25 },
    ];
    const result = resolveSemanticScore(null, 'skills/bad', existingScores, noopLog);
    expect(result).toBeNull();
  });

  test('其他元件的歷史分數不會被使用', () => {
    const existingScores = [
      { path: 'skills/other', semantic: 45, total: 90 },
    ];
    const result = resolveSemanticScore(null, 'skills/target', existingScores, noopLog);
    expect(result).toBeNull();
  });
});

// ─── 10. 自我分離測試 ────────────────────────────────────────────────────────

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

// ─── saveScore 測試 ──────────────────────────────────────────────────────────

describe('saveScore', () => {
  test('寫入 JSONL 並可被 readScores 讀回', () => {
    const file = join(TMP_DIR, 'save-test-scores.jsonl');
    const entry = { date: '2026-03-17', path: 'test/file.js', total: 85, grade: 'B' };

    saveScore(entry, file);

    const scores = readScores(file);
    expect(scores).toHaveLength(1);
    expect(scores[0].total).toBe(85);
    expect(scores[0].grade).toBe('B');
  });

  test('多次寫入追加而非覆蓋', () => {
    const file = join(TMP_DIR, 'save-append-scores.jsonl');

    saveScore({ date: '2026-03-17', path: 'a.js', total: 90, grade: 'A' }, file);
    saveScore({ date: '2026-03-17', path: 'b.js', total: 60, grade: 'D' }, file);

    const scores = readScores(file);
    expect(scores).toHaveLength(2);
    expect(scores[0].path).toBe('a.js');
    expect(scores[1].path).toBe('b.js');
  });

  test('目錄不存在時自動建立', () => {
    const file = join(TMP_DIR, 'nested', 'deep', 'scores.jsonl');
    saveScore({ date: '2026-03-17', path: 'x.js', total: 70 }, file);

    const scores = readScores(file);
    expect(scores).toHaveLength(1);
    expect(scores[0].path).toBe('x.js');
  });
});

// ─── 8. deduplicateImprovements ─────────────────────────────────────────────

// ─── 11. deduplicateScores ──────────────────────────────────────────────────

describe('deduplicateScores', () => {
  test('同 path+date 只保留最新一筆', () => {
    const entries = [
      { date: '2026-03-16', path: 'skills/a', total: 70 },
      { date: '2026-03-16', path: 'skills/a', total: 85 },
      { date: '2026-03-16', path: 'skills/b', total: 60 },
    ];
    const result = deduplicateScores(entries);
    expect(result).toHaveLength(2);
    expect(result.find(e => e.path === 'skills/a').total).toBe(85);
    expect(result.find(e => e.path === 'skills/b').total).toBe(60);
  });

  test('不同日期的同 path 各自保留', () => {
    const entries = [
      { date: '2026-03-15', path: 'skills/a', total: 70 },
      { date: '2026-03-16', path: 'skills/a', total: 85 },
    ];
    const result = deduplicateScores(entries);
    expect(result).toHaveLength(2);
    expect(result[0].total).toBe(70);
    expect(result[1].total).toBe(85);
  });

  test('結果按日期排序', () => {
    const entries = [
      { date: '2026-03-16', path: 'rules/b.md', total: 90 },
      { date: '2026-03-15', path: 'rules/a.md', total: 60 },
      { date: '2026-03-15', path: 'rules/b.md', total: 70 },
    ];
    const result = deduplicateScores(entries);
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2026-03-15');
    expect(result[1].date).toBe('2026-03-15');
    expect(result[2].date).toBe('2026-03-16');
  });

  test('10 倍重複 → 去重後只剩 1 筆（模擬實際 bug）', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      date: '2026-03-16',
      path: 'skills/skill-judge',
      total: 80 + i,
    }));
    const result = deduplicateScores(entries);
    expect(result).toHaveLength(1);
    // 保留最後一筆（total=89）
    expect(result[0].total).toBe(89);
  });

  test('空陣列回傳空陣列', () => {
    expect(deduplicateScores([])).toEqual([]);
  });

  test('大量去重後 getTrend 恢復正確趨勢偵測', () => {
    // 模擬：2026-03-15 有 1 筆，2026-03-16 有 10 筆重複
    const entries = [
      { date: '2026-03-15', path: 'skills/a', total: 60, semantic: 30 },
      ...Array.from({ length: 10 }, () => ({
        date: '2026-03-16', path: 'skills/a', total: 85, semantic: 40,
      })),
    ];
    // 去重前：getTrend 看到 last 5 都是 2026-03-16，first=last=85 → stable（錯誤）
    expect(getTrend('skills/a', entries)).toBe('stable');
    // 去重後：只剩 2 筆，60→85 → improving（正確）
    const deduped = deduplicateScores(entries);
    expect(getTrend('skills/a', deduped)).toBe('improving');
  });
});

describe('deduplicateImprovements', () => {
  test('同 path 只保留最新一筆', () => {
    const entries = [
      { path: 'a.js', score: 30, suggestions: ['old'] },
      { path: 'b.js', score: 40, suggestions: ['b1'] },
      { path: 'a.js', score: 50, suggestions: ['new'] },
    ];
    const result = deduplicateImprovements(entries);
    expect(result).toHaveLength(2);
    expect(result.find(e => e.path === 'a.js').score).toBe(50);
    expect(result.find(e => e.path === 'b.js').score).toBe(40);
  });

  test('保留順序（較早出現的 path 排前面）', () => {
    const entries = [
      { path: 'a.js', score: 10 },
      { path: 'b.js', score: 20 },
      { path: 'c.js', score: 30 },
      { path: 'a.js', score: 40 },
    ];
    const result = deduplicateImprovements(entries);
    expect(result.map(e => e.path)).toEqual(['b.js', 'c.js', 'a.js']);
  });

  test('超過 maxKeep 時截斷', () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({
      path: `file-${i}.js`, score: i,
    }));
    const result = deduplicateImprovements(entries, 10);
    expect(result).toHaveLength(10);
    expect(result[0].path).toBe('file-40.js');
  });

  test('空陣列回傳空陣列', () => {
    expect(deduplicateImprovements([])).toEqual([]);
  });
});
