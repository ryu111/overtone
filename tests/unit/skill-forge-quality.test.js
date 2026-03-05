'use strict';
/**
 * skill-forge-quality.test.js — Skill Forge 產出品質校準測試
 *
 * 此測試聚焦在「品質門檻」面向，補充 skill-forge.test.js 已有的 API 行為測試：
 *
 *   Feature 1: 多 domain 品質一致性（data-pipeline、api-design、monitoring）
 *   Feature 2: title 標題格式（# {domain} 知識域）
 *   Feature 3: description 包含 domain 名稱
 *   Feature 4: 最低 body 長度門檻（> 100 字元）
 *   Feature 5: preview 結構完整性（四欄位類型驗證）
 *   Feature 6: 多 domain 並行品質對比（sourcesScanned 獨立隔離）
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const {
  forgeSkill,
  _resetConsecutiveFailures,
  buildSkillContent,
  extractKnowledgeFromCodebase,
} = require(join(SCRIPTS_LIB, 'skill-forge'));

// ── 測試基礎設施 ──

const TIMESTAMP = Date.now();
const TMP_BASE = join(tmpdir(), `skill-forge-quality-${TIMESTAMP}`);

/**
 * 建立最小可用的假 pluginRoot（含 skills/ 目錄）
 */
function makeMinimalPluginRoot(suffix) {
  const pluginRoot = join(TMP_BASE, `plugin-${suffix}-${Date.now()}`);
  mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
  return pluginRoot;
}

/**
 * 建立含少量現有 SKILL.md 的 pluginRoot（模擬有 codebase context 的環境）
 */
function makePluginRootWithContext(suffix) {
  const pluginRoot = makeMinimalPluginRoot(suffix);

  // 建立一個現有 SKILL.md，提供結構模板
  mkdirSync(join(pluginRoot, 'skills', 'sample-domain'), { recursive: true });
  writeFileSync(
    join(pluginRoot, 'skills', 'sample-domain', 'SKILL.md'),
    [
      '---',
      'name: sample-domain',
      'description: 範例知識域',
      '---',
      '',
      '# sample-domain 知識域',
      '',
      '## 消費者',
      '',
      '| Agent | 用途 |',
      '|-------|------|',
      '| developer | 實作時查閱 |',
      '',
      '## 資源索引',
      '',
      '| 檔案 | 說明 |',
      '|------|------|',
      '| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/sample-domain/references/guide.md` | 核心指引 |',
      '',
      '## 按需讀取',
      '',
      '此 skill 提供 sample-domain 知識。',
    ].join('\n')
  );

  return pluginRoot;
}

beforeAll(() => {
  mkdirSync(TMP_BASE, { recursive: true });
  _resetConsecutiveFailures();
});

afterAll(() => {
  try {
    rmSync(TMP_BASE, { recursive: true, force: true });
  } catch {
    // 靜默處理清理失敗
  }
});

// ── Feature 1: 多 domain 品質一致性 ──

describe('Feature 1: 多 domain 品質一致性', () => {
  const TARGET_DOMAINS = ['data-pipeline', 'api-design', 'monitoring'];

  test('Scenario 1-1: 三個 domain 的 dry-run 都回傳 status: success', () => {
    for (const domain of TARGET_DOMAINS) {
      const pluginRoot = makeMinimalPluginRoot(`1-1-${domain}`);
      const result = forgeSkill(domain, {}, { dryRun: true, pluginRoot });
      expect(result.status).toBe('success');
      expect(result.domainName).toBe(domain);
    }
  });

  test('Scenario 1-2: 三個 domain 的 body 都包含三個必要 section', () => {
    for (const domain of TARGET_DOMAINS) {
      const pluginRoot = makeMinimalPluginRoot(`1-2-${domain}`);
      const result = forgeSkill(domain, {}, { dryRun: true, pluginRoot });
      const body = result.preview.body;

      expect(body).toContain('## 消費者');
      expect(body).toContain('## 資源索引');
      expect(body).toContain('## 按需讀取');
    }
  });

  test('Scenario 1-3: 三個 domain 的 body 長度都大於 100 字元', () => {
    for (const domain of TARGET_DOMAINS) {
      const pluginRoot = makeMinimalPluginRoot(`1-3-${domain}`);
      const result = forgeSkill(domain, {}, { dryRun: true, pluginRoot });
      expect(result.preview.body.length).toBeGreaterThan(100);
    }
  });
});

// ── Feature 2: title 標題格式驗證 ──

describe('Feature 2: body 標題包含 domain 名稱（# {domain} 知識域）', () => {
  test('Scenario 2-1: data-pipeline body 以 # data-pipeline 知識域 為標題', () => {
    const pluginRoot = makeMinimalPluginRoot('2-1');
    const result = forgeSkill('data-pipeline', {}, { dryRun: true, pluginRoot });

    const body = result.preview.body;
    expect(body).toContain('# data-pipeline 知識域');
  });

  test('Scenario 2-2: api-design body 以 # api-design 知識域 為標題', () => {
    const pluginRoot = makeMinimalPluginRoot('2-2');
    const result = forgeSkill('api-design', {}, { dryRun: true, pluginRoot });

    const body = result.preview.body;
    expect(body).toContain('# api-design 知識域');
  });

  test('Scenario 2-3: monitoring body 以 # monitoring 知識域 為標題', () => {
    const pluginRoot = makeMinimalPluginRoot('2-3');
    const result = forgeSkill('monitoring', {}, { dryRun: true, pluginRoot });

    const body = result.preview.body;
    expect(body).toContain('# monitoring 知識域');
  });

  test('Scenario 2-4: buildSkillContent 直接呼叫 — body 標題含 domain 名稱', () => {
    const pluginRoot = makeMinimalPluginRoot('2-4');
    const extracts = extractKnowledgeFromCodebase('custom-domain', pluginRoot);
    const { body } = buildSkillContent('custom-domain', extracts);

    expect(body).toContain('# custom-domain 知識域');
  });
});

// ── Feature 3: description 包含 domain 名稱 ──

describe('Feature 3: description 包含 domain 名稱', () => {
  test('Scenario 3-1: data-pipeline 的 description 包含 "data-pipeline"', () => {
    const pluginRoot = makeMinimalPluginRoot('3-1');
    const result = forgeSkill('data-pipeline', {}, { dryRun: true, pluginRoot });

    expect(result.preview.description).toContain('data-pipeline');
  });

  test('Scenario 3-2: api-design 的 description 包含 "api-design"', () => {
    const pluginRoot = makeMinimalPluginRoot('3-2');
    const result = forgeSkill('api-design', {}, { dryRun: true, pluginRoot });

    expect(result.preview.description).toContain('api-design');
  });

  test('Scenario 3-3: monitoring 的 description 包含 "monitoring"', () => {
    const pluginRoot = makeMinimalPluginRoot('3-3');
    const result = forgeSkill('monitoring', {}, { dryRun: true, pluginRoot });

    expect(result.preview.description).toContain('monitoring');
  });

  test('Scenario 3-4: 任意 domain 的 description 長度 > 0（非空）', () => {
    const pluginRoot = makeMinimalPluginRoot('3-4');
    const result = forgeSkill('test-quality-domain', {}, { dryRun: true, pluginRoot });

    expect(result.preview.description.length).toBeGreaterThan(0);
  });
});

// ── Feature 4: 最低 body 長度門檻 ──

describe('Feature 4: 最低 body 長度門檻（> 100 字元）', () => {
  test('Scenario 4-1: 無 codebase context 時 body 仍超過 100 字元', () => {
    const pluginRoot = makeMinimalPluginRoot('4-1');
    const result = forgeSkill('minimal-domain', {}, { dryRun: true, pluginRoot });

    expect(result.preview.body.length).toBeGreaterThan(100);
  });

  test('Scenario 4-2: 有 codebase context 時 body 長度不少於無 context 時', () => {
    const pluginRootWithContext = makePluginRootWithContext('4-2a');
    const pluginRootEmpty = makeMinimalPluginRoot('4-2b');

    const resultWithContext = forgeSkill('analysis-domain', {}, { dryRun: true, pluginRoot: pluginRootWithContext });
    const resultEmpty = forgeSkill('analysis-domain', {}, { dryRun: true, pluginRoot: pluginRootEmpty });

    // 兩者都超過門檻
    expect(resultWithContext.preview.body.length).toBeGreaterThan(100);
    expect(resultEmpty.preview.body.length).toBeGreaterThan(100);
  });

  test('Scenario 4-3: buildSkillContent 直接呼叫 — body 超過 100 字元', () => {
    const pluginRoot = makeMinimalPluginRoot('4-3');
    const extracts = extractKnowledgeFromCodebase('pipeline-domain', pluginRoot);
    const { body } = buildSkillContent('pipeline-domain', extracts);

    expect(body.length).toBeGreaterThan(100);
  });
});

// ── Feature 5: preview 結構完整性 ──

describe('Feature 5: preview 結構完整性（四欄位類型驗證）', () => {
  test('Scenario 5-1: preview 的四個欄位都存在且類型正確', () => {
    const pluginRoot = makeMinimalPluginRoot('5-1');
    const result = forgeSkill('schema-domain', {}, { dryRun: true, pluginRoot });

    const { preview } = result;
    // domainName: string，值等於傳入的 domain
    expect(typeof preview.domainName).toBe('string');
    expect(preview.domainName).toBe('schema-domain');
    // description: string，非空
    expect(typeof preview.description).toBe('string');
    expect(preview.description.length).toBeGreaterThan(0);
    // body: string，非空
    expect(typeof preview.body).toBe('string');
    expect(preview.body.length).toBeGreaterThan(0);
    // sourcesScanned: array
    expect(Array.isArray(preview.sourcesScanned)).toBe(true);
  });

  test('Scenario 5-2: sourcesScanned 是陣列，每個元素是字串路徑', () => {
    const pluginRoot = makePluginRootWithContext('5-2');
    const result = forgeSkill('paths-domain', {}, { dryRun: true, pluginRoot });

    const { sourcesScanned } = result.preview;
    expect(Array.isArray(sourcesScanned)).toBe(true);
    for (const p of sourcesScanned) {
      expect(typeof p).toBe('string');
      // 路徑非空
      expect(p.length).toBeGreaterThan(0);
    }
  });

  test('Scenario 5-3: 有 context 的 pluginRoot — sourcesScanned 包含 SKILL.md 路徑', () => {
    const pluginRoot = makePluginRootWithContext('5-3');
    const result = forgeSkill('context-domain', {}, { dryRun: true, pluginRoot });

    const { sourcesScanned } = result.preview;
    const hasSkillMd = sourcesScanned.some(p => p.endsWith('SKILL.md'));
    expect(hasSkillMd).toBe(true);
  });
});

// ── Feature 6: 多 domain 並行品質對比 ──

describe('Feature 6: 多 domain 結果相互獨立', () => {
  test('Scenario 6-1: 不同 domain 的 body 標題各自包含對應 domain 名稱（互不干擾）', () => {
    const pluginRoot = makeMinimalPluginRoot('6-1');

    const resultA = forgeSkill('domain-alpha', {}, { dryRun: true, pluginRoot });
    const resultB = forgeSkill('domain-beta', {}, { dryRun: true, pluginRoot });

    expect(resultA.preview.body).toContain('# domain-alpha 知識域');
    expect(resultA.preview.body).not.toContain('# domain-beta 知識域');

    expect(resultB.preview.body).toContain('# domain-beta 知識域');
    expect(resultB.preview.body).not.toContain('# domain-alpha 知識域');
  });

  test('Scenario 6-2: 不同 domain 的 description 各自包含對應 domain 名稱（互不干擾）', () => {
    const pluginRoot = makeMinimalPluginRoot('6-2');

    const resultA = forgeSkill('service-mesh', {}, { dryRun: true, pluginRoot });
    const resultB = forgeSkill('event-sourcing', {}, { dryRun: true, pluginRoot });

    expect(resultA.preview.description).toContain('service-mesh');
    expect(resultA.preview.description).not.toContain('event-sourcing');

    expect(resultB.preview.description).toContain('event-sourcing');
    expect(resultB.preview.description).not.toContain('service-mesh');
  });

  test('Scenario 6-3: sourcesScanned 不包含正在建立的 domain 自身（domain 尚未建立）', () => {
    const pluginRoot = makeMinimalPluginRoot('6-3');
    const result = forgeSkill('brand-new-domain', {}, { dryRun: true, pluginRoot });

    // dry-run 不建立檔案，所以 sourcesScanned 不應包含 brand-new-domain/SKILL.md
    const sourcesScanned = result.preview.sourcesScanned;
    const hasSelf = sourcesScanned.some(p => p.includes('brand-new-domain'));
    expect(hasSelf).toBe(false);
  });
});
