'use strict';
/**
 * knowledge-searcher.test.js
 * 測試 searchKnowledge 和 extractKnowledge 函式
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { SCRIPTS_LIB, PLUGIN_ROOT } = require('../helpers/paths');

const { searchKnowledge, extractKnowledge } = require(join(SCRIPTS_LIB, 'knowledge/knowledge-searcher'));

// ── 測試用臨時目錄 ──

const TMP_ROOT = join(__dirname, '..', '..', '.test-tmp-knowledge-searcher');

function setupTmpPlugin() {
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true, force: true });
  // 建立 skills/testing/references/test-anti-patterns.md
  const refDir = join(TMP_ROOT, 'skills', 'testing', 'references');
  mkdirSync(refDir, { recursive: true });
  writeFileSync(
    join(refDir, 'test-anti-patterns.md'),
    '# Test Anti-Patterns\ntesting best practices for anti-patterns\n'.repeat(5),
    'utf8'
  );
  // 建立 scripts/lib/instinct.js（codebase source 使用）
  const libDir = join(TMP_ROOT, 'scripts', 'lib');
  mkdirSync(libDir, { recursive: true });
  writeFileSync(
    join(libDir, 'instinct.js'),
    "'use strict';\n// instinct observation module\n",
    'utf8'
  );
  return TMP_ROOT;
}

afterEach(() => {
  if (existsSync(TMP_ROOT)) {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  }
});

// ── Feature 3: searchKnowledge ──

describe('searchKnowledge — Scenario 3-1: 搜尋 Skill references 回傳匹配結果', () => {
  it('搜尋 test anti-patterns 找到 testing domain 的 reference', () => {
    const pluginRoot = setupTmpPlugin();
    const results = searchKnowledge('test anti-patterns', { pluginRoot });

    expect(Array.isArray(results)).toBe(true);
    const skillRefResult = results.find(r => r.source === 'skill-ref');
    expect(skillRefResult).toBeDefined();
    expect(skillRefResult.domain).toBe('testing');
    expect(typeof skillRefResult.content).toBe('string');
    expect(skillRefResult.path).toContain('test-anti-patterns.md');
  });

  it('content 長度不超過 500 chars（預設 maxCharsPerResult）', () => {
    const pluginRoot = setupTmpPlugin();
    const results = searchKnowledge('test anti-patterns', { pluginRoot });

    for (const r of results) {
      expect(r.content.length).toBeLessThanOrEqual(500);
    }
  });

  it('relevance 為 0~1 之間的數值', () => {
    const pluginRoot = setupTmpPlugin();
    const results = searchKnowledge('test anti-patterns', { pluginRoot });

    for (const r of results) {
      expect(r.relevance).toBeGreaterThanOrEqual(0);
      expect(r.relevance).toBeLessThanOrEqual(1);
    }
  });
});

describe('searchKnowledge — Scenario 3-3: 搜尋 codebase patterns 回傳模組資訊', () => {
  it('搜尋 instinct observation 找到 instinct.js', () => {
    const pluginRoot = setupTmpPlugin();
    const results = searchKnowledge('instinct observation', { pluginRoot });

    const codebaseResult = results.find(r => r.source === 'codebase');
    expect(codebaseResult).toBeDefined();
    expect(codebaseResult.path).toContain('instinct.js');
  });
});

describe('searchKnowledge — Scenario 3-4: 某個 source 失敗時靜默降級', () => {
  it('無效 sessionId 導致 instinct 失敗，其他 source 仍回傳結果', () => {
    const pluginRoot = setupTmpPlugin();

    let results;
    expect(() => {
      results = searchKnowledge('test', { sessionId: 'totally-invalid-session-xyz', pluginRoot });
    }).not.toThrow();

    expect(Array.isArray(results)).toBe(true);
    // skill-ref source 應正常回傳（若有匹配）
  });

  it('query 為空時回傳空陣列', () => {
    const results = searchKnowledge('', {});
    expect(results).toEqual([]);
  });

  it('pluginRoot 不存在時不拋例外', () => {
    let results;
    expect(() => {
      results = searchKnowledge('test', { pluginRoot: '/nonexistent/path' });
    }).not.toThrow();
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('searchKnowledge — Scenario 3-2: 搜尋 instinct observations', () => {
  it('使用真實 pluginRoot 搜尋不拋例外', () => {
    // 實際測試需要有效 session，這裡驗證不拋例外和基本結構
    let results;
    expect(() => {
      results = searchKnowledge('security auth token', {
        sessionId: 'test-session-xxx',
        pluginRoot: PLUGIN_ROOT,
      });
    }).not.toThrow();
    expect(Array.isArray(results)).toBe(true);
  });
});

// ── Feature 3: extractKnowledge ──

describe('extractKnowledge — Scenario 3-5: 從 Handoff 結構提取 Findings 區塊', () => {
  it('含 ### Findings 區塊時提取並回傳正確結構', () => {
    const agentOutput = [
      '## HANDOFF: developer → reviewer',
      '',
      '### Context',
      '實作了知識引擎功能',
      '',
      '### Findings',
      '- 發現 A：使用 gray-matter 解析 frontmatter',
      '- 發現 B：atomicWrite 避免 race condition',
      '',
      '### Files Modified',
      '- hook-utils.js（修改）',
    ].join('\n');

    const context = { agentName: 'developer', stageName: 'DEV' };
    const fragments = extractKnowledge(agentOutput, context);

    const findingsFragment = fragments.find(f => f.type === 'findings');
    expect(findingsFragment).toBeDefined();
    expect(findingsFragment.content).toContain('發現 A');
    expect(findingsFragment.content).toContain('發現 B');
    expect(findingsFragment.source).toBe('developer:DEV Findings');
    expect(Array.isArray(findingsFragment.keywords)).toBe(true);
  });
});

describe('extractKnowledge — Scenario 3-6: 不含 Handoff 結構的輸出回傳空陣列', () => {
  it('普通散文無 ### Findings 或 ### Context 時回傳 []', () => {
    const agentOutput = '這是一段普通的文字，沒有任何 Handoff 結構。\n沒有 Findings，也沒有 Context。';

    const fragments = extractKnowledge(agentOutput, { agentName: 'developer' });
    expect(fragments).toEqual([]);
  });

  it('空字串回傳空陣列', () => {
    expect(extractKnowledge('', {})).toEqual([]);
  });

  it('null 回傳空陣列', () => {
    expect(extractKnowledge(null, {})).toEqual([]);
  });
});

describe('extractKnowledge — Scenario 3-7: 從 Context 區塊提取關鍵決策', () => {
  it('含 ### Context 區塊時提取並回傳 source 含 Context 的片段', () => {
    const agentOutput = [
      '### Context',
      '使用 atomicWrite 防止檔案損毀',
      '',
      '### Findings',
      '- 關鍵發現',
    ].join('\n');

    const context = { agentName: 'developer', stageName: 'DEV' };
    const fragments = extractKnowledge(agentOutput, context);

    const contextFragment = fragments.find(f => f.source.includes('Context'));
    expect(contextFragment).toBeDefined();
    expect(contextFragment.content).toContain('atomicWrite');
    expect(contextFragment.source).toContain('Context');
  });
});

describe('extractKnowledge — 邊界情況', () => {
  it('agentOutput 長度 3000 chars 時在 20ms 內完成', () => {
    const longOutput = '### Findings\n' + '- 發現內容\n'.repeat(200);
    const start = Date.now();
    extractKnowledge(longOutput, { agentName: 'developer', stageName: 'DEV' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(20);
  });

  it('context 無 agentName 時不拋例外', () => {
    expect(() => extractKnowledge('### Findings\n- 發現 A', {})).not.toThrow();
  });

  it('context 無 stageName 時 source 格式正確', () => {
    const fragments = extractKnowledge('### Findings\n- 發現 A', { agentName: 'developer' });
    if (fragments.length > 0) {
      expect(fragments[0].source).toContain('developer');
    }
  });
});
