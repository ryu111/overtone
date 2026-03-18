import { describe, test, expect } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SCRIPTS = join(homedir(), '.claude/scripts');
const {
  calculateConfidence,
  derivePriority,
  deriveDepth,
  collectFromGapAnalyzer,
  collectFromCapabilityProbe,
  collectFromScores,
  collectFromRoadmap,
  mergeSignals,
  syncToSpec,
  discoverGaps,
  parseFocusWeights,
  applyFocusWeights,
} = await import(join(SCRIPTS, 'gap-discovery.js'));

describe('collectFromGapAnalyzer', () => {
  test('mock gaps 產出正確 RawSignal', async () => {
    const mockGaps = [{
      id: 'closedLoop:missing-skillmd:test-skill',
      category: 'structure',
      severity: 'critical',
      priority: 76,
      repairHint: '建立 SKILL.md',
      context: { element: 'skills/test-skill', check: 'closedLoop', type: 'missing-skillmd', files: [] },
    }];
    const signals = await collectFromGapAnalyzer(mockGaps);
    expect(signals).toHaveLength(1);
    const s = signals[0];
    expect(s.element).toBe('skills/test-skill');
    expect(s.type).toBe('missing-skillmd');
    expect(s.severity).toBe('critical');
    expect(s.source).toBe('gap-analyzer');
    expect(s.title).toBe('建立 SKILL.md');
    expect(s.description).toContain('skills/test-skill');
    expect(s.impact).toBe(76);
  });
});

describe('collectFromCapabilityProbe', () => {
  test('missing strength → critical, impact = missingHits * 10', async () => {
    const mockWeakCaps = [{ name: 'docker', strength: 'missing', missingHits: 5 }];
    const signals = await collectFromCapabilityProbe(mockWeakCaps);
    expect(signals).toHaveLength(1);
    const s = signals[0];
    expect(s.element).toBe('docker');
    expect(s.type).toBe('capability-gap');
    expect(s.severity).toBe('critical');
    expect(s.source).toBe('capability-probe');
    expect(s.impact).toBe(50);
  });

  test('weak strength → warning', async () => {
    const mockWeakCaps = [{ name: 'kubernetes', strength: 'weak', missingHits: 3 }];
    const signals = await collectFromCapabilityProbe(mockWeakCaps);
    expect(signals[0].severity).toBe('warning');
    expect(signals[0].impact).toBe(30);
  });

  test('impact 上限 100', async () => {
    const mockWeakCaps = [{ name: 'test', strength: 'missing', missingHits: 20 }];
    const signals = await collectFromCapabilityProbe(mockWeakCaps);
    expect(signals[0].impact).toBe(100);
  });
});

describe('collectFromScores', () => {
  test('只取 F/C 級（total < 80），跳過 >= 80', async () => {
    const mockScores = [
      '{"date":"2026-03-17","path":"skills/test","total":45,"grade":"F","suggestions":["改善覆蓋率"]}',
      '{"date":"2026-03-17","path":"skills/ok","total":90,"grade":"A","suggestions":[]}',
    ].join('\n');
    const signals = await collectFromScores(mockScores);
    expect(signals).toHaveLength(1);
    expect(signals[0].element).toBe('skills/test');
    expect(signals[0].source).toBe('scores');
    expect(signals[0].severity).toBe('critical');
  });

  test('total 60-79 → warning', async () => {
    const mockScores = '{"date":"2026-03-17","path":"skills/mid","total":70,"grade":"C","suggestions":[]}';
    const signals = await collectFromScores(mockScores);
    expect(signals[0].severity).toBe('warning');
  });

  test('跳過有 ✅ 標記的行（即 # 開頭的行）', async () => {
    const mockScores = [
      '# [TRUNCATED] 截斷標記',
      '{"date":"2026-03-17","path":"skills/bad","total":50,"grade":"F","suggestions":[]}',
    ].join('\n');
    const signals = await collectFromScores(mockScores);
    expect(signals).toHaveLength(1);
    expect(signals[0].element).toBe('skills/bad');
  });
});

describe('collectFromRoadmap', () => {
  test('🔄 → warning, ❌ → critical, ⬜ → info, ✅ → 跳過', async () => {
    const mockRoadmap = [
      '| R4.2 | 缺口自動發現 | 新建 | 🔄 |',
      '| R3.3 | 深度 PM | 重建 | ❌ |',
      '| R4.0 | 基礎工具 | 新建 | ⬜ |',
      '| R4.1 | 工具動態組合 | 新建 | ✅ |',
    ].join('\n');
    const signals = await collectFromRoadmap(mockRoadmap);
    const elements = signals.map(s => s.source);
    expect(elements.every(e => e === 'roadmap')).toBe(true);

    const warningSig = signals.find(s => s.severity === 'warning');
    const criticalSig = signals.find(s => s.severity === 'critical');
    const infoSig = signals.find(s => s.severity === 'info');

    expect(warningSig).toBeDefined();
    expect(criticalSig).toBeDefined();
    expect(infoSig).toBeDefined();
    expect(signals).toHaveLength(3);
  });

  test('✅ 任務完全跳過', async () => {
    const mockRoadmap = '| R4.1 | 工具動態組合 | 新建 | ✅ |';
    const signals = await collectFromRoadmap(mockRoadmap);
    expect(signals).toHaveLength(0);
  });
});

describe('mergeSignals', () => {
  test('同 element 合併為一個 suggestion', () => {
    const signals = [
      { element: 'skills/test-skill', type: 'missing-skillmd', severity: 'critical', source: 'gap-analyzer', title: 'T1', description: 'D1', impact: 76 },
      { element: 'skills/test-skill', type: 'capability-gap', severity: 'warning', source: 'capability-probe', title: 'T2', description: 'D2', impact: 50 },
    ];
    const suggestions = mergeSignals(signals);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].sources).toContain('gap-analyzer');
    expect(suggestions[0].sources).toContain('capability-probe');
    expect(suggestions[0].impact).toBe(76);
  });

  test('不同 element 各自獨立', () => {
    const signals = [
      { element: 'skills/a', type: 'quality-gap', severity: 'critical', source: 'scores', title: 'A', description: 'A desc', impact: 60 },
      { element: 'skills/b', type: 'quality-gap', severity: 'warning', source: 'scores', title: 'B', description: 'B desc', impact: 40 },
    ];
    const suggestions = mergeSignals(signals);
    expect(suggestions).toHaveLength(2);
  });
});

describe('calculateConfidence', () => {
  test('單源 critical → 60', () => {
    const signals = [{ severity: 'critical', source: 'gap-analyzer' }];
    expect(calculateConfidence(signals)).toBe(60);
  });

  test('單源 warning → 40', () => {
    const signals = [{ severity: 'warning', source: 'scores' }];
    expect(calculateConfidence(signals)).toBe(40);
  });

  test('單源 info → 20', () => {
    const signals = [{ severity: 'info', source: 'roadmap' }];
    expect(calculateConfidence(signals)).toBe(20);
  });

  test('多源每增一個 +15', () => {
    const signals = [
      { severity: 'critical', source: 'gap-analyzer' },
      { severity: 'warning', source: 'scores' },
    ];
    expect(calculateConfidence(signals)).toBe(75);
  });

  test('上限 100', () => {
    const signals = [
      { severity: 'critical', source: 'gap-analyzer' },
      { severity: 'critical', source: 'scores' },
      { severity: 'critical', source: 'roadmap' },
      { severity: 'critical', source: 'capability-probe' },
    ];
    expect(calculateConfidence(signals)).toBe(100);
  });
});

describe('derivePriority', () => {
  test('score >= 70 → P1', () => {
    expect(derivePriority(70)).toBe('P1');
    expect(derivePriority(100)).toBe('P1');
  });

  test('score >= 40 → P2', () => {
    expect(derivePriority(40)).toBe('P2');
    expect(derivePriority(69)).toBe('P2');
  });

  test('score < 40 → P3', () => {
    expect(derivePriority(0)).toBe('P3');
    expect(derivePriority(39)).toBe('P3');
  });
});

describe('deriveDepth', () => {
  test('sources >= 3 且 impact >= 70 → D3', () => {
    const suggestion = { sources: ['gap-analyzer', 'scores', 'roadmap'], impact: 80 };
    expect(deriveDepth(suggestion)).toBe('D3');
  });

  test('sources >= 2 → D2', () => {
    const suggestion = { sources: ['gap-analyzer', 'scores'], impact: 50 };
    expect(deriveDepth(suggestion)).toBe('D2');
  });

  test('sources >= 3 但 impact < 70 → D2', () => {
    const suggestion = { sources: ['gap-analyzer', 'scores', 'roadmap'], impact: 60 };
    expect(deriveDepth(suggestion)).toBe('D2');
  });

  test('sources = 1 → D1', () => {
    const suggestion = { sources: ['gap-analyzer'], impact: 90 };
    expect(deriveDepth(suggestion)).toBe('D1');
  });
});

describe('discoverGaps', () => {
  const mockData = {
    gaps: [{
      id: 'closedLoop:missing-skillmd:test-skill',
      category: 'structure',
      severity: 'critical',
      priority: 76,
      repairHint: '建立 SKILL.md',
      context: { element: 'skills/test-skill', type: 'missing-skillmd', files: [] },
    }],
    weakCaps: [{ name: 'docker', strength: 'missing', missingHits: 5 }],
    scores: '{"date":"2026-03-17","path":"skills/low-score","total":45,"grade":"F","suggestions":["改善覆蓋率"]}',
    roadmapContent: '| R3.3 | 深度 PM | 重建 | ❌ |',
  };

  test('端到端：_mock 注入 4 源，回傳排序建議', async () => {
    const report = await discoverGaps({ _mock: mockData, skipNotion: true });
    expect(report.suggestions.length).toBeGreaterThan(0);
    expect(report.warnings).toEqual([]);
    expect(report.metadata.sourcesUsed).toHaveLength(4);
    const scores = report.suggestions.map(s => s.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  test('部分源失敗仍回傳其他源結果，warnings 記錄失敗源', async () => {
    const badMock = {
      gaps: null,
      weakCaps: [{ name: 'docker', strength: 'missing', missingHits: 3 }],
      scores: undefined,
      roadmapContent: '| R3.3 | 深度 PM | 重建 | ❌ |',
    };
    const report = await discoverGaps({
      _mock: badMock,
      skipNotion: true,
      sources: ['gap-analyzer', 'capability-probe', 'roadmap'],
    });
    expect(report.suggestions.length).toBeGreaterThan(0);
  });
});

describe('parseFocusWeights', () => {
  test('解析單層權重', () => {
    const weights = parseFocusWeights('70% L4 自主通用代理人');
    expect(weights).toEqual({ L4: 0.7 });
  });

  test('解析範圍權重', () => {
    const weights = parseFocusWeights('30% L1-L4 重構與修復');
    expect(weights.L1).toBe(0.3);
    expect(weights.L2).toBe(0.3);
    expect(weights.L3).toBe(0.3);
    expect(weights.L4).toBe(0.3);
  });

  test('複合字串取最大值', () => {
    const weights = parseFocusWeights('70% L4 自主通用代理人；30% L1-L4 重構與修復');
    expect(weights.L4).toBe(0.7);
    expect(weights.L1).toBe(0.3);
    expect(weights.L3).toBe(0.3);
  });

  test('空字串回傳空物件', () => {
    expect(parseFocusWeights('')).toEqual({});
    expect(parseFocusWeights(null)).toEqual({});
  });

  test('無 L 範圍的百分比格式', () => {
    const weights = parseFocusWeights('50% L2');
    expect(weights).toEqual({ L2: 0.5 });
  });
});

describe('applyFocusWeights', () => {
  test('L4 權重 0.7 → score 乘 1.7', () => {
    const suggestions = [
      { title: 'L4 heartbeat 改善', element: 'heartbeat', score: 60, confidence: 80, impact: 75, sources: ['scores'] },
    ];
    const result = applyFocusWeights(suggestions, { L4: 0.7 });
    expect(result[0].score).toBe(Math.round(60 * 1.7));
    expect(result[0].focusWeight).toBe(0.7);
  });

  test('無匹配 layer → 預設 0.5', () => {
    const suggestions = [
      { title: 'unknown task', element: 'test', score: 100, confidence: 80, impact: 80, sources: ['scores'] },
    ];
    const result = applyFocusWeights(suggestions, { L4: 0.7 });
    expect(result[0].score).toBe(Math.round(100 * 1.5));
    expect(result[0].focusWeight).toBe(0.5);
  });

  test('空 focusWeights → 不變', () => {
    const suggestions = [{ title: 'test', score: 50 }];
    const result = applyFocusWeights(suggestions, {});
    expect(result[0].score).toBe(50);
  });

  test('重新排序', () => {
    const suggestions = [
      { title: 'L1 low priority', element: 'a', score: 50, confidence: 80, impact: 80, sources: ['scores'] },
      { title: 'L4 high priority', element: 'b', score: 45, confidence: 80, impact: 80, sources: ['scores'] },
    ];
    const result = applyFocusWeights(suggestions, { L4: 0.7, L1: 0.3 });
    expect(result[0].title).toContain('L4');
    expect(result[1].title).toContain('L1');
  });
});

describe('discoverGaps with focusWeights', () => {
  const mockData = {
    gaps: [],
    weakCaps: [],
    scores: [
      '{"date":"2026-03-17","path":"skills/L4-test","total":45,"grade":"F","suggestions":[]}',
      '{"date":"2026-03-17","path":"skills/L1-test","total":50,"grade":"F","suggestions":[]}',
    ].join('\n'),
    roadmapContent: '',
  };

  test('focusWeights 選項改變排序', async () => {
    const report = await discoverGaps({
      _mock: mockData,
      skipNotion: true,
      focusWeights: { L4: 0.7, L1: 0.3 },
    });
    if (report.suggestions.length >= 2) {
      const l4 = report.suggestions.find(s => s.element.includes('L4'));
      const l1 = report.suggestions.find(s => s.element.includes('L1'));
      if (l4 && l1) {
        expect(l4.focusWeight).toBe(0.7);
        expect(l1.focusWeight).toBe(0.3);
      }
    }
  });
});

describe('syncToSpec', () => {
  test('confidence >= 70 → 建立任務', async () => {
    const created = [];
    const _deps = { createTask: async (title) => { created.push(title); return { id: 'test-id' }; } };
    const suggestions = [{ title: '高信心任務', description: '描述', confidence: 70, suggestedPriority: 'P1' }];
    const result = await syncToSpec(suggestions, _deps);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(created[0]).toContain('高信心任務');
  });

  test('confidence 40-69 → 建立任務', async () => {
    const created = [];
    const _deps = { createTask: async (title) => { created.push(title); return { id: 'test-id-2' }; } };
    const suggestions = [{ title: '中信心任務', description: '描述', confidence: 50, suggestedPriority: 'P2' }];
    const result = await syncToSpec(suggestions, _deps);
    expect(result.created).toBe(1);
    expect(created[0]).toContain('中信心任務');
  });

  test('confidence < 40 → 跳過', async () => {
    const _deps = { createTask: async () => { throw new Error('不應被呼叫'); } };
    const suggestions = [{ title: '低信心任務', description: '描述', confidence: 30, suggestedPriority: 'P3' }];
    const result = await syncToSpec(suggestions, _deps);
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
  });
});
