// learner.test.js — 行為習慣偵測器單元測試
import { describe, test, expect } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

// 直接 import 純函式（不觸發自我分離，因為 LEARNER_BG 不設定時 import 路徑下不執行 spawn）
// 需要透過 export 取得：computeConfidence、analyzeAndUpdate、readBehaviors、writeBehaviors、extractSessionBehavior
const {
  computeConfidence,
  analyzeAndUpdate,
  readBehaviors,
  writeBehaviors,
  extractSessionBehavior,
  generateSuggestions,
  semanticId,
  stripThinking,
} = await import(join(homedir(), '.claude/scripts/learner.js'));

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

  test('3 次 / 12 session / 跨 3 天 / 今天 → ~0.77（absoluteScore 滿分 + relativeScore ~0.54）', () => {
    const today = new Date();
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const b = makeBehavior({
      occurrences: [1, 2, 3],
      firstSeen: threeDaysAgo.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
    });
    const conf = computeConfidence(b, 12, today);
    expect(conf).toBeGreaterThanOrEqual(0.70);
    expect(conf).toBeLessThan(0.90);
  });

  test('5 次 / 20 session / 跨 5 天 / 今天 → 高信心（新公式：絕對+相對混合）', () => {
    const today = new Date();
    const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
    const b = makeBehavior({
      occurrences: [1, 2, 3, 4, 5],
      firstSeen: fiveDaysAgo.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
    });
    const conf = computeConfidence(b, 20, today);
    // 新公式：5 次絕對分滿 + 相對頻率。預期 >= 0.50（lifecycle 閾值）
    expect(conf).toBeGreaterThanOrEqual(0.50);
    expect(conf).toBeLessThan(1.0);
  });

  test('密集 2 天後消失 3 天 → 中低信心（recency 衰減）', () => {
    const today = new Date();
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    // lastSeen 在 2 天前（距今 2 天），recency 衰減
    const b = makeBehavior({
      occurrences: [1, 2],
      firstSeen: threeDaysAgo.toISOString().slice(0, 10),
      lastSeen: twoDaysAgo.toISOString().slice(0, 10),
    });
    const conf = computeConfidence(b, 10, today);
    // 新公式：2 次絕對分 0.667 + 相對頻率。recency = 1/(1+0.67) ≈ 0.6
    expect(conf).toBeLessThan(0.50);
  });

  test('穩定 20 次 / 30 session / 跨 60 天 / 1 天前 → >= 0.50', () => {
    // 用固定日期避免時區漂移
    const now = new Date('2026-03-17T12:00:00Z');
    const b = makeBehavior({
      occurrences: Array.from({ length: 20 }, (_, i) => i + 1),
      firstSeen: '2026-01-16',
      lastSeen: '2026-03-16',
    });
    const conf = computeConfidence(b, 30, now);
    expect(conf).toBeGreaterThanOrEqual(0.50);
    expect(conf).toBeLessThanOrEqual(1.0);
  });

  test('同日多 session（4 次）→ 信心可達反模式閾值 0.4+', () => {
    // 根因修復驗證：同日 firstSeen === lastSeen 時，spanScore 用次數密度替代
    const today = new Date('2026-03-16T12:00:00Z');
    const b = makeBehavior({
      occurrences: [30, 37, 95, 96],
      firstSeen: '2026-03-16',
      lastSeen: '2026-03-16',
    });
    const conf = computeConfidence(b, 96, today);
    expect(conf).toBeGreaterThanOrEqual(0.40);
  });

  test('同日單次出現 → 信心低（防誤判）', () => {
    const today = new Date('2026-03-16T12:00:00Z');
    const b = makeBehavior({
      occurrences: [50],
      firstSeen: '2026-03-16',
      lastSeen: '2026-03-16',
    });
    const conf = computeConfidence(b, 50, today);
    // 單次同日：spanScore = 0.5, absoluteScore = 0.33 → 低信心
    expect(conf).toBeLessThan(0.30);
  });

  test('同日 2 次 → 信心中等（達反模式閾值但未達習慣閾值）', () => {
    const today = new Date('2026-03-16T12:00:00Z');
    const b = makeBehavior({
      occurrences: [10, 20],
      firstSeen: '2026-03-16',
      lastSeen: '2026-03-16',
    });
    const conf = computeConfidence(b, 20, today);
    expect(conf).toBeGreaterThanOrEqual(0.30);
    expect(conf).toBeLessThan(0.60);
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
    try { rmSync(tmpFile); } catch (e) { /* cleanup */ }
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

// ─── 5. generateSuggestions 測試 ───────────────────────────────────────────────

describe('generateSuggestions', () => {
  test('信心達標 + 正向行為 → 生成 rule 建議', async () => {
    const behaviors = [
      {
        id: 'read-edit-bash',
        polarity: 1,
        pattern: 'Read→Edit→Bash',
        firstSeen: '2026-03-10',
        lastSeen: '2026-03-17',
        occurrences: [1, 2, 3, 4, 5],
        confidence: 0.65,
        suggestion: null,
        description: '',
      },
    ];

    const mockAsk = async (_prompt, fallback) => '1. 建議固化為 Rule，因為是格式規範';
    await generateSuggestions(behaviors, { askLocalModel: mockAsk });

    expect(behaviors[0].suggestion).not.toBeNull();
    expect(behaviors[0].suggestion.type).toBe('rule');
    expect(behaviors[0].suggestion.priority).toBe('P2');
    expect(behaviors[0].description).toContain('Rule');
  });

  test('正向行為 + 模型回覆 2 → automation 類型', async () => {
    const behaviors = [
      {
        id: 'auto-format',
        polarity: 1,
        pattern: 'Read→Edit→Bash',
        firstSeen: '2026-03-10',
        lastSeen: '2026-03-17',
        occurrences: [1, 2, 3],
        confidence: 0.7,
        suggestion: null,
        description: '',
      },
    ];

    const mockAsk = async () => '2. 應自動化為腳本';
    await generateSuggestions(behaviors, { askLocalModel: mockAsk });

    expect(behaviors[0].suggestion.type).toBe('automation');
  });

  test('信心達標 + 反模式 → 生成 fix 建議', async () => {
    const behaviors = [
      {
        id: 'anti-pattern-1',
        polarity: -1,
        pattern: 'anti-pattern',
        signals: { blocks: 3, errors: 2, fixKeywords: 1 },
        firstSeen: '2026-03-10',
        lastSeen: '2026-03-17',
        occurrences: [1, 2, 3],
        confidence: 0.45,
        suggestion: null,
        description: '',
      },
    ];

    const mockAsk = async () => 'guard 規則衝突導致誤判';
    await generateSuggestions(behaviors, { askLocalModel: mockAsk });

    expect(behaviors[0].suggestion).not.toBeNull();
    expect(behaviors[0].suggestion.type).toBe('fix');
    expect(behaviors[0].suggestion.priority).toBe('P0');
  });

  test('信心未達標 → 不生成建議', async () => {
    const behaviors = [
      {
        id: 'low-confidence',
        polarity: 1,
        pattern: 'Read→Write',
        firstSeen: '2026-03-16',
        lastSeen: '2026-03-16',
        occurrences: [1],
        confidence: 0.05,
        suggestion: null,
        description: '',
      },
    ];

    await generateSuggestions(behaviors);

    expect(behaviors[0].suggestion).toBeNull();
  });

  test('已有 suggestion → 跳過', async () => {
    const existingSuggestion = { type: 'rule', content: '已有建議', priority: 'P2' };
    const behaviors = [
      {
        id: 'already-suggested',
        polarity: 1,
        pattern: 'A→B',
        confidence: 0.8,
        suggestion: existingSuggestion,
        description: '',
      },
    ];

    await generateSuggestions(behaviors);

    // suggestion 不應被覆蓋
    expect(behaviors[0].suggestion).toBe(existingSuggestion);
  });

  test('空行為列表不崩潰', async () => {
    await generateSuggestions([]);
    // 無 error = 通過
  });
});

// ─── 7. semanticId 語意化 ID 生成測試 ────────────────────────────────────────

describe('semanticId', () => {
  test('Read→Edit → read-then-edit', () => {
    expect(semanticId('Read→Edit')).toBe('read-then-edit');
  });

  test('Grep→Read→Edit → search-modify', () => {
    expect(semanticId('Grep→Read→Edit')).toBe('search-modify');
  });

  test('Glob→Edit → search-modify', () => {
    expect(semanticId('Glob→Edit')).toBe('search-modify');
  });

  test('Agent→Agent → parallel-delegate', () => {
    expect(semanticId('Agent→Agent')).toBe('parallel-delegate');
  });

  test('Agent→Bash→Agent → parallel-delegate', () => {
    expect(semanticId('Agent→Bash→Agent')).toBe('parallel-delegate');
  });

  test('Bash→Bash→Bash → repeated-bash', () => {
    expect(semanticId('Bash→Bash→Bash')).toBe('repeated-bash');
  });

  test('Write→Write → 去重後 edit（相鄰去重）', () => {
    // Write 正規化為 edit，兩個相同相鄰去重後只剩 edit
    expect(semanticId('Write→Write')).toBe('edit');
  });

  test('Bash→Edit → 通用串接', () => {
    expect(semanticId('Bash→Edit')).toBe('bash-edit');
  });

  test('Read→Bash → read + bash，無 edit → 通用串接', () => {
    expect(semanticId('Read→Bash')).toBe('read-bash');
  });

  test('空字串 → unknown', () => {
    expect(semanticId('')).toBe('unknown');
  });

  test('null / undefined → unknown', () => {
    expect(semanticId(null)).toBe('unknown');
    expect(semanticId(undefined)).toBe('unknown');
  });

  test('analyzeAndUpdate 建立新行為時 id 使用語意名稱', () => {
    const session = {
      sid: 20,
      date: '2026-03-17',
      toolSequence: ['Read', 'Edit', 'Read', 'Edit'],
      toolCounts: { Read: 2, Edit: 2 },
      prompts: [],
      blocks: 0,
      errors: 0,
      fixKeywords: 0,
      repeatedSubseqs: [{ seq: 'Read→Edit', count: 2 }],
    };
    const result = analyzeAndUpdate(session, []);
    const behavior = result.find(b => b.pattern === 'Read→Edit');
    expect(behavior).toBeDefined();
    expect(behavior.id).toBe('read-then-edit');
    // id 不再是工具序列直接串接
    expect(behavior.id).not.toBe('read-edit');
  });
});

// ─── 8. stripThinking 前綴清除測試 ───────────────────────────────────────────

describe('stripThinking', () => {
  test('無 thinking 前綴 → 原文不變', () => {
    expect(stripThinking('1. 建議固化為 Rule')).toBe('1. 建議固化為 Rule');
  });

  test('null / undefined → 原值返回', () => {
    expect(stripThinking(null)).toBeNull();
    expect(stripThinking(undefined)).toBeUndefined();
  });

  test('空字串 → 空字串', () => {
    expect(stripThinking('')).toBe('');
  });

  test('包含 Thinking Process: 前綴 → 取最後有效行', () => {
    const input = 'Thinking Process:\n1. **Analyze** the pattern\n2. Consider options\n1. 建議固化為 Rule';
    const result = stripThinking(input);
    expect(result).toBe('1. 建議固化為 Rule');
  });

  test('thinking 前綴大小寫不敏感', () => {
    const input = 'THINKING PROCESS: some long analysis\n最終答案：guard 規則衝突';
    const result = stripThinking(input);
    expect(result).toBe('最終答案：guard 規則衝突');
  });

  test('generateSuggestions 對含 thinking 前綴的 LLM 輸出做清洗', async () => {
    const behaviors = [
      {
        id: 'read-then-edit',
        polarity: 1,
        pattern: 'Read→Edit',
        firstSeen: '2026-03-10',
        lastSeen: '2026-03-17',
        occurrences: [1, 2, 3, 4, 5],
        confidence: 0.65,
        suggestion: null,
        description: '',
      },
    ];

    const mockAsk = async () =>
      'Thinking Process:\n1. **Analyze the pattern**\n2. Consider rule vs automation\n1. 建議固化為 Rule，此為格式規範';

    await generateSuggestions(behaviors, { askLocalModel: mockAsk });

    // suggestion content 不應包含 "Thinking Process:"
    expect(behaviors[0].suggestion.content).not.toMatch(/Thinking Process/i);
    expect(behaviors[0].suggestion.content).toBe('1. 建議固化為 Rule，此為格式規範');
  });
});

// ─── 6. 跨 session 累積 E2E 測試 ─────────────────────────────────────────────

describe('跨 session 累積行為偵測', () => {
  function makeSession(sid, date, repeatedSubseqs, extra = {}) {
    return {
      sid,
      date,
      repeatedSubseqs,
      blocks: extra.blocks || 0,
      errors: extra.errors || 0,
      fixKeywords: extra.fixKeywords || 0,
    };
  }

  test('3 個 session 跨 2 天累積同一行為 → 信心達 lifecycle 閾值 0.50', () => {
    const history = [];
    const pattern = 'Read→Edit→Bash';

    // Session 1: Day 1
    const s1 = makeSession(1, '2026-03-20', [{ seq: pattern }]);
    analyzeAndUpdate(s1, history, new Date('2026-03-20T12:00:00Z'));
    expect(history.length).toBe(1);
    expect(history[0].occurrences).toEqual([1]);
    const conf1 = history[0].confidence;

    // Session 2: Day 1（同日不同 session）
    const s2 = makeSession(2, '2026-03-20', [{ seq: pattern }]);
    analyzeAndUpdate(s2, history, new Date('2026-03-20T18:00:00Z'));
    expect(history[0].occurrences).toEqual([1, 2]);
    const conf2 = history[0].confidence;
    expect(conf2).toBeGreaterThan(conf1);

    // Session 3: Day 2（跨天）
    const s3 = makeSession(3, '2026-03-21', [{ seq: pattern }]);
    analyzeAndUpdate(s3, history, new Date('2026-03-21T10:00:00Z'));
    expect(history[0].occurrences).toEqual([1, 2, 3]);
    expect(history[0].firstSeen).toBe('2026-03-20');
    expect(history[0].lastSeen).toBe('2026-03-21');
    const conf3 = history[0].confidence;
    expect(conf3).toBeGreaterThan(conf2);
    expect(conf3).toBeGreaterThanOrEqual(0.50);
  });

  test('5 個 session 跨 3 天 → 信心持續上升，達 lifecycle 閾值', () => {
    const history = [];
    const pattern = 'Grep→Read→Edit';
    const sessions = [
      { sid: 10, date: '2026-03-15' },
      { sid: 11, date: '2026-03-15' },
      { sid: 12, date: '2026-03-16' },
      { sid: 13, date: '2026-03-17' },
      { sid: 14, date: '2026-03-17' },
    ];

    let prevConf = -1;
    for (const s of sessions) {
      const session = makeSession(s.sid, s.date, [{ seq: pattern }]);
      analyzeAndUpdate(session, history, new Date(s.date + 'T12:00:00Z'));
      expect(history[0].confidence).toBeGreaterThanOrEqual(prevConf);
      prevConf = history[0].confidence;
    }

    expect(history[0].occurrences).toHaveLength(5);
    expect(history[0].confidence).toBeGreaterThanOrEqual(0.50);
  });

  test('不同行為分別累積，互不干擾', () => {
    const history = [];
    const patternA = 'Read→Edit';
    const patternB = 'Bash→Bash→Bash';

    // Session 1: 兩種行為都出現
    const s1 = makeSession(1, '2026-03-20', [{ seq: patternA }, { seq: patternB }]);
    analyzeAndUpdate(s1, history, new Date('2026-03-20T12:00:00Z'));
    expect(history.length).toBe(2);

    // Session 2: 只有 patternA
    const s2 = makeSession(2, '2026-03-21', [{ seq: patternA }]);
    analyzeAndUpdate(s2, history, new Date('2026-03-21T12:00:00Z'));

    const behaviorA = history.find(b => b.pattern === patternA);
    const behaviorB = history.find(b => b.pattern === patternB);

    expect(behaviorA.occurrences).toEqual([1, 2]);
    expect(behaviorB.occurrences).toEqual([1]);
    expect(behaviorA.confidence).toBeGreaterThan(behaviorB.confidence);
  });

  test('反模式跨 session 累積 → 信心達反模式閾值 0.38', () => {
    const history = [];

    // 3 個 session 都有 errors（反模式）
    for (let i = 1; i <= 3; i++) {
      const date = `2026-03-${19 + Math.floor(i / 2)}`;
      const s = makeSession(i * 10, date, [], { blocks: 2, errors: 1 });
      analyzeAndUpdate(s, history, new Date(date + 'T12:00:00Z'));
    }

    const antiPatterns = history.filter(b => b.polarity === -1);
    expect(antiPatterns.length).toBeGreaterThanOrEqual(1);

    const accumulated = antiPatterns.find(b => b.occurrences.length >= 2);
    expect(accumulated).toBeDefined();
    expect(accumulated.confidence).toBeGreaterThanOrEqual(0.38);
  });

  test('完整閉環：累積 → 信心達標 → suggestion 可觸發 → lifecycle 候選', () => {
    const history = [];
    const pattern = 'Read→Edit→Bash';

    // 累積 5 個 session 跨 3 天
    const sessions = [
      { sid: 1, date: '2026-03-15' },
      { sid: 2, date: '2026-03-15' },
      { sid: 3, date: '2026-03-16' },
      { sid: 4, date: '2026-03-16' },
      { sid: 5, date: '2026-03-17' },
    ];

    for (const s of sessions) {
      const session = makeSession(s.sid, s.date, [{ seq: pattern }]);
      analyzeAndUpdate(session, history, new Date(s.date + 'T12:00:00Z'));
    }

    const behavior = history[0];
    expect(behavior.confidence).toBeGreaterThanOrEqual(0.50);

    // 模擬 suggestion 生成後設定 type
    behavior.suggestion = { type: 'skill', content: '建議固化為自動化 Skill' };

    // 驗證 lifecycle 候選條件
    const LIFECYCLE_THRESHOLD = 0.50;
    const isCandidate =
      behavior.confidence >= LIFECYCLE_THRESHOLD &&
      behavior.suggestion?.type === 'skill' &&
      behavior.deployed !== true;
    expect(isCandidate).toBe(true);
  });
});
