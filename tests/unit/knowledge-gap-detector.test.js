'use strict';
/**
 * knowledge-gap-detector.test.js
 * 測試 detectKnowledgeGaps 函式
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { detectKnowledgeGaps, DOMAIN_KEYWORDS } = require(join(SCRIPTS_LIB, 'knowledge/knowledge-gap-detector'));

// ── Feature 2: detectKnowledgeGaps ──

describe('detectKnowledgeGaps — Scenario 2-1: Security 關鍵詞且 agent 無對應 skill', () => {
  it('偵測到 security-kb 缺口，score >= 0.2，matchedKeywords 含命中詞', () => {
    const prompt = 'check for security vulnerabilities, xss injection';
    const agentSkills = ['commit-convention'];

    const gaps = detectKnowledgeGaps(prompt, agentSkills);

    const secGap = gaps.find(g => g.domain === 'security-kb');
    expect(secGap).toBeDefined();
    expect(secGap.score).toBeGreaterThanOrEqual(0.2);
    expect(Array.isArray(secGap.matchedKeywords)).toBe(true);
    // 必須包含至少一個命中詞
    const hasSecurityKw = secGap.matchedKeywords.some(kw =>
      ['security', 'xss', 'injection', 'vulnerabilities', 'vulnerability'].some(w => kw.includes(w))
    );
    expect(hasSecurityKw).toBe(true);
  });
});

describe('detectKnowledgeGaps — Scenario 2-2: Agent 已有對應 skill 時不報告缺口', () => {
  it('agentSkills 含 testing 時不回報 testing 缺口', () => {
    const prompt = 'write tests, check coverage, use bun:test describe it expect';
    const agentSkills = ['testing'];

    const gaps = detectKnowledgeGaps(prompt, agentSkills);

    const testingGap = gaps.find(g => g.domain === 'testing');
    expect(testingGap).toBeUndefined();
  });
});

describe('detectKnowledgeGaps — Scenario 2-3: 空 prompt 回傳空陣列', () => {
  it('空字串回傳 []', () => {
    const gaps = detectKnowledgeGaps('', []);
    expect(gaps).toEqual([]);
  });

  it('只含空白的 prompt 回傳 []', () => {
    const gaps = detectKnowledgeGaps('   ', []);
    expect(gaps).toEqual([]);
  });
});

describe('detectKnowledgeGaps — Scenario 2-4: 命中率低於門檻時不回報', () => {
  it('prompt 只含 "review"（命中 1 個關鍵詞），score < 0.2 時不回報 testing', () => {
    // "review" 是 testing domain 的一個關鍵詞（或不在其中）
    // 此測試驗證低命中率不會誤報
    const prompt = 'please do a review';
    const agentSkills = [];

    const gaps = detectKnowledgeGaps(prompt, agentSkills, { minScore: 0.2 });

    // "review" 不在 testing DOMAIN_KEYWORDS 中（只有 'review' 不出現在那裡）
    const testingGap = gaps.find(g => g.domain === 'testing');
    // testing domain 沒有 "review" 關鍵詞，所以不應出現
    const testingKeywords = DOMAIN_KEYWORDS['testing'];
    const promptLower = prompt.toLowerCase();
    const matched = testingKeywords.filter(kw => promptLower.includes(kw.toLowerCase()));
    const score = matched.length / testingKeywords.length;
    if (score < 0.2) {
      expect(testingGap).toBeUndefined();
    }
    // 無論如何不拋例外
  });
});

describe('detectKnowledgeGaps — Scenario 2-5: 多 domain 命中時按 score 降序排列取前 maxGaps', () => {
  it('maxGaps=1 時只回傳 1 個分數最高的缺口', () => {
    const prompt = [
      'write tests with bun:test describe it expect mock stub assert coverage',
      'security vulnerability xss injection csrf authentication authorization encrypt',
    ].join(' ');
    const agentSkills = [];

    const gaps = detectKnowledgeGaps(prompt, agentSkills, { maxGaps: 1 });

    expect(gaps.length).toBe(1);
    // 確認只回傳最高分的那一個
    expect(gaps[0].score).toBeGreaterThan(0);
  });

  it('多個 domain 命中時回傳結果依 score 降序排列', () => {
    const prompt = [
      'write tests with bun:test describe it expect mock stub assert coverage',
      'security vulnerability xss injection csrf auth',
    ].join(' ');
    const agentSkills = [];

    const gaps = detectKnowledgeGaps(prompt, agentSkills, { maxGaps: 3 });

    expect(gaps.length).toBeGreaterThan(0);
    // 驗證降序排列
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i - 1].score).toBeGreaterThanOrEqual(gaps[i].score);
    }
  });
});

describe('detectKnowledgeGaps — Scenario 2-6: 大小寫不影響比對', () => {
  it('大寫 SECURITY VULNERABILITY XSS 仍能偵測到 security-kb 缺口', () => {
    const prompt = 'SECURITY VULNERABILITY XSS';
    const agentSkills = [];

    const gaps = detectKnowledgeGaps(prompt, agentSkills);

    const secGap = gaps.find(g => g.domain === 'security-kb');
    expect(secGap).toBeDefined();
    expect(secGap.score).toBeGreaterThanOrEqual(0.2);
  });
});

describe('detectKnowledgeGaps — Scenario 2-7: agentSkills 為 undefined 時不拋例外', () => {
  it('不拋例外且回傳有效陣列', () => {
    const prompt = 'write tests with bun:test describe it expect';

    let result;
    expect(() => {
      result = detectKnowledgeGaps(prompt, undefined);
    }).not.toThrow();

    expect(Array.isArray(result)).toBe(true);
  });
});

describe('detectKnowledgeGaps — Scenario 2-8: os-control 關鍵詞且 agent 無對應 skill', () => {
  it('偵測到 os-control 缺口，score >= 0.2，matchedKeywords 含命中詞', () => {
    const prompt = 'take screenshot and copy to clipboard, watch window notification';
    const agentSkills = [];

    const gaps = detectKnowledgeGaps(prompt, agentSkills);

    const osGap = gaps.find(g => g.domain === 'os-control');
    expect(osGap).toBeDefined();
    expect(osGap.score).toBeGreaterThanOrEqual(0.2);
    expect(Array.isArray(osGap.matchedKeywords)).toBe(true);
    const hasOsKw = osGap.matchedKeywords.some(kw =>
      ['screenshot', 'clipboard', 'window', 'notification'].some(w => kw.includes(w))
    );
    expect(hasOsKw).toBe(true);
  });
});

describe('detectKnowledgeGaps — Scenario 2-9: autonomous-control 關鍵詞且 agent 無對應 skill', () => {
  it('偵測到 autonomous-control 缺口，score >= 0.2，matchedKeywords 含命中詞', () => {
    const prompt = 'start heartbeat daemon, manage execution queue, spawn background scheduled task';
    const agentSkills = [];

    const gaps = detectKnowledgeGaps(prompt, agentSkills);

    const autoGap = gaps.find(g => g.domain === 'autonomous-control');
    expect(autoGap).toBeDefined();
    expect(autoGap.score).toBeGreaterThanOrEqual(0.2);
    expect(Array.isArray(autoGap.matchedKeywords)).toBe(true);
    const hasAutoKw = autoGap.matchedKeywords.some(kw =>
      ['heartbeat', 'daemon', 'spawn', 'queue', 'background', 'scheduled'].some(w => kw.includes(w))
    );
    expect(hasAutoKw).toBe(true);
  });
});

describe('detectKnowledgeGaps — Scenario 2-10: craft 關鍵詞且 agent 無對應 skill', () => {
  it('偵測到 craft 缺口，score >= 0.2，matchedKeywords 含命中詞', () => {
    const prompt = 'check health-check invariant and closed-loop recovery guard principle validate';
    const agentSkills = [];

    const gaps = detectKnowledgeGaps(prompt, agentSkills);

    const craftGap = gaps.find(g => g.domain === 'craft');
    expect(craftGap).toBeDefined();
    expect(craftGap.score).toBeGreaterThanOrEqual(0.2);
    expect(Array.isArray(craftGap.matchedKeywords)).toBe(true);
    const hasCraftKw = craftGap.matchedKeywords.some(kw =>
      ['principle', 'invariant', 'guard', 'closed-loop', 'health-check', 'validate', 'recovery'].some(w => kw.includes(w))
    );
    expect(hasCraftKw).toBe(true);
  });
});

describe('detectKnowledgeGaps — 額外邊界情況', () => {
  it('null prompt 回傳空陣列', () => {
    const gaps = detectKnowledgeGaps(null, []);
    expect(gaps).toEqual([]);
  });

  it('agentSkills 為 null 時不拋例外', () => {
    expect(() => detectKnowledgeGaps('test spec coverage', null)).not.toThrow();
  });

  it('DOMAIN_KEYWORDS 有 15 個 domain', () => {
    expect(Object.keys(DOMAIN_KEYWORDS).length).toBe(15);
  });

  it('每個 domain 至少有 10 個關鍵詞', () => {
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      expect(keywords.length).toBeGreaterThanOrEqual(10);
    }
  });
});
