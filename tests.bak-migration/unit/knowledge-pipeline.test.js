import { describe, test, expect } from 'bun:test';
import { evaluate, filterEligible } from '/Users/sbu/.claude/scripts/lib/knowledge/skill-evaluator.js';
import { generalize } from '/Users/sbu/.claude/scripts/lib/knowledge/skill-generalizer.js';
import { parseInternalized, buildIndex, queryRelevant } from '/Users/sbu/.claude/scripts/lib/knowledge/experience-index.js';

// ─── skill-evaluator ─────────────────────────────────────────────────────────

describe('skill-evaluator', () => {
  test('達標行為應回傳 eligible=true', () => {
    const behavior = {
      id: 'test-behavior',
      polarity: 1,
      confidence: 0.8,
      occurrences: ['a', 'b', 'c'],
    };
    const result = evaluate(behavior);
    expect(result.eligible).toBe(true);
  });

  test('polarity=-1 的反向行為不應達標', () => {
    const behavior = {
      id: 'anti-behavior',
      polarity: -1,
      confidence: 0.9,
      occurrences: ['a', 'b', 'c'],
    };
    const result = evaluate(behavior);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('非正向行為');
  });

  test('信心低於 0.6 不應達標', () => {
    const behavior = {
      id: 'low-confidence',
      polarity: 1,
      confidence: 0.5,
      occurrences: ['a', 'b', 'c'],
    };
    const result = evaluate(behavior);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('0.6');
  });

  test('usageCount 少於 2 不應達標', () => {
    const behavior = {
      id: 'rare-behavior',
      polarity: 1,
      confidence: 0.8,
      occurrences: ['a'],
    };
    const result = evaluate(behavior);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('< 2');
  });

  test('usageCount 欄位（非 occurrences 陣列）也應正確計算', () => {
    const behavior = {
      id: 'usage-count-behavior',
      polarity: 1,
      confidence: 0.7,
      usageCount: 3,
    };
    const result = evaluate(behavior);
    expect(result.eligible).toBe(true);
  });

  test('空物件應回傳 eligible=false', () => {
    const result = evaluate(null);
    expect(result.eligible).toBe(false);
  });

  test('filterEligible 正確過濾達標行為', () => {
    const behaviors = [
      { id: 'a', polarity: 1, confidence: 0.8, occurrences: ['x', 'y'] },
      { id: 'b', polarity: -1, confidence: 0.9, occurrences: ['x', 'y'] },
      { id: 'c', polarity: 1, confidence: 0.4, occurrences: ['x', 'y'] },
      { id: 'd', polarity: 1, confidence: 0.7, occurrences: ['x', 'y', 'z'] },
    ];
    const result = filterEligible(behaviors);
    expect(result.length).toBe(2);
    expect(result.map(b => b.id)).toContain('a');
    expect(result.map(b => b.id)).toContain('d');
  });

  test('filterEligible 傳入非陣列應回傳空陣列', () => {
    expect(filterEligible(null)).toEqual([]);
    expect(filterEligible('string')).toEqual([]);
    expect(filterEligible({})).toEqual([]);
  });
});

// ─── skill-generalizer ───────────────────────────────────────────────────────

describe('skill-generalizer', () => {
  test('generalize 移除絕對路徑', () => {
    const behavior = {
      id: 'path-behavior',
      polarity: 1,
      confidence: 0.8,
      pattern: '讀取 /Users/sbu/.claude/hooks/server.js 設定',
      description: '從 /Users/john/project 載入設定',
      suggestion: { type: 'rule', content: '路徑 /tmp/test.json 需要清理' },
    };
    const result = generalize(behavior);
    expect(result.title).not.toContain('/Users/');
    expect(result.knowledge).not.toContain('/Users/');
    expect(result.application).not.toContain('/tmp/');
    expect(result.title).toContain('<project-path>');
  });

  test('generalize 保留行為模式（非路徑文字）', () => {
    const behavior = {
      id: 'pattern-behavior',
      polarity: 1,
      confidence: 0.8,
      pattern: '並行執行獨立任務以提升效率',
      description: '並行優先原則',
      suggestion: { type: 'rule', content: '獨立任務應並行執行' },
    };
    const result = generalize(behavior);
    expect(result.knowledge).toBe('並行執行獨立任務以提升效率');
    expect(result.application).toBe('獨立任務應並行執行');
  });

  test('generalize 移除版本號', () => {
    const behavior = {
      id: 'version-behavior',
      polarity: 1,
      confidence: 0.8,
      pattern: '升級到 v1.2.3 後效能提升',
      suggestion: { type: 'automation', content: '版本 0.28.94 的設定' },
    };
    const result = generalize(behavior);
    expect(result.title).not.toContain('v1.2.3');
    expect(result.application).not.toContain('0.28.94');
    expect(result.title).toContain('<version>');
  });

  test('generalize 移除 ISO timestamp', () => {
    const behavior = {
      id: 'ts-behavior',
      polarity: 1,
      confidence: 0.8,
      pattern: '2026-03-17T10:00:00Z 發生的事件',
      suggestion: { type: 'rule', content: '記錄時間' },
    };
    const result = generalize(behavior);
    expect(result.title).not.toContain('2026-03-17T');
    expect(result.title).toContain('<timestamp>');
  });

  test('generalize 保留 id、category、confidence 欄位', () => {
    const behavior = {
      id: 'check-fields',
      polarity: 1,
      confidence: 0.75,
      pattern: '測試模式',
      suggestion: { type: 'rule', content: '應用內容' },
    };
    const result = generalize(behavior);
    expect(result.id).toBe('check-fields');
    expect(result.category).toBe('rule');
    expect(result.confidence).toBe(0.75);
  });

  test('generalize 傳入 null 應回傳 null', () => {
    expect(generalize(null)).toBeNull();
    expect(generalize(undefined)).toBeNull();
  });
});

// ─── experience-index ────────────────────────────────────────────────────────

describe('experience-index', () => {
  const SAMPLE_CONTENT = `---
lastUpdated: 2026-03-01T00:00:00Z
version: 1
---

# Internalized Knowledge

### [rule] 並行執行原則
<!-- id:parallel-rule -->
- **來源**：parallel / 2026-03-01
- **信心**：80%
- **知識**：獨立任務應並行執行
- **應用**：無依賴任務同時發出，不序列等待

### [automation] 自動化腳本
<!-- id:auto-script -->
- **來源**：auto / 2026-03-01
- **信心**：75%
- **知識**：重複操作應自動化
- **應用**：5 次以上重複的機械操作應提取為腳本

### [fix] 靜默失敗修復
<!-- id:silent-fix -->
- **來源**：fix / 2026-03-01
- **信心**：70%
- **知識**：catch 塊不應靜默吞掉錯誤
- **應用**：所有 catch 必須 console.error 或通知
`;

  test('parseInternalized 正確解析條目', () => {
    const entries = parseInternalized(SAMPLE_CONTENT);
    expect(entries.length).toBe(3);
  });

  test('parseInternalized 正確提取 category 和 title', () => {
    const entries = parseInternalized(SAMPLE_CONTENT);
    const ruleEntry = entries.find(e => e.id === 'parallel-rule');
    expect(ruleEntry).toBeTruthy();
    expect(ruleEntry.category).toBe('rule');
    expect(ruleEntry.title).toBe('並行執行原則');
  });

  test('parseInternalized 正確提取 knowledge 和 application', () => {
    const entries = parseInternalized(SAMPLE_CONTENT);
    const fixEntry = entries.find(e => e.id === 'silent-fix');
    expect(fixEntry).toBeTruthy();
    expect(fixEntry.knowledge).toBe('catch 塊不應靜默吞掉錯誤');
    expect(fixEntry.application).toContain('console.error');
  });

  test('parseInternalized 過濾 thinking dump（超過 500 字元且含英文推理詞）', () => {
    const thinkingDump = 'Thinking Process: ' + 'x'.repeat(490);
    const contentWithDump = SAMPLE_CONTENT + `\n### [fix] 有 thinking dump\n<!-- id:dump -->\n- **知識**：dump test\n- **應用**：${thinkingDump}\n`;
    const entries = parseInternalized(contentWithDump);
    const dumpEntry = entries.find(e => e.id === 'dump');
    expect(dumpEntry).toBeUndefined();
  });

  test('parseInternalized 傳入空字串或 null 應回傳空陣列', () => {
    expect(parseInternalized('')).toEqual([]);
    expect(parseInternalized(null)).toEqual([]);
  });

  test('buildIndex 建立 domain -> entries 映射', () => {
    const entries = parseInternalized(SAMPLE_CONTENT);
    const index = buildIndex(entries);
    expect(index instanceof Map).toBe(true);
    expect(index.has('rule')).toBe(true);
    expect(index.has('automation')).toBe(true);
    expect(index.has('fix')).toBe(true);
  });

  test('buildIndex 每個 domain 包含正確的條目', () => {
    const entries = parseInternalized(SAMPLE_CONTENT);
    const index = buildIndex(entries);
    expect(index.get('rule').length).toBe(1);
    expect(index.get('automation').length).toBe(1);
    expect(index.get('fix').length).toBe(1);
  });

  test('buildIndex 傳入空陣列應回傳空 Map', () => {
    const index = buildIndex([]);
    expect(index.size).toBe(0);
  });

  test('queryRelevant 根據 prompt 關鍵詞回傳相關條目', () => {
    const entries = parseInternalized(SAMPLE_CONTENT);
    const index = buildIndex(entries);
    const results = queryRelevant(index, { prompt: '並行執行獨立任務', cwd: '/tmp' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('parallel-rule');
  });

  test('queryRelevant 無匹配時回傳 fallback（rule 和 automation 類別）', () => {
    const entries = parseInternalized(SAMPLE_CONTENT);
    const index = buildIndex(entries);
    const results = queryRelevant(index, { prompt: '完全不相關的內容zzz', cwd: '/tmp' });
    expect(results.length).toBeGreaterThan(0);
    // fallback 優先 rule/automation
    const categories = results.map(e => e.category);
    const hasRuleOrAuto = categories.some(c => c === 'rule' || c === 'automation');
    expect(hasRuleOrAuto).toBe(true);
  });

  test('queryRelevant 最多回傳 5 條', () => {
    // 建立 10 個相同 rule 條目
    const manyEntries = Array.from({ length: 10 }, (_, i) => ({
      id: `rule-${i}`,
      category: 'rule',
      title: '並行執行',
      knowledge: '並行執行原則測試',
      application: '並行測試應用',
    }));
    const index = buildIndex(manyEntries);
    const results = queryRelevant(index, { prompt: '並行執行', cwd: '/tmp' });
    expect(results.length).toBeLessThanOrEqual(5);
  });

  test('queryRelevant 傳入空 index 應回傳空陣列', () => {
    const results = queryRelevant(new Map(), { prompt: '測試' });
    expect(results).toEqual([]);
  });
});
