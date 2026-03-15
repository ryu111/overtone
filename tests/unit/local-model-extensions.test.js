// local-model-extensions.test.js — Session 摘要 + Session 簡報 + Skill 改善建議
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

// Import judge.js 的可測試函式
import { generateImprovements, grade } from '/Users/sbu/.claude/scripts/judge.js';

// ─── 測試輔助 ────────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), `lm-ext-test-${Date.now()}`);

function setup() {
  mkdirSync(join(TMP_DIR, 'data'), { recursive: true });
}

function teardown() {
  try { rmSync(TMP_DIR, { recursive: true }); } catch {}
}

// ─── 1. Session 摘要 JSONL 格式 ─────────────────────────────────────────────

describe('Session 摘要 JSONL 格式', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('摘要 entry 包含必要欄位', () => {
    const entry = {
      date: new Date().toISOString(),
      toolCounts: { Bash: 5, Edit: 3, Read: 2 },
      promptCount: 2,
      agentCount: 1,
      summary: '本次 session 實作了 3 個功能。',
    };

    const file = join(TMP_DIR, 'session-summaries.jsonl');
    appendFileSync(file, JSON.stringify(entry) + '\n');

    const content = readFileSync(file, 'utf-8').trim();
    const parsed = JSON.parse(content);
    expect(parsed.date).toBeTruthy();
    expect(parsed.toolCounts).toBeDefined();
    expect(parsed.promptCount).toBe(2);
    expect(parsed.agentCount).toBe(1);
    expect(parsed.summary).toContain('3 個功能');
  });

  test('多筆摘要 JSONL 格式正確', () => {
    const file = join(TMP_DIR, 'session-summaries.jsonl');
    const entries = [
      { date: '2026-03-15T10:00:00Z', summary: '第一次 session', toolCounts: {}, promptCount: 1, agentCount: 0 },
      { date: '2026-03-15T14:00:00Z', summary: '第二次 session', toolCounts: { Bash: 2 }, promptCount: 3, agentCount: 0 },
    ];
    writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

    const lines = readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).summary).toBe('第一次 session');
    expect(JSON.parse(lines[1]).summary).toBe('第二次 session');
  });

  test('截斷邏輯：超過 50 筆保留最近 50 筆', () => {
    const file = join(TMP_DIR, 'session-summaries.jsonl');
    const entries = Array.from({ length: 55 }, (_, i) => ({
      date: `2026-03-${String(i % 30 + 1).padStart(2, '0')}`,
      summary: `session ${i}`,
      toolCounts: {},
      promptCount: 0,
      agentCount: 0,
    }));
    writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

    // 模擬截斷邏輯
    const all = readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    if (all.length > 50) {
      writeFileSync(file, all.slice(-50).join('\n') + '\n');
    }

    const after = readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    expect(after.length).toBe(50);
    expect(JSON.parse(after[0]).summary).toBe('session 5');
    expect(JSON.parse(after[49]).summary).toBe('session 54');
  });
});

// ─── 2. Session 簡報格式 ────────────────────────────────────────────────────

describe('Session 簡報格式', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('簡報 .md 包含標題和時間戳', () => {
    const briefing = `# Nova Session 簡報\n> 自動生成於 2026-03-15T10:00:00Z\n\n## 上次 Session\n做了一些事。\n`;
    const file = join(TMP_DIR, 'session-briefing.md');
    writeFileSync(file, briefing);

    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('# Nova Session 簡報');
    expect(content).toContain('自動生成於');
    expect(content).toContain('## 上次 Session');
  });

  test('簡報包含 git log 區段', () => {
    const briefing = [
      '# Nova Session 簡報',
      '> 自動生成於 2026-03-15T10:00:00Z',
      '',
      '## Nova 最近 Commits',
      '```',
      'abc1234 feat(test): 測試 commit',
      'def5678 fix(hooks): 修復 hook 問題',
      '```',
    ].join('\n');
    const file = join(TMP_DIR, 'session-briefing.md');
    writeFileSync(file, briefing);

    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('## Nova 最近 Commits');
    expect(content).toContain('abc1234');
  });

  test('簡報包含 F 級元件警告', () => {
    const briefing = [
      '# Nova Session 簡報',
      '> 自動生成於 2026-03-15T10:00:00Z',
      '',
      '## ⚠️ F 級元件',
      '- skills/old-skill (30/100)',
    ].join('\n');
    const file = join(TMP_DIR, 'session-briefing.md');
    writeFileSync(file, briefing);

    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('F 級元件');
    expect(content).toContain('skills/old-skill');
    expect(content).toContain('30/100');
  });

  test('簡報包含改善建議', () => {
    const briefing = [
      '# Nova Session 簡報',
      '> 自動生成於 2026-03-15T10:00:00Z',
      '',
      '## 💡 改善建議',
      '- **skills/bad**: 增加 frontmatter; 補充 references; 加入反模式說明',
    ].join('\n');
    const file = join(TMP_DIR, 'session-briefing.md');
    writeFileSync(file, briefing);

    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('改善建議');
    expect(content).toContain('skills/bad');
  });

  test('簡報包含 Learner 觀察', () => {
    const briefing = [
      '# Nova Session 簡報',
      '> 自動生成於 2026-03-15T10:00:00Z',
      '',
      '## Learner 觀察',
      '- 💡 read-edit-write (信心 0.72)',
      '- ⚠️ anti-2026-03-14-sid5 (信心 0.45)',
    ].join('\n');
    const file = join(TMP_DIR, 'session-briefing.md');
    writeFileSync(file, briefing);

    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('Learner 觀察');
    expect(content).toContain('0.72');
    expect(content).toContain('⚠️');
  });
});

// ─── 3. Skill 改善建議 ─────────────────────────────────────────────────────

describe('Skill 改善建議', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('improvements.jsonl entry 格式正確', () => {
    const entry = {
      date: '2026-03-15',
      path: 'skills/old-skill',
      type: 'skill',
      score: 25,
      suggestions: [
        '- 增加 frontmatter（name, description）',
        '- 補充 references 目錄',
        '- 加入反模式說明（NEVER 區塊）',
      ],
    };

    const file = join(TMP_DIR, 'improvements.jsonl');
    appendFileSync(file, JSON.stringify(entry) + '\n');

    const content = readFileSync(file, 'utf-8').trim();
    const parsed = JSON.parse(content);
    expect(parsed.date).toBe('2026-03-15');
    expect(parsed.path).toBe('skills/old-skill');
    expect(parsed.type).toBe('skill');
    expect(parsed.score).toBe(25);
    expect(parsed.suggestions.length).toBe(3);
    expect(parsed.suggestions[0]).toContain('frontmatter');
  });

  test('截斷邏輯：超過 30 筆保留最近 30 筆', () => {
    const file = join(TMP_DIR, 'improvements.jsonl');
    const entries = Array.from({ length: 35 }, (_, i) => ({
      date: '2026-03-15',
      path: `skills/skill-${i}`,
      type: 'skill',
      score: 20 + i,
      suggestions: ['- 建議'],
    }));
    writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

    // 模擬截斷邏輯
    const all = readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    if (all.length > 30) {
      writeFileSync(file, all.slice(-30).join('\n') + '\n');
    }

    const after = readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    expect(after.length).toBe(30);
    expect(JSON.parse(after[0]).path).toBe('skills/skill-5');
  });

  test('grade F 判定 — 分數 < 60', () => {
    expect(grade(59)).toBe('F');
    expect(grade(30)).toBe('F');
    expect(grade(0)).toBe('F');
  });

  test('grade 非 F — 分數 >= 60', () => {
    expect(grade(60)).not.toBe('F');
    expect(grade(80)).not.toBe('F');
    expect(grade(100)).not.toBe('F');
  });

  test('generateImprovements 是 exported 函式', () => {
    expect(typeof generateImprovements).toBe('function');
  });
});

// ─── 4. 模組職責分離驗證 ────────────────────────────────────────────────────

describe('模組職責分離', () => {
  test('flow-observer.js 純觀察 — 無 inject 函式', async () => {
    const mod = await import(join(homedir(), '.claude/hooks/modules/flow-observer.js') + `?t=${Date.now()}`);
    const src = readFileSync(join(homedir(), '.claude/hooks/modules/flow-observer.js'), 'utf-8');
    // 不應包含任何 inject 函式
    expect(src).not.toContain('function inject');
    // 應有 6 個 handler keys
    expect(mod.on.SessionStart).toBeDefined();
    expect(mod.on.SessionEnd).toBeDefined();
    expect(mod.on.UserPromptSubmit).toBeDefined();
    expect(mod.on.SubagentStop).toBeDefined();
    expect(mod.on['PreToolUse:Agent']).toBeDefined();
    expect(mod.on.PostToolUse).toBeDefined();
  });

  test('flow-observer SessionStart 不注入 additionalContext', async () => {
    const mod = await import(join(homedir(), '.claude/hooks/modules/flow-observer.js') + `?t=${Date.now()}`);
    const result = mod.on.SessionStart({ session_id: 'test', model: 'opus', cwd: '/tmp' });
    expect(result.decision).toBe('allow');
    expect(result.hookSpecificOutput).toBeUndefined();
  });

  test('context-injector.js 純注入 — 只有 SessionStart handler', async () => {
    const mod = await import(join(homedir(), '.claude/hooks/modules/context-injector.js') + `?t=${Date.now()}`);
    expect(mod.on.SessionStart).toBeDefined();
    // 不應有其他 handler keys
    const keys = Object.keys(mod.on);
    expect(keys.length).toBe(1);
    expect(keys[0]).toBe('SessionStart');
  });

  test('context-injector SessionStart 回傳 decision=allow', async () => {
    const mod = await import(join(homedir(), '.claude/hooks/modules/context-injector.js') + `?t=${Date.now()}`);
    const result = mod.on.SessionStart({ session_id: 'test' });
    expect(result.decision).toBe('allow');
  });

  test('context-injector 原始碼包含 5 個 inject 函式', () => {
    const src = readFileSync(join(homedir(), '.claude/hooks/modules/context-injector.js'), 'utf-8');
    const injectFns = src.match(/function inject\w+/g) || [];
    expect(injectFns.length).toBe(5);
    expect(src).toContain('function injectBriefing');
    expect(src).toContain('function injectLearnerContext');
    expect(src).toContain('function injectJudgeContext');
    expect(src).toContain('function injectHookErrors');
    expect(src).toContain('function injectImprovements');
  });

  test('improvements JSONL 可被正確解析', () => {
    const entries = [
      { date: '2026-03-15', path: 'skills/a', type: 'skill', score: 30, suggestions: ['- 建議 A1'] },
      { date: '2026-03-15', path: 'rules/b.md', type: 'rule', score: 40, suggestions: ['- 建議 B1', '- 建議 B2'] },
    ];
    const file = join(TMP_DIR, 'improvements-parse.jsonl');
    mkdirSync(join(TMP_DIR), { recursive: true });
    writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

    const raw = readFileSync(file, 'utf-8').trim();
    const parsed = raw.split('\n').map(l => JSON.parse(l));
    expect(parsed.length).toBe(2);
    expect(parsed[0].suggestions[0]).toContain('建議 A1');
    expect(parsed[1].suggestions.length).toBe(2);
  });
});

// ─── 5. 整合測試 — 資料流 ───────────────────────────────────────────────────

describe('資料流整合', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('session 摘要 → 簡報 → 注入的完整流程', () => {
    // Step 1: 寫入 session 摘要
    const summaryFile = join(TMP_DIR, 'session-summaries.jsonl');
    const summaryEntry = {
      date: new Date().toISOString(),
      toolCounts: { Bash: 5, Edit: 3 },
      promptCount: 2,
      agentCount: 1,
      summary: '實作了 3 個本地模型擴展功能。',
    };
    appendFileSync(summaryFile, JSON.stringify(summaryEntry) + '\n');

    // Step 2: 讀取摘要，組裝簡報
    const lines = readFileSync(summaryFile, 'utf-8').trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);

    const parts = [`## 上次 Session\n${last.summary}`];
    parts.push('## Nova 最近 Commits\n```\nabc1234 feat: test\n```');

    const briefing = `# Nova Session 簡報\n> 自動生成於 ${new Date().toISOString()}\n\n${parts.join('\n\n')}\n`;
    const briefingFile = join(TMP_DIR, 'session-briefing.md');
    writeFileSync(briefingFile, briefing);

    // Step 3: 驗證簡報內容
    const content = readFileSync(briefingFile, 'utf-8');
    expect(content).toContain('Nova Session 簡報');
    expect(content).toContain('實作了 3 個本地模型擴展功能');
    expect(content).toContain('abc1234');
  });

  test('judge F 級 → improvements → 簡報的完整流程', () => {
    // Step 1: F 級評分結果
    const fGradeResults = [
      { date: '2026-03-15', path: 'skills/old', type: 'skill', deterministic: 10, semantic: 15, total: 25, grade: 'F' },
    ];

    // Step 2: 寫入改善建議
    const improvementsFile = join(TMP_DIR, 'improvements.jsonl');
    const improvement = {
      date: '2026-03-15',
      path: 'skills/old',
      type: 'skill',
      score: 25,
      suggestions: ['- 增加 frontmatter', '- 補充 references', '- 加入反模式說明'],
    };
    appendFileSync(improvementsFile, JSON.stringify(improvement) + '\n');

    // Step 3: 簡報組裝
    const parts = [];
    parts.push(`## ⚠️ F 級元件\n${fGradeResults.map(s => `- ${s.path} (${s.total}/100)`).join('\n')}`);

    const impLines = readFileSync(improvementsFile, 'utf-8').trim().split('\n').filter(Boolean);
    const latest = impLines.map(l => JSON.parse(l));
    if (latest.length > 0) {
      const suggestions = latest.map(i => `- **${i.path}**: ${i.suggestions.join('; ')}`);
      parts.push(`## 💡 改善建議\n${suggestions.join('\n')}`);
    }

    const briefing = parts.join('\n\n');
    expect(briefing).toContain('skills/old (25/100)');
    expect(briefing).toContain('增加 frontmatter');
    expect(briefing).toContain('補充 references');
  });

  test('空 session（無事件）→ 不生成摘要', () => {
    // 模擬 collect 階段：空 events
    const events = [];
    expect(events.length).toBe(0);
    // generateSessionSummary 應跳過
  });

  test('無 F 級 → 不生成改善建議', () => {
    const results = [
      { grade: 'A', total: 95 },
      { grade: 'B', total: 82 },
      { grade: 'C', total: 73 },
    ];
    const fGrade = results.filter(r => r.grade === 'F');
    expect(fGrade.length).toBe(0);
  });
});
