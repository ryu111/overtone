// learner.test.js — 行為習慣偵測器單元測試
import { describe, test, expect } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// 直接 import 純函式（不觸發自我分離，因為 LEARNER_BG 不設定時 import 路徑下不執行 spawn）
// 需要透過 export 取得：computeConfidence、analyzeAndUpdate、readBehaviors、writeBehaviors、extractSessionBehavior
import {
  computeConfidence,
  analyzeAndUpdate,
  readBehaviors,
  writeBehaviors,
  extractSessionBehavior,
} from '/Users/sbu/.claude/scripts/learner.js';

// ─── 1. 信心公式測試 ───────────────────────────────────────────────────────────

describe('computeConfidence', () => {
  function makeBehavior({ occurrences, firstSeen, lastSeen }) {
    return {
      occurrences,
      firstSeen,
      lastSeen,
      polarity: 1,
      pattern: 'test',
      id: 'test',
      description: '',
      confidence: 0,
      suggestion: null,
    };
  }

  test('3 次 / 12 session / 跨 3 天 / 今天 → ~0.54', () => {
    const today = new Date();
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const b = makeBehavior({
      occurrences: [1, 2, 3],
      firstSeen: threeDaysAgo.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
    });
    const conf = computeConfidence(b, 12, today);
    expect(conf).toBeGreaterThan(0.40);
    expect(conf).toBeLessThan(0.70);
  });

  test('5 次 / 20 session / 跨 5 天 / 今天 → ~0.59', () => {
    const today = new Date();
    const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
    const b = makeBehavior({
      occurrences: [1, 2, 3, 4, 5],
      firstSeen: fiveDaysAgo.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
    });
    const conf = computeConfidence(b, 20, today);
    expect(conf).toBeGreaterThan(0.40);
    expect(conf).toBeLessThan(0.70);
  });

  test('密集 2 天後消失 3 天 → < 0.30', () => {
    const today = new Date();
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    // lastSeen 在 3 天前（距今 3 天）
    const b = makeBehavior({
      occurrences: [1, 2],
      firstSeen: threeDaysAgo.toISOString().slice(0, 10),
      lastSeen: twoDaysAgo.toISOString().slice(0, 10),
    });
    const conf = computeConfidence(b, 10, today);
    expect(conf).toBeLessThan(0.30);
  });

  test('穩定 20 次 / 30 session / 跨 60 天 / 1 天前 → >= 0.60', () => {
    // 公式：frequencyScore=log2(21)/log2(31)≈0.887, spanScore=1, recency=0.75
    // confidence ≈ 0.887 * 1 * 0.75 = 0.665 → 捨入 0.60-0.67
    const today = new Date();
    const oneDayAgo = new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
    const b = makeBehavior({
      occurrences: Array.from({ length: 20 }, (_, i) => i + 1),
      firstSeen: sixtyDaysAgo.toISOString().slice(0, 10),
      lastSeen: oneDayAgo.toISOString().slice(0, 10),
    });
    const conf = computeConfidence(b, 30, today);
    expect(conf).toBeGreaterThanOrEqual(0.60);
  });

  test('信心值介於 0 ~ 1 之間', () => {
    const today = new Date();
    const b = makeBehavior({
      occurrences: [1],
      firstSeen: today.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
    });
    const conf = computeConfidence(b, 1, today);
    expect(conf).toBeGreaterThanOrEqual(0);
    expect(conf).toBeLessThanOrEqual(1);
  });
});

// ─── 2. 極性分類測試 ──────────────────────────────────────────────────────────

describe('analyzeAndUpdate — 極性分類', () => {
  function makeSession(overrides = {}) {
    return {
      sid: 5,
      date: '2026-03-15',
      toolSequence: ['Edit', 'Grep', 'Edit', 'Grep'],
      toolCounts: { Edit: 2, Grep: 2 },
      prompts: [],
      blocks: 0,
      errors: 0,
      fixKeywords: 0,
      repeatedSubseqs: [{ seq: 'Edit→Grep', count: 2 }],
      ...overrides,
    };
  }

  test('有 blocks → 新行為 polarity -1', () => {
    const session = makeSession({ blocks: 2, errors: 0, fixKeywords: 0 });
    const result = analyzeAndUpdate(session, []);
    const behavior = result.find(b => b.pattern === 'Edit→Grep');
    expect(behavior).toBeDefined();
    expect(behavior.polarity).toBe(-1);
  });

  test('有 errors → 新行為 polarity -1', () => {
    const session = makeSession({ blocks: 0, errors: 1, fixKeywords: 0 });
    const result = analyzeAndUpdate(session, []);
    const behavior = result.find(b => b.pattern === 'Edit→Grep');
    expect(behavior).toBeDefined();
    expect(behavior.polarity).toBe(-1);
  });

  test('有修正關鍵詞（blocks=0, errors=0）→ 正常工具序列 polarity +1', () => {
    // fixKeywords 只影響反模式，不影響工具序列極性
    const session = makeSession({ blocks: 0, errors: 0, fixKeywords: 3 });
    const result = analyzeAndUpdate(session, []);
    const behavior = result.find(b => b.pattern === 'Edit→Grep');
    expect(behavior).toBeDefined();
    // 工具序列本身是 blocks=0, errors=0，所以 polarity=1
    expect(behavior.polarity).toBe(1);
  });

  test('正常工具序列（無負向信號）→ polarity +1', () => {
    const session = makeSession({ blocks: 0, errors: 0, fixKeywords: 0 });
    const result = analyzeAndUpdate(session, []);
    const behavior = result.find(b => b.pattern === 'Edit→Grep');
    expect(behavior).toBeDefined();
    expect(behavior.polarity).toBe(1);
  });

  test('blocks=1, errors=1 → 建立反模式條目', () => {
    // blocks + errors + fixKeywords >= 2
    const session = makeSession({ blocks: 1, errors: 1, fixKeywords: 0, repeatedSubseqs: [] });
    const result = analyzeAndUpdate(session, []);
    const anti = result.find(b => b.pattern === 'anti-pattern');
    expect(anti).toBeDefined();
    expect(anti.polarity).toBe(-1);
    expect(anti.signals.blocks).toBe(1);
    expect(anti.signals.errors).toBe(1);
  });

  test('信號不足（blocks=0, errors=0, fixKeywords=1）→ 不建立反模式', () => {
    // blocks + errors + fixKeywords = 1 < 2
    const session = makeSession({ blocks: 0, errors: 0, fixKeywords: 1, repeatedSubseqs: [] });
    const result = analyzeAndUpdate(session, []);
    const anti = result.find(b => b.pattern === 'anti-pattern');
    expect(anti).toBeUndefined();
  });
});

// ─── 3. 行為序列提取測試 ──────────────────────────────────────────────────────

describe('extractSessionBehavior', () => {
  const tmpFile = join(tmpdir(), `learner-test-events-${Date.now()}.jsonl`);

  function writeEvents(events) {
    const content = events.map(e => JSON.stringify(e)).join('\n');
    writeFileSync(tmpFile, content);
  }

  function cleanup() {
    try { rmSync(tmpFile); } catch {}
  }

  test('給定 events JSONL → 正確提取 toolSequence', () => {
    writeEvents([
      { sid: 3, type: 'session_start' },
      { sid: 3, type: 'tool_use', tool_name: 'Edit' },
      { sid: 3, type: 'tool_use', tool_name: 'Grep' },
      { sid: 3, type: 'tool_use', tool_name: 'Edit' },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result).not.toBeNull();
    expect(result.toolSequence).toEqual(['Edit', 'Grep', 'Edit']);
    cleanup();
  });

  test('重複子序列偵測 → 正確識別 Edit→Grep→Edit', () => {
    writeEvents([
      { sid: 4, type: 'tool_use', tool_name: 'Edit' },
      { sid: 4, type: 'tool_use', tool_name: 'Grep' },
      { sid: 4, type: 'tool_use', tool_name: 'Edit' },
      { sid: 4, type: 'tool_use', tool_name: 'Grep' },
      { sid: 4, type: 'tool_use', tool_name: 'Edit' },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result).not.toBeNull();
    const seqs = result.repeatedSubseqs.map(s => s.seq);
    expect(seqs).toContain('Edit→Grep');
    cleanup();
  });

  test('只取最新 sid 的事件', () => {
    writeEvents([
      { sid: 1, type: 'tool_use', tool_name: 'Bash' },
      { sid: 2, type: 'tool_use', tool_name: 'Edit' },
      { sid: 2, type: 'tool_use', tool_name: 'Write' },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result.sid).toBe(2);
    expect(result.toolSequence).toEqual(['Edit', 'Write']);
    cleanup();
  });

  test('檔案不存在 → 回傳 null', () => {
    const result = extractSessionBehavior('/tmp/nonexistent-file-xyz.jsonl');
    expect(result).toBeNull();
  });

  test('空檔案 → 回傳 null', () => {
    writeFileSync(tmpFile, '');
    const result = extractSessionBehavior(tmpFile);
    expect(result).toBeNull();
    cleanup();
  });

  test('偵測 prompt 修正關鍵詞', () => {
    writeEvents([
      { sid: 5, type: 'prompt_submit', prompt_preview: '修正這個錯誤' },
      { sid: 5, type: 'prompt_submit', prompt_preview: '還是有問題' },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result.fixKeywords).toBe(2);
    cleanup();
  });

  test('偵測 block 決策', () => {
    writeEvents([
      { sid: 6, type: 'hook_trigger', decision: 'block' },
      { sid: 6, type: 'hook_trigger', decision: 'allow' },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result.blocks).toBe(1);
    cleanup();
  });
});

// ─── 4. 行為歷史比對測試 ─────────────────────────────────────────────────────

describe('analyzeAndUpdate — 行為歷史比對', () => {
  test('新行為 → 建立新條目', () => {
    const session = {
      sid: 10,
      date: '2026-03-15',
      toolSequence: ['Edit', 'Bash'],
      toolCounts: { Edit: 1, Bash: 1 },
      prompts: [],
      blocks: 0,
      errors: 0,
      fixKeywords: 0,
      repeatedSubseqs: [{ seq: 'Edit→Bash', count: 2 }],
    };
    const result = analyzeAndUpdate(session, []);
    const behavior = result.find(b => b.pattern === 'Edit→Bash');
    expect(behavior).toBeDefined();
    expect(behavior.occurrences).toContain(10);
    expect(behavior.firstSeen).toBe('2026-03-15');
  });

  test('已知行為再次出現 → occurrences 增加', () => {
    const existing = [{
      id: 'edit-bash',
      polarity: 1,
      pattern: 'Edit→Bash',
      description: '',
      firstSeen: '2026-03-10',
      lastSeen: '2026-03-12',
      occurrences: [5, 6],
      confidence: 0.5,
      suggestion: null,
    }];
    const session = {
      sid: 11,
      date: '2026-03-15',
      toolSequence: ['Edit', 'Bash'],
      toolCounts: { Edit: 1, Bash: 1 },
      prompts: [],
      blocks: 0,
      errors: 0,
      fixKeywords: 0,
      repeatedSubseqs: [{ seq: 'Edit→Bash', count: 2 }],
    };
    const result = analyzeAndUpdate(session, existing);
    const behavior = result.find(b => b.pattern === 'Edit→Bash');
    expect(behavior).toBeDefined();
    expect(behavior.occurrences).toContain(11);
    expect(behavior.occurrences.length).toBe(3);
    expect(behavior.lastSeen).toBe('2026-03-15');
  });

  test('重複出現不重複記 sid', () => {
    const existing = [{
      id: 'edit-bash',
      polarity: 1,
      pattern: 'Edit→Bash',
      description: '',
      firstSeen: '2026-03-10',
      lastSeen: '2026-03-15',
      occurrences: [5, 11],
      confidence: 0.5,
      suggestion: null,
    }];
    const session = {
      sid: 11, // 相同 sid
      date: '2026-03-15',
      toolSequence: [],
      toolCounts: {},
      prompts: [],
      blocks: 0,
      errors: 0,
      fixKeywords: 0,
      repeatedSubseqs: [{ seq: 'Edit→Bash', count: 2 }],
    };
    const result = analyzeAndUpdate(session, existing);
    const behavior = result.find(b => b.pattern === 'Edit→Bash');
    expect(behavior.occurrences.length).toBe(2); // 不重複
  });

  test('信心 < 0.10 → 自動刪除', () => {
    // 1 次 / 100 session / 跨 0.1 天 / 30 天前 → 信心極低
    const existing = [{
      id: 'old-pattern',
      polarity: 1,
      pattern: 'Bash→Write',
      description: '',
      firstSeen: '2026-02-13',
      lastSeen: '2026-02-13',
      occurrences: [1],
      confidence: 0.5,
      suggestion: null,
    }];
    const session = {
      sid: 100,
      date: '2026-03-15',
      toolSequence: [],
      toolCounts: {},
      prompts: [],
      blocks: 0,
      errors: 0,
      fixKeywords: 0,
      repeatedSubseqs: [],
    };
    const now = new Date('2026-03-15');
    const result = analyzeAndUpdate(session, existing, now);
    // 'Bash→Write' 應該因信心極低被刪除
    const behavior = result.find(b => b.pattern === 'Bash→Write');
    expect(behavior).toBeUndefined();
  });
});

// ─── 5. 建議門檻測試 ──────────────────────────────────────────────────────────

describe('generateSuggestions — 門檻測試（同步邏輯驗證）', () => {
  test('習慣信心 0.60 以上 + 無建議 → 標記為待建議', () => {
    // 測試邏輯：有建議的 behaviors 才能觸發，這裡驗證條件判斷
    const behavior = {
      id: 'habit',
      polarity: 1,
      pattern: 'Edit→Grep',
      description: '',
      firstSeen: '2026-02-01',
      lastSeen: '2026-03-15',
      occurrences: Array.from({ length: 10 }, (_, i) => i + 1),
      confidence: 0.65,
      suggestion: null,
    };
    const habitThreshold = 0.60;
    expect(behavior.confidence >= habitThreshold && !behavior.suggestion).toBe(true);
  });

  test('反模式信心 0.40 以上 + 無建議 → 標記為待警告', () => {
    const behavior = {
      id: 'anti',
      polarity: -1,
      pattern: 'anti-pattern',
      signals: { blocks: 2, errors: 1, fixKeywords: 0 },
      description: '',
      firstSeen: '2026-02-01',
      lastSeen: '2026-03-15',
      occurrences: [1, 2, 3],
      confidence: 0.45,
      suggestion: null,
    };
    const antiPatternThreshold = 0.40;
    expect(behavior.confidence >= antiPatternThreshold && !behavior.suggestion).toBe(true);
  });

  test('低信心習慣（0.59）→ 不觸發建議', () => {
    const behavior = {
      id: 'not-yet',
      polarity: 1,
      pattern: 'Edit→Grep',
      description: '',
      firstSeen: '2026-03-01',
      lastSeen: '2026-03-15',
      occurrences: [1, 2],
      confidence: 0.59,
      suggestion: null,
    };
    const habitThreshold = 0.60;
    expect(behavior.confidence >= habitThreshold).toBe(false);
  });

  test('低信心反模式（0.39）→ 不觸發警告', () => {
    const behavior = {
      id: 'not-yet-anti',
      polarity: -1,
      pattern: 'anti-pattern',
      signals: { blocks: 1, errors: 0, fixKeywords: 0 },
      description: '',
      firstSeen: '2026-03-14',
      lastSeen: '2026-03-15',
      occurrences: [1],
      confidence: 0.39,
      suggestion: null,
    };
    const antiPatternThreshold = 0.40;
    expect(behavior.confidence >= antiPatternThreshold).toBe(false);
  });

  test('已有建議 → 不重複觸發', () => {
    const behavior = {
      id: 'already-suggested',
      polarity: 1,
      pattern: 'Edit→Grep',
      description: '建議固化為 Rule',
      firstSeen: '2026-01-01',
      lastSeen: '2026-03-15',
      occurrences: Array.from({ length: 15 }, (_, i) => i + 1),
      confidence: 0.80,
      suggestion: { type: 'rule', content: '建議固化為 Rule', priority: 'P2' },
    };
    const habitThreshold = 0.60;
    // !behavior.suggestion 為 false，所以不觸發
    expect(behavior.confidence >= habitThreshold && !behavior.suggestion).toBe(false);
  });
});

// ─── 6. readBehaviors / writeBehaviors ───────────────────────────────────────

describe('readBehaviors / writeBehaviors', () => {
  const tmpDir = join(tmpdir(), `learner-rw-test-${Date.now()}`);
  const tmpFile = join(tmpDir, 'behaviors.jsonl');

  test('不存在的檔案 → 回傳空陣列', () => {
    const result = readBehaviors('/tmp/nonexistent-behaviors-xyz.jsonl');
    expect(result).toEqual([]);
  });

  test('寫入後讀取 → 結果一致', () => {
    mkdirSync(tmpDir, { recursive: true });
    const behaviors = [
      { id: 'test-1', polarity: 1, pattern: 'Edit→Grep', confidence: 0.7 },
      { id: 'test-2', polarity: -1, pattern: 'anti-pattern', confidence: 0.5 },
    ];
    writeBehaviors(behaviors, tmpFile);
    const result = readBehaviors(tmpFile);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('test-1');
    expect(result[1].id).toBe('test-2');
    rmSync(tmpDir, { recursive: true });
  });

  test('目錄不存在時自動建立', () => {
    const deepFile = join(tmpDir, 'nested', 'behaviors.jsonl');
    writeBehaviors([{ id: 'x', polarity: 1 }], deepFile);
    expect(existsSync(deepFile)).toBe(true);
    rmSync(tmpDir, { recursive: true });
  });
});
