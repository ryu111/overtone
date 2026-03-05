'use strict';
/**
 * pm-domain-research.test.js — PM 領域自主研究功能測試
 *
 * 測試 interview.js 新增的函式：
 *   - researchDomain(topic, options)
 *   - startInterview(featureName, outputPath, options)
 *   - getResearchQuestions(session)
 */

const { test, expect, describe } = require('bun:test');

const {
  researchDomain,
  startInterview,
  getResearchQuestions,
  init,
} = require('../../plugins/overtone/scripts/lib/interview');

// ── researchDomain 測試 ──

describe('researchDomain', () => {
  test('Scenario 1-1: 回傳正確結構 { summary, concepts, questions }', () => {
    // 由於測試環境中 claude -p 不可用，驗證 graceful fallback
    const result = researchDomain('電子商務結帳流程');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('concepts');
    expect(result).toHaveProperty('questions');
    expect(typeof result.summary).toBe('string');
    expect(Array.isArray(result.concepts)).toBe(true);
    expect(Array.isArray(result.questions)).toBe(true);
  });

  test('Scenario 1-2: 空字串 topic 回傳空結果', () => {
    const result = researchDomain('');
    expect(result.summary).toBe('');
    expect(result.concepts).toHaveLength(0);
    expect(result.questions).toHaveLength(0);
  });

  test('Scenario 1-3: null topic 回傳空結果（不拋錯）', () => {
    expect(() => {
      const result = researchDomain(null);
      expect(result.summary).toBe('');
      expect(result.concepts).toHaveLength(0);
      expect(result.questions).toHaveLength(0);
    }).not.toThrow();
  });

  test('Scenario 1-4: undefined topic 回傳空結果（不拋錯）', () => {
    expect(() => {
      const result = researchDomain(undefined);
      expect(result.summary).toBe('');
    }).not.toThrow();
  });

  test('Scenario 1-5: 純空白 topic 回傳空結果', () => {
    const result = researchDomain('   ');
    expect(result.summary).toBe('');
    expect(result.concepts).toHaveLength(0);
    expect(result.questions).toHaveLength(0);
  });

  test('Scenario 1-6: timeout 選項被接受（不拋錯）', () => {
    // 驗證 timeout 選項不會導致例外（claude -p 不可用時 fallback）
    expect(() => {
      researchDomain('測試領域', { timeout: 1000 });
    }).not.toThrow();
  });

  test('Scenario 1-7: claude -p 不可用時 graceful fallback 回傳空結果', () => {
    // 測試環境沒有 claude -p，應回傳 { summary: '', concepts: [], questions: [] }
    const result = researchDomain('任意領域研究主題');
    // 在測試環境中 claude -p 可能不可用，fallback 時確保回傳空結果而非拋錯
    expect(result).toBeDefined();
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('concepts');
    expect(result).toHaveProperty('questions');
  });
});

// ── startInterview 測試 ──

describe('startInterview', () => {
  test('Scenario 2-1: enableDomainResearch=false 時回傳標準 session（同 init）', () => {
    const session = startInterview('feature-test', '/tmp/output', {
      enableDomainResearch: false,
    });
    expect(session.featureName).toBe('feature-test');
    expect(session.outputPath).toBe('/tmp/output');
    expect(session.answers).toEqual({});
    expect(session.startedAt).toBeDefined();
    // 未啟用研究時，domainResearch 欄位不存在
    expect(session.domainResearch).toBeUndefined();
  });

  test('Scenario 2-2: 無 options 時行為同 init（向後相容）', () => {
    const session = startInterview('backward-compat', '/tmp/output');
    expect(session.featureName).toBe('backward-compat');
    expect(session.answers).toEqual({});
    expect(session.domainResearch).toBeUndefined();
  });

  test('Scenario 2-3: enableDomainResearch=true 時 session 含 domainResearch 欄位', () => {
    const session = startInterview('domain-research-test', '/tmp/output', {
      enableDomainResearch: true,
    });
    expect(session.featureName).toBe('domain-research-test');
    // domainResearch 欄位應存在（即使 claude -p 不可用，也是 fallback 空結果）
    expect(session).toHaveProperty('domainResearch');
    expect(session.domainResearch).toHaveProperty('summary');
    expect(session.domainResearch).toHaveProperty('concepts');
    expect(session.domainResearch).toHaveProperty('questions');
  });

  test('Scenario 2-4: enableDomainResearch=true 時 domainResearch 欄位為正確型別', () => {
    const session = startInterview('type-check-test', '/tmp/output', {
      enableDomainResearch: true,
    });
    const dr = session.domainResearch;
    expect(typeof dr.summary).toBe('string');
    expect(Array.isArray(dr.concepts)).toBe(true);
    expect(Array.isArray(dr.questions)).toBe(true);
  });

  test('Scenario 2-5: featureName 為空字串時拋出 INVALID_INPUT 錯誤', () => {
    expect(() => {
      startInterview('', '/tmp/output');
    }).toThrow();
  });

  test('Scenario 2-6: options 傳遞給 init（minAnswersPerFacet / skipFacets）', () => {
    const session = startInterview('options-test', '/tmp/output', {
      minAnswersPerFacet: 3,
      skipFacets: ['ui'],
    });
    expect(session.options.minAnswersPerFacet).toBe(3);
    expect(session.options.skipFacets).toContain('ui');
  });
});

// ── getResearchQuestions 測試 ──

describe('getResearchQuestions', () => {
  test('Scenario 3-1: 無 domainResearch 的 session 回傳空陣列', () => {
    const session = init('no-research', '/tmp/output');
    const questions = getResearchQuestions(session);
    expect(questions).toEqual([]);
  });

  test('Scenario 3-2: domainResearch.questions 為空時回傳空陣列', () => {
    const session = {
      ...init('empty-research', '/tmp/output'),
      domainResearch: { summary: '摘要', concepts: [], questions: [] },
    };
    const questions = getResearchQuestions(session);
    expect(questions).toEqual([]);
  });

  test('Scenario 3-3: domainResearch.questions 轉換成帶 source 標記的問題物件', () => {
    const session = {
      ...init('research-with-questions', '/tmp/output'),
      domainResearch: {
        summary: '測試摘要',
        concepts: ['概念 A', '概念 B'],
        questions: ['深度問題 1', '深度問題 2', '深度問題 3'],
      },
    };
    const questions = getResearchQuestions(session);
    expect(questions).toHaveLength(3);
    expect(questions[0].text).toBe('深度問題 1');
    expect(questions[0].source).toBe('research');
    expect(questions[1].text).toBe('深度問題 2');
    expect(questions[2].text).toBe('深度問題 3');
  });

  test('Scenario 3-4: 每個問題有正確的 id 格式（research-N）', () => {
    const session = {
      ...init('id-format-test', '/tmp/output'),
      domainResearch: {
        summary: '摘要',
        concepts: [],
        questions: ['問題 A', '問題 B'],
      },
    };
    const questions = getResearchQuestions(session);
    expect(questions[0].id).toBe('research-1');
    expect(questions[1].id).toBe('research-2');
  });

  test('Scenario 3-5: 每個問題有正確的結構（id/facet/text/required/dependsOn/source）', () => {
    const session = {
      ...init('structure-test', '/tmp/output'),
      domainResearch: {
        summary: '摘要',
        concepts: [],
        questions: ['測試深度問題'],
      },
    };
    const questions = getResearchQuestions(session);
    const q = questions[0];
    expect(q).toHaveProperty('id');
    expect(q).toHaveProperty('facet');
    expect(q).toHaveProperty('text');
    expect(q).toHaveProperty('required');
    expect(q).toHaveProperty('dependsOn');
    expect(q).toHaveProperty('source');
    expect(q.required).toBe(false);
    expect(q.dependsOn).toBeNull();
    expect(q.source).toBe('research');
  });

  test('Scenario 3-6: null session 回傳空陣列（不拋錯）', () => {
    expect(() => {
      const questions = getResearchQuestions(null);
      expect(questions).toEqual([]);
    }).not.toThrow();
  });
});
