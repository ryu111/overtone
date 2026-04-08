// learner.test.js — 行為習慣偵測器單元測試
import { describe, test, expect } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

// 直接 import 純函式（不觸發自我分離，因為 LEARNER_BG 不設定時 import 路徑下不執行 spawn）
const {
  computeConfidence,
  analyzeAndUpdate,
  readBehaviors,
  writeBehaviors,
  extractSessionBehavior,
  generateSuggestions,
  BEHAVIOR_PATTERNS,
  stripThinking,
} = await import(join(homedir(), '.claude/scripts/learner.js'));

// ─── 1. 信心公式測試 ───────────────────────────────────────────────────────────

describe('computeConfidence', () => {
  function makeBehavior({ occurrences, firstSeen, lastSeen, impact = 'high' }) {
    return {
      occurrences,
      firstSeen,
      lastSeen,
      impact,
      polarity: 1,
      id: 'test',
      description: '',
      confidence: 0,
      suggestion: null,
    };
  }

  test('high impact + 5 次 / 今天 → 信心滿分（freqScore=1, recency=1）', () => {
    const today = new Date();
    const b = makeBehavior({
      occurrences: [1, 2, 3, 4, 5],
      firstSeen: today.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
      impact: 'high',
    });
    const conf = computeConfidence(b, 10, today);
    expect(conf).toBe(1.0);
  });

  test('high impact + 3 次 / 今天 → freqScore=0.6, recency=1 → 0.6', () => {
    const today = new Date();
    const b = makeBehavior({
      occurrences: [1, 2, 3],
      firstSeen: today.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
      impact: 'high',
    });
    const conf = computeConfidence(b, 10, today);
    expect(conf).toBeCloseTo(0.6, 1);
  });

  test('medium impact + 5 次 / 今天 → impactWeight=0.7, freqScore=1 → 0.7', () => {
    const today = new Date();
    const b = makeBehavior({
      occurrences: [1, 2, 3, 4, 5],
      firstSeen: today.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
      impact: 'medium',
    });
    const conf = computeConfidence(b, 10, today);
    expect(conf).toBeCloseTo(0.7, 1);
  });

  test('low impact + 5 次 / 今天 → impactWeight=0.4 → 0.4', () => {
    const today = new Date();
    const b = makeBehavior({
      occurrences: [1, 2, 3, 4, 5],
      firstSeen: today.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
      impact: 'low',
    });
    const conf = computeConfidence(b, 10, today);
    expect(conf).toBeCloseTo(0.4, 1);
  });

  test('7 天前 lastSeen → recency = 0.5', () => {
    const now = new Date('2026-03-21T12:00:00Z');
    const b = makeBehavior({
      occurrences: [1, 2, 3, 4, 5],
      firstSeen: '2026-03-14',
      lastSeen: '2026-03-14',
      impact: 'high',
    });
    // recency = 1/(1+7/7) = 0.5, freqScore=1, impactWeight=1.0 → 0.5
    const conf = computeConfidence(b, 10, now);
    expect(conf).toBeCloseTo(0.5, 1);
  });

  test('1 次 / 今天 → freqScore=0.2 → 信心低', () => {
    const today = new Date();
    const b = makeBehavior({
      occurrences: [1],
      firstSeen: today.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
      impact: 'high',
    });
    const conf = computeConfidence(b, 10, today);
    expect(conf).toBeCloseTo(0.2, 1);
    expect(conf).toBeLessThan(0.3);
  });

  test('信心值介於 0 ~ 1 之間', () => {
    const today = new Date();
    const b = makeBehavior({
      occurrences: [1],
      firstSeen: today.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
      impact: 'high',
    });
    const conf = computeConfidence(b, 10, today);
    expect(conf).toBeGreaterThanOrEqual(0);
    expect(conf).toBeLessThanOrEqual(1);
  });

  test('impact 未知 → 0.4（預設 low）', () => {
    const today = new Date();
    const b = makeBehavior({
      occurrences: [1, 2, 3, 4, 5],
      firstSeen: today.toISOString().slice(0, 10),
      lastSeen: today.toISOString().slice(0, 10),
      impact: 'unknown',
    });
    const conf = computeConfidence(b, 10, today);
    expect(conf).toBeCloseTo(0.4, 1);
  });
});

// ─── 2. BEHAVIOR_PATTERNS 偵測測試 ────────────────────────────────────────────

describe('BEHAVIOR_PATTERNS', () => {
  test('BEHAVIOR_PATTERNS export 存在且包含 14 個模式', () => {
    expect(Array.isArray(BEHAVIOR_PATTERNS)).toBe(true);
    expect(BEHAVIOR_PATTERNS.length).toBe(14);
  });

  test('每個 pattern 有 id、detect、polarity、impact、description', () => {
    for (const p of BEHAVIOR_PATTERNS) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.detect).toBe('function');
      expect([-1, 1]).toContain(p.polarity);
      expect(['high', 'medium', 'low']).toContain(p.impact);
      expect(typeof p.description).toBe('string');
    }
  });

  test('low-self-review: selfReviewRate < 0.5 → 偵測到', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'low-self-review');
    expect(pattern.detect({ signals: { compliance: { selfReviewRate: 0.3 } } })).toBe(true);
    expect(pattern.detect({ signals: { compliance: { selfReviewRate: 0.8 } } })).toBe(false);
    expect(pattern.detect({ signals: { compliance: { selfReviewRate: null } } })).toBe(false);
  });

  test('low-test-rate: testRate < 0.5 → 偵測到', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'low-test-rate');
    expect(pattern.detect({ signals: { compliance: { testRate: 0.2 } } })).toBe(true);
    expect(pattern.detect({ signals: { compliance: { testRate: 0.9 } } })).toBe(false);
  });

  test('high-correction-rate: totalPrompts >= 3 且 corrections/total > 0.3', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'high-correction-rate');
    expect(pattern.detect({ signals: { totalPrompts: 5, corrections: 2 } })).toBe(true);
    expect(pattern.detect({ signals: { totalPrompts: 5, corrections: 1 } })).toBe(false);
    expect(pattern.detect({ signals: { totalPrompts: 2, corrections: 1 } })).toBe(false);
  });

  test('no-skills-delegation: Agent 委派未注入 skills', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'no-skills-delegation');
    const withoutSkills = { signals: { agentDispatches: [{ type: 'reviewer', hasSkills: false }] } };
    const withSkills = { signals: { agentDispatches: [{ type: 'reviewer', hasSkills: true }] } };
    const generalPurpose = { signals: { agentDispatches: [{ type: 'general-purpose', hasSkills: false }] } };
    expect(pattern.detect(withoutSkills)).toBe(true);
    expect(pattern.detect(withSkills)).toBe(false);
    expect(pattern.detect(generalPurpose)).toBe(false);
  });

  test('frequent-failures: toolFailures >= 3', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'frequent-failures');
    expect(pattern.detect({ signals: { toolFailures: 3 } })).toBe(true);
    expect(pattern.detect({ signals: { toolFailures: 2 } })).toBe(false);
  });

  test('good-compliance: selfReviewRate >= 0.8 且 testRate >= 0.8', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'good-compliance');
    expect(pattern.detect({ signals: { compliance: { selfReviewRate: 0.9, testRate: 0.85 } } })).toBe(true);
    expect(pattern.detect({ signals: { compliance: { selfReviewRate: 0.7, testRate: 0.9 } } })).toBe(false);
  });

  test('skip-post-accept-questions: xd-complete 後 5 分鐘內有 cross-dispatch 但無 ask_question → 偵測到', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'skip-post-accept-questions');
    const now = Date.now();
    // 正向：有 xd-complete，後面有 cross-dispatch 但無 ask_question
    const positive = {
      signals: {
        flowEvents: [
          { type: 'xd-complete', ts: now },
          { type: 'cross-dispatch', ts: now + 60000 },
        ],
      },
    };
    // 反向：有 xd-complete，後面有 cross-dispatch 也有 ask_question
    const negative = {
      signals: {
        flowEvents: [
          { type: 'xd-complete', ts: now },
          { type: 'ask_question', ts: now + 30000 },
          { type: 'cross-dispatch', ts: now + 60000 },
        ],
      },
    };
    // 反向：有 xd-complete，後面無任何 dispatch
    const noDispatch = {
      signals: {
        flowEvents: [
          { type: 'xd-complete', ts: now },
        ],
      },
    };
    expect(pattern.detect(positive)).toBe(true);
    expect(pattern.detect(negative)).toBe(false);
    expect(pattern.detect(noDispatch)).toBe(false);
    expect(pattern.detect({ signals: { flowEvents: [] } })).toBe(false);
  });

  test('dispatch-without-research: prompt < 30 words → 偵測到', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'dispatch-without-research');
    // 正向：prompt 只有 5 個詞
    const shortPrompt = {
      signals: { agentDispatches: [{ prompt: 'fix the bug now', type: 'executor' }] },
    };
    // 反向：prompt 有 30+ 個詞
    const longPrompt = {
      signals: {
        agentDispatches: [{
          prompt: 'Please fix the authentication bug in the login flow. The issue occurs when the user submits the form with an empty password field. Expected behavior is to show a validation error.',
          type: 'executor',
        }],
      },
    };
    // 反向：沒有 dispatch
    const noDispatch = { signals: { agentDispatches: [] } };
    expect(pattern.detect(shortPrompt)).toBe(true);
    expect(pattern.detect(longPrompt)).toBe(false);
    expect(pattern.detect(noDispatch)).toBe(false);
    // 邊界：prompt 為空字串 → split 得 ['']，wordCount=1（< 30），視為缺少背景而觸發
    const emptyPrompt = { signals: { agentDispatches: [{ prompt: '', type: 'executor' }] } };
    expect(pattern.detect(emptyPrompt)).toBe(true);
  });

  test('repeated-same-correction: 同關鍵詞出現 2+ 次 → 偵測到', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'repeated-same-correction');
    // 正向：corrections >= 2 且 correctionKeywords 有重複
    const repeated = {
      signals: {
        corrections: 2,
        correctionKeywords: ['繁體中文', 'test', '繁體中文'],
      },
    };
    // 反向：corrections >= 2 但 correctionKeywords 無重複
    const noRepeat = {
      signals: {
        corrections: 2,
        correctionKeywords: ['繁體中文', 'test', 'emoji'],
      },
    };
    // 反向：corrections < 2
    const fewCorrections = {
      signals: {
        corrections: 1,
        correctionKeywords: ['同一詞', '同一詞'],
      },
    };
    expect(pattern.detect(repeated)).toBe(true);
    expect(pattern.detect(noRepeat)).toBe(false);
    expect(pattern.detect(fewCorrections)).toBe(false);
    expect(pattern.detect({ signals: {} })).toBe(false);
  });

  test('incomplete-closed-loop: component_deleted 或 closedLoop warning → 偵測到', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'incomplete-closed-loop');
    // 正向：有 component_deleted 事件
    const componentDeleted = {
      signals: {
        flowEvents: [{ type: 'component_deleted', name: 'old-skill' }],
      },
    };
    // 正向：有 closedLoop compliance_warning
    const closedLoopWarning = {
      signals: {
        flowEvents: [{ type: 'compliance_warning', metric: 'closedLoop' }],
      },
    };
    // 反向：其他 compliance_warning
    const otherWarning = {
      signals: {
        flowEvents: [{ type: 'compliance_warning', metric: 'testRate' }],
      },
    };
    // 反向：空事件
    const empty = { signals: { flowEvents: [] } };
    expect(pattern.detect(componentDeleted)).toBe(true);
    expect(pattern.detect(closedLoopWarning)).toBe(true);
    expect(pattern.detect(otherWarning)).toBe(false);
    expect(pattern.detect(empty)).toBe(false);
    expect(pattern.detect({ signals: {} })).toBe(false);
  });

  test('tool-success-rate-drop: failRate > 30% 且 totalTools >= 10 → 偵測到', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'tool-success-rate-drop');
    // 正向：10 個工具，4 個失敗 (40%)
    expect(pattern.detect({
      toolCounts: { Bash: 6, Read: 4 },
      signals: { toolFailures: 4 },
    })).toBe(true);
    // 反向：10 個工具，2 個失敗 (20%)
    expect(pattern.detect({
      toolCounts: { Bash: 6, Read: 4 },
      signals: { toolFailures: 2 },
    })).toBe(false);
    // 反向：樣本太小 (< 10)
    expect(pattern.detect({
      toolCounts: { Bash: 5, Read: 4 },
      signals: { toolFailures: 4 },
    })).toBe(false);
    // 反向：無 toolCounts
    expect(pattern.detect({ signals: { toolFailures: 0 } })).toBe(false);
  });

  test('silent-failure: compliance 全 null 且 totalPrompts > 5 → 偵測到', () => {
    const pattern = BEHAVIOR_PATTERNS.find(p => p.id === 'silent-failure');
    // 正向：compliance 全 null，totalPrompts > 5
    expect(pattern.detect({
      signals: {
        compliance: { selfReviewRate: null, testRate: null },
        totalPrompts: 10,
      },
    })).toBe(true);
    // 反向：totalPrompts <= 5
    expect(pattern.detect({
      signals: {
        compliance: { selfReviewRate: null, testRate: null },
        totalPrompts: 3,
      },
    })).toBe(false);
    // 反向：compliance 有值
    expect(pattern.detect({
      signals: {
        compliance: { selfReviewRate: 0.8, testRate: null },
        totalPrompts: 10,
      },
    })).toBe(false);
    // 反向：無 compliance
    expect(pattern.detect({ signals: { totalPrompts: 10 } })).toBe(false);
  });
});

// ─── 3. analyzeAndUpdate 行為偵測測試 ─────────────────────────────────────────

describe('analyzeAndUpdate', () => {
  function makeSessionData(signals = {}) {
    return {
      sid: 5,
      date: '2026-03-15',
      toolCounts: {},
      signals: {
        agentDispatches: [],
        compliance: { selfReviewRate: null, testRate: null },
        corrections: 0,
        totalPrompts: 0,
        toolFailures: 0,
        ...signals,
      },
    };
  }

  test('low-self-review 偵測 → 建立新 behavior 條目', () => {
    const session = makeSessionData({ compliance: { selfReviewRate: 0.2, testRate: null } });
    const result = analyzeAndUpdate(session, []);
    const behavior = result.find(b => b.id === 'low-self-review');
    expect(behavior).toBeDefined();
    expect(behavior.polarity).toBe(-1);
    expect(behavior.impact).toBe('high');
    expect(behavior.occurrences).toContain(5);
  });

  test('frequent-failures 偵測 → 建立 behavior 條目', () => {
    const session = makeSessionData({ toolFailures: 5 });
    const result = analyzeAndUpdate(session, []);
    const behavior = result.find(b => b.id === 'frequent-failures');
    expect(behavior).toBeDefined();
    expect(behavior.polarity).toBe(-1);
  });

  test('good-compliance 偵測 → 建立正向 behavior', () => {
    const session = makeSessionData({ compliance: { selfReviewRate: 0.9, testRate: 0.85 } });
    const result = analyzeAndUpdate(session, []);
    const behavior = result.find(b => b.id === 'good-compliance');
    expect(behavior).toBeDefined();
    expect(behavior.polarity).toBe(1);
  });

  test('已知 behavior 再次出現 → occurrences 增加', () => {
    const existing = [{
      id: 'frequent-failures',
      polarity: -1,
      impact: 'medium',
      description: '工具失敗 3+ 次',
      firstSeen: '2026-03-10',
      lastSeen: '2026-03-12',
      occurrences: [5, 6],
      confidence: 0.3,
      suggestion: null,
    }];
    const session = makeSessionData({ toolFailures: 4 });
    session.sid = 11;
    session.date = '2026-03-15';
    // 傳入 nowOverride 固定日期，避免 confidence 計算受真實時間影響
    const result = analyzeAndUpdate(session, existing, new Date('2026-03-15'));
    const behavior = result.find(b => b.id === 'frequent-failures');
    expect(behavior.occurrences).toContain(11);
    expect(behavior.occurrences.length).toBe(3);
    expect(behavior.lastSeen).toBe('2026-03-15');
  });

  test('重複出現不重複記 sid', () => {
    const existing = [{
      id: 'frequent-failures',
      polarity: -1,
      impact: 'medium',
      description: '',
      firstSeen: '2026-03-10',
      lastSeen: '2026-03-15',
      occurrences: [5, 11],
      confidence: 0.3,
      suggestion: null,
    }];
    const session = makeSessionData({ toolFailures: 4 });
    session.sid = 11;
    session.date = '2026-03-15';
    const result = analyzeAndUpdate(session, existing, new Date('2026-03-16'));
    const behavior = result.find(b => b.id === 'frequent-failures');
    expect(behavior.occurrences.length).toBe(2); // 不重複
  });

  test('無信號偵測 → 不建立 behavior', () => {
    const session = makeSessionData({
      compliance: { selfReviewRate: null, testRate: null },
      toolFailures: 0,
      totalPrompts: 0,
      agentDispatches: [],
    });
    const result = analyzeAndUpdate(session, []);
    expect(result.length).toBe(0);
  });

  test('信心 < 0.10（舊條目衰退）→ 自動刪除', () => {
    // impact=high + 1 次 + 30 天前 → 信心極低
    const existing = [{
      id: 'low-self-review',
      polarity: -1,
      impact: 'high',
      description: '',
      firstSeen: '2026-02-13',
      lastSeen: '2026-02-13',
      occurrences: [1],
      confidence: 0.5,
      suggestion: null,
    }];
    const session = makeSessionData({}); // 無觸發信號
    session.sid = 100;
    session.date = '2026-03-15';
    const now = new Date('2026-03-15');
    const result = analyzeAndUpdate(session, existing, now);
    // 'low-self-review' 應因信心極低被刪除
    const behavior = result.find(b => b.id === 'low-self-review');
    expect(behavior).toBeUndefined();
  });
});

// ─── 4. 行為序列提取測試 ──────────────────────────────────────────────────────

describe('extractSessionBehavior', () => {
  const tmpFile = join(tmpdir(), `learner-test-events-${Date.now()}.jsonl`);

  function writeEvents(events) {
    const content = events.map(e => JSON.stringify(e)).join('\n');
    writeFileSync(tmpFile, content);
  }

  function cleanup() {
    try { rmSync(tmpFile); } catch (e) { /* cleanup */ }
  }

  test('給定 events JSONL → 正確提取 toolCounts', () => {
    writeEvents([
      { sid: 3, type: 'tool_use', tool_name: 'Edit' },
      { sid: 3, type: 'tool_use', tool_name: 'Grep' },
      { sid: 3, type: 'tool_use', tool_name: 'Edit' },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result).not.toBeNull();
    expect(result.toolCounts['Edit']).toBe(2);
    expect(result.toolCounts['Grep']).toBe(1);
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
    expect(result.toolCounts['Edit']).toBe(1);
    expect(result.toolCounts['Write']).toBe(1);
    expect(result.toolCounts['Bash']).toBeUndefined();
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

  test('偵測使用者修正 → corrections 計數', () => {
    writeEvents([
      { sid: 5, type: 'prompt_submit', prompt_preview: '修正這個錯誤' },
      { sid: 5, type: 'prompt_submit', prompt_preview: '正常提示' },
      { sid: 5, type: 'prompt_submit', prompt_preview: 'fix this bug' },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result.signals.corrections).toBe(2);
    expect(result.signals.totalPrompts).toBe(3);
    cleanup();
  });

  test('偵測 tool_failure → toolFailures 計數', () => {
    writeEvents([
      { sid: 6, type: 'tool_failure' },
      { sid: 6, type: 'tool_failure' },
      { sid: 6, type: 'tool_use', tool_name: 'Bash' },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result.signals.toolFailures).toBe(2);
    cleanup();
  });

  test('偵測 agent_dispatch → agentDispatches 記錄', () => {
    writeEvents([
      { sid: 7, type: 'agent_dispatch', agentType: 'reviewer', skills: ['code-review'] },
      { sid: 7, type: 'agent_dispatch', agentType: 'executor' },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result.signals.agentDispatches.length).toBe(2);
    expect(result.signals.agentDispatches[0].hasSkills).toBe(true);
    expect(result.signals.agentDispatches[1].hasSkills).toBe(false);
    cleanup();
  });

  test('偵測 compliance_warning → compliance 欄位更新', () => {
    writeEvents([
      { sid: 8, type: 'compliance_warning', metric: 'selfReviewRate', value: 0.3 },
      { sid: 8, type: 'compliance_warning', metric: 'testRate', value: 0.6 },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result.signals.compliance.selfReviewRate).toBe(0.3);
    expect(result.signals.compliance.testRate).toBe(0.6);
    cleanup();
  });

  test('偵測 session_end → compliance 欄位更新', () => {
    writeEvents([
      { sid: 9, type: 'session_end', selfReviewRate: 0.8, testRate: 0.9 },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result.signals.compliance.selfReviewRate).toBe(0.8);
    expect(result.signals.compliance.testRate).toBe(0.9);
    cleanup();
  });

  test('回傳結構包含 sid、date、toolCounts、signals', () => {
    writeEvents([
      { sid: 10, type: 'tool_use', tool_name: 'Edit' },
    ]);
    const result = extractSessionBehavior(tmpFile);
    expect(result).not.toBeNull();
    expect(typeof result.sid).toBe('number');
    expect(typeof result.date).toBe('string');
    expect(typeof result.toolCounts).toBe('object');
    expect(typeof result.signals).toBe('object');
    expect(typeof result.signals.agentDispatches).not.toBeUndefined();
    expect(typeof result.signals.compliance).not.toBeUndefined();
    cleanup();
  });
});

// ─── 5. generateSuggestions 測試 ───────────────────────────────────────────────

describe('generateSuggestions', () => {
  test('命中 SUGGESTION_MAP → 使用預定義建議，不呼叫 LLM', async () => {
    const behaviors = [
      {
        id: 'low-self-review',
        polarity: -1,
        impact: 'high',
        description: '',
        firstSeen: '2026-03-10',
        lastSeen: '2026-03-17',
        occurrences: [1, 2, 3],
        confidence: 0.5,
        suggestion: null,
      },
    ];

    let askCalled = false;
    const mockAsk = async () => { askCalled = true; return ''; };
    await generateSuggestions(behaviors, { askLocalModel: mockAsk });

    expect(behaviors[0].suggestion).not.toBeNull();
    expect(behaviors[0].suggestion.content).toContain('self-review');
    expect(behaviors[0].suggestion.type).toBe('fix');
    expect(askCalled).toBe(false); // SUGGESTION_MAP 命中，不呼叫 LLM
  });

  test('命中 SUGGESTION_MAP - low-test-rate → 使用預定義建議', async () => {
    const behaviors = [
      {
        id: 'low-test-rate',
        polarity: -1,
        impact: 'high',
        description: '',
        firstSeen: '2026-03-10',
        lastSeen: '2026-03-17',
        occurrences: [1, 2, 3],
        confidence: 0.4,
        suggestion: null,
      },
    ];

    await generateSuggestions(behaviors);

    expect(behaviors[0].suggestion).not.toBeNull();
    expect(behaviors[0].suggestion.content).toContain('bun test');
  });

  test('good-compliance（正向）→ 預定義建議 type=rule', async () => {
    const behaviors = [
      {
        id: 'good-compliance',
        polarity: 1,
        impact: 'high',
        description: '',
        firstSeen: '2026-03-10',
        lastSeen: '2026-03-17',
        occurrences: [1, 2, 3],
        confidence: 0.5,
        suggestion: null,
      },
    ];

    await generateSuggestions(behaviors);

    expect(behaviors[0].suggestion).not.toBeNull();
    expect(behaviors[0].suggestion.type).toBe('rule');
    expect(behaviors[0].suggestion.priority).toBe('P2');
  });

  test('未命中 SUGGESTION_MAP 且信心 > 0.9 → 回退 LLM', async () => {
    const behaviors = [
      {
        id: 'unknown-behavior-xyz',
        polarity: 1,
        impact: 'high',
        description: '',
        firstSeen: '2026-03-10',
        lastSeen: '2026-03-17',
        occurrences: [1, 2, 3, 4, 5],
        confidence: 0.95,
        suggestion: null,
      },
    ];

    const mockAsk = async () => '建議固化為 Rule';
    await generateSuggestions(behaviors, { askLocalModel: mockAsk });

    expect(behaviors[0].suggestion).not.toBeNull();
    expect(behaviors[0].suggestion.content).toContain('Rule');
  });

  test('未命中 SUGGESTION_MAP 且信心 <= 0.9 → 不生成建議', async () => {
    const behaviors = [
      {
        id: 'unknown-behavior-xyz',
        polarity: 1,
        impact: 'high',
        description: '',
        firstSeen: '2026-03-16',
        lastSeen: '2026-03-16',
        occurrences: [1, 2],
        confidence: 0.5,
        suggestion: null,
      },
    ];

    let askCalled = false;
    const mockAsk = async () => { askCalled = true; return ''; };
    await generateSuggestions(behaviors, { askLocalModel: mockAsk });

    expect(behaviors[0].suggestion).toBeNull();
    expect(askCalled).toBe(false);
  });

  test('信心未達門檻（0.05）→ 不生成建議', async () => {
    const behaviors = [
      {
        id: 'low-confidence',
        polarity: 1,
        description: '',
        firstSeen: '2026-03-16',
        lastSeen: '2026-03-16',
        occurrences: [1],
        confidence: 0.05,
        suggestion: null,
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
      { id: 'test-1', polarity: 1, impact: 'high', confidence: 0.7 },
      { id: 'test-2', polarity: -1, impact: 'medium', confidence: 0.5 },
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

// ─── 7. stripThinking 前綴清除測試 ───────────────────────────────────────────

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
});

// ─── 8. 跨 session 累積行為偵測 E2E 測試 ─────────────────────────────────────

describe('跨 session 累積行為偵測', () => {
  function makeSessionData(sid, date, signalOverrides = {}) {
    return {
      sid,
      date,
      toolCounts: {},
      signals: {
        agentDispatches: [],
        compliance: { selfReviewRate: null, testRate: null },
        corrections: 0,
        totalPrompts: 0,
        toolFailures: 0,
        ...signalOverrides,
      },
    };
  }

  test('3 個 session 累積 frequent-failures → 信心持續增長', () => {
    const history = [];

    const s1 = makeSessionData(1, '2026-03-20', { toolFailures: 4 });
    analyzeAndUpdate(s1, history, new Date('2026-03-20T12:00:00Z'));
    expect(history.length).toBe(1);
    expect(history[0].id).toBe('frequent-failures');
    const conf1 = history[0].confidence;

    const s2 = makeSessionData(2, '2026-03-20', { toolFailures: 3 });
    analyzeAndUpdate(s2, history, new Date('2026-03-20T18:00:00Z'));
    expect(history[0].occurrences).toContain(2);
    const conf2 = history[0].confidence;
    expect(conf2).toBeGreaterThan(conf1);

    const s3 = makeSessionData(3, '2026-03-21', { toolFailures: 5 });
    analyzeAndUpdate(s3, history, new Date('2026-03-21T10:00:00Z'));
    expect(history[0].occurrences).toHaveLength(3);
    const conf3 = history[0].confidence;
    expect(conf3).toBeGreaterThan(conf2);
  });

  test('不同 behavior pattern 分別累積，互不干擾', () => {
    const history = [];

    // Session 1: low-self-review + frequent-failures
    const s1 = makeSessionData(1, '2026-03-20', {
      toolFailures: 4,
      compliance: { selfReviewRate: 0.2, testRate: null },
    });
    analyzeAndUpdate(s1, history, new Date('2026-03-20T12:00:00Z'));
    expect(history.length).toBe(2);

    // Session 2: 只有 frequent-failures
    const s2 = makeSessionData(2, '2026-03-21', { toolFailures: 3 });
    analyzeAndUpdate(s2, history, new Date('2026-03-21T12:00:00Z'));

    const failureB = history.find(b => b.id === 'frequent-failures');
    const reviewB = history.find(b => b.id === 'low-self-review');

    expect(failureB.occurrences).toHaveLength(2);
    expect(reviewB.occurrences).toHaveLength(1);
    expect(failureB.confidence).toBeGreaterThan(reviewB.confidence);
  });

  test('good-compliance 正向行為跨 session 累積', () => {
    const history = [];

    for (let i = 1; i <= 5; i++) {
      const session = makeSessionData(i, '2026-03-20', {
        compliance: { selfReviewRate: 0.9, testRate: 0.85 },
      });
      analyzeAndUpdate(session, history, new Date('2026-03-20T12:00:00Z'));
    }

    const behavior = history.find(b => b.id === 'good-compliance');
    expect(behavior).toBeDefined();
    expect(behavior.polarity).toBe(1);
    expect(behavior.occurrences).toHaveLength(5);
    expect(behavior.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('完整閉環：累積 → 信心達標 → suggestion 可觸發', async () => {
    const history = [];

    // 累積 5 次 frequent-failures
    for (let i = 1; i <= 5; i++) {
      const session = makeSessionData(i, '2026-03-20', { toolFailures: 3 });
      analyzeAndUpdate(session, history, new Date('2026-03-20T12:00:00Z'));
    }

    const behavior = history.find(b => b.id === 'frequent-failures');
    expect(behavior).toBeDefined();
    expect(behavior.occurrences).toHaveLength(5);
    expect(behavior.confidence).toBeGreaterThan(0.18); // 達到 generateSuggestions 門檻

    // 生成建議（命中 SUGGESTION_MAP）
    await generateSuggestions(history);
    expect(behavior.suggestion).not.toBeNull();
    expect(behavior.suggestion.content).toBeTruthy();
  });
});
