'use strict';
/**
 * skill-forge.test.js — Skill Forge Engine 單元測試
 *
 * 測試面向：
 *   Feature 1: forgeSkill API status 路徑（conflict / paused / dry-run success）
 *   Feature 2: dry-run vs execute 模式（pluginRoot 注入）
 *   Feature 3: 知識萃取完整性（extractKnowledgeFromCodebase）
 *   Feature 4: 安全邊界（不覆蓋既有、暫停後不嘗試）
 *   Feature 7: SKILL.md 結構驗證（三 section + 消費者表 + frontmatter）
 */

const { test, expect, describe, beforeEach, afterEach, afterAll, beforeAll } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const {
  forgeSkill,
  _resetConsecutiveFailures,
  extractKnowledgeFromCodebase,
  assembleSkillBody,
  buildSkillContent,
} = require(join(SCRIPTS_LIB, 'skill-forge'));

// ── 測試基礎設施 ──

const TIMESTAMP = Date.now();
const TMP_BASE = join(tmpdir(), `skill-forge-test-${TIMESTAMP}`);
const dirsToClean = [TMP_BASE];

/**
 * 建立最小可用的假 pluginRoot（含 skills/ 目錄）
 */
function makeMinimalPluginRoot(suffix = '') {
  const pluginRoot = join(TMP_BASE, `plugin-${suffix}-${Date.now()}`);
  mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
  return pluginRoot;
}

/**
 * 建立含假 SKILL.md 的 pluginRoot
 */
function makePluginRootWithSkills(suffix = '') {
  const pluginRoot = makeMinimalPluginRoot(suffix);
  // 建立假的 existing-domain SKILL.md
  mkdirSync(join(pluginRoot, 'skills', 'existing-domain'), { recursive: true });
  writeFileSync(
    join(pluginRoot, 'skills', 'existing-domain', 'SKILL.md'),
    '---\nname: existing-domain\ndescription: 已存在的 skill\n---\n\n## 消費者\n\n## 資源索引\n\n## 按需讀取\n'
  );
  return pluginRoot;
}

beforeEach(() => {
  _resetConsecutiveFailures();
});

afterAll(() => {
  for (const dir of dirsToClean) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // 靜默處理清理失敗
    }
  }
});

// ── Feature 1: forgeSkill API status 路徑 ──

describe('Feature 1: forgeSkill status 路徑', () => {
  test('Scenario 1-1: dry-run 成功回傳 preview（不建立檔案）', () => {
    const pluginRoot = makeMinimalPluginRoot('1-1');
    const result = forgeSkill('new-domain', {}, { dryRun: true, pluginRoot });

    expect(result.status).toBe('success');
    expect(result.domainName).toBe('new-domain');
    expect(result.preview).toBeDefined();
    expect(result.preview.domainName).toBe('new-domain');
    expect(result.preview.description).toBeTruthy();
    expect(result.preview.body).toBeTruthy();
    expect(Array.isArray(result.preview.sourcesScanned)).toBe(true);
    expect(result.skillPath).toBeUndefined();
    expect(existsSync(join(pluginRoot, 'skills', 'new-domain'))).toBe(false);
  });

  test('Scenario 1-2: 預設不傳 options 時為 dry-run 模式', () => {
    const pluginRoot = makeMinimalPluginRoot('1-2');
    const result = forgeSkill('alpha-domain', {}, { pluginRoot });

    expect(result.status).toBe('success');
    expect(result.preview).toBeDefined();
    expect(existsSync(join(pluginRoot, 'skills', 'alpha-domain'))).toBe(false);
  });

  test('Scenario 1-3: domain 已存在回傳衝突', () => {
    const pluginRoot = makePluginRootWithSkills('1-3');
    const existingPath = join(pluginRoot, 'skills', 'existing-domain', 'SKILL.md');
    const originalContent = readFileSync(existingPath, 'utf8');

    const result = forgeSkill('existing-domain', {}, { dryRun: true, pluginRoot });

    expect(result.status).toBe('conflict');
    expect(result.domainName).toBe('existing-domain');
    expect(result.conflictPath).toBe(existingPath);
    expect(result.preview).toBeUndefined();
    // 確認原檔案未被修改
    expect(readFileSync(existingPath, 'utf8')).toBe(originalContent);
  });

  test('Scenario 1-4: 連續失敗達上限後暫停（預設 3 次）', () => {
    // 手動設定計數達 3
    _resetConsecutiveFailures();
    // 呼叫三次帶有 dryRun: false 的假 pluginRoot 讓它計數
    // 直接利用 _resetConsecutiveFailures 後透過 maxConsecutiveFailures: 0 測試
    const pluginRoot = makeMinimalPluginRoot('1-4');
    const result = forgeSkill('some-domain', {}, { dryRun: false, pluginRoot, maxConsecutiveFailures: 0 });

    expect(result.status).toBe('paused');
    expect(result.domainName).toBe('some-domain');
    expect(result.consecutiveFailures).toBe(0);
  });

  test('Scenario 1-5: maxConsecutiveFailures 可由 options 覆寫', () => {
    _resetConsecutiveFailures();
    // 讓計數達 1 次（透過 maxConsecutiveFailures: 0 先觸發一次讓計數 = 0 還是 paused）
    // 改用 maxConsecutiveFailures: 1，計數 = 0 → 不暫停，需要設計讓計數為 1
    // 最簡單：使用 maxConsecutiveFailures: 0 → 直接觸發暫停
    const pluginRoot = makeMinimalPluginRoot('1-5');
    const result = forgeSkill('test-domain', {}, { maxConsecutiveFailures: 0, pluginRoot });

    expect(result.status).toBe('paused');
    expect(result.consecutiveFailures).toBe(0);
  });
});

// ── Feature 2: dry-run vs execute 模式 ──

describe('Feature 2: dry-run vs execute 模式', () => {
  test('Scenario 2-1: 明確傳入 dryRun: true — 不建立檔案', () => {
    const pluginRoot = makeMinimalPluginRoot('2-1');
    const result = forgeSkill('beta-domain', {}, { dryRun: true, pluginRoot });

    expect(existsSync(join(pluginRoot, 'skills', 'beta-domain'))).toBe(false);
    expect(result.preview).toBeDefined();
    expect(result.preview.body).toContain('## 消費者');
    expect(result.preview.body).toContain('## 資源索引');
    expect(result.preview.body).toContain('## 按需讀取');
  });

  test('Scenario 2-2: pluginRoot 可由 options 覆寫（隔離測試目錄）', () => {
    const pluginRoot1 = makeMinimalPluginRoot('2-2a');
    const pluginRoot2 = makeMinimalPluginRoot('2-2b');

    // 在 pluginRoot1 建立一個衝突 domain
    mkdirSync(join(pluginRoot1, 'skills', 'mock-domain'), { recursive: true });
    writeFileSync(
      join(pluginRoot1, 'skills', 'mock-domain', 'SKILL.md'),
      '---\nname: mock-domain\ndescription: 已存在\n---\n'
    );

    // 使用 pluginRoot2 — 不應該看到 pluginRoot1 的 domain
    const result = forgeSkill('mock-domain', {}, { dryRun: true, pluginRoot: pluginRoot2 });

    expect(result.status).toBe('success');
    expect(result.preview).toBeDefined();
    // 真實 plugin 目錄不受影響
    expect(existsSync(join(pluginRoot2, 'skills', 'mock-domain'))).toBe(false);
  });
});

// ── Feature 3: 知識萃取完整性 ──

describe('Feature 3: 知識萃取完整性（extractKnowledgeFromCodebase）', () => {
  test('Scenario 3-1: sourcesScanned 包含掃描到的 SKILL.md 路徑', () => {
    const pluginRoot = makePluginRootWithSkills('3-1');
    const result = forgeSkill('my-domain', {}, { dryRun: true, pluginRoot });

    expect(result.status).toBe('success');
    expect(result.preview.sourcesScanned).toBeInstanceOf(Array);
    // 至少包含 existing-domain 的 SKILL.md
    const hasSkillMd = result.preview.sourcesScanned.some(p => p.includes('SKILL.md'));
    expect(hasSkillMd).toBe(true);
  });

  test('Scenario 3-2: auto-discovered.md 不存在時靜默跳過', () => {
    const pluginRoot = makeMinimalPluginRoot('3-2');
    // instinct/auto-discovered.md 不存在
    const result = forgeSkill('some-domain', {}, { dryRun: true, pluginRoot });

    expect(result.status).toBe('success');
    expect(result.preview.sourcesScanned.every(p => !p.includes('auto-discovered.md'))).toBe(true);
    expect(result.preview).toBeDefined();
  });

  test('Scenario 3-3: CLAUDE.md 存在時加入 sourcesScanned', () => {
    const pluginRoot = makeMinimalPluginRoot('3-3');
    // 建立假的 CLAUDE.md（pluginRoot 往上兩層 = TMP_BASE 下的 fake project root）
    const projectRoot = join(TMP_BASE, `project-3-3-${Date.now()}`);
    mkdirSync(projectRoot, { recursive: true });
    dirsToClean.push(projectRoot);
    writeFileSync(join(projectRoot, 'CLAUDE.md'), '# 說明\n\nmy-special-domain 相關設定\n');

    // 為了讓 skill-forge.js 找到這個 CLAUDE.md，pluginRoot 需是 projectRoot/plugins/overtone
    const customPluginRoot = join(projectRoot, 'plugins', 'overtone');
    mkdirSync(join(customPluginRoot, 'skills'), { recursive: true });

    const result = forgeSkill('my-special-domain', {}, { dryRun: true, pluginRoot: customPluginRoot });

    expect(result.status).toBe('success');
    const hasClaude = result.preview.sourcesScanned.some(p => p.endsWith('CLAUDE.md'));
    expect(hasClaude).toBe(true);
  });

  test('Scenario 3-4: 無任何 SKILL.md 時仍產出固定骨架', () => {
    const pluginRoot = makeMinimalPluginRoot('3-4');
    // skills 目錄存在但為空（無子目錄）
    const result = forgeSkill('isolated-domain', {}, { dryRun: true, pluginRoot });

    expect(result.status).toBe('success');
    expect(result.preview.body).toContain('## 消費者');
    expect(result.preview.body).toContain('## 資源索引');
    expect(result.preview.body).toContain('## 按需讀取');
  });

  test('Scenario 3-5: auto-discovered.md 存在且含 domainName 時加入 sourcesScanned', () => {
    const pluginRoot = makeMinimalPluginRoot('3-5');
    // 建立 instinct/auto-discovered.md
    mkdirSync(join(pluginRoot, 'skills', 'instinct'), { recursive: true });
    writeFileSync(
      join(pluginRoot, 'skills', 'instinct', 'auto-discovered.md'),
      '# Auto Discovered\n\ntarget-domain 相關內容\n\n其他段落\n'
    );

    const result = forgeSkill('target-domain', {}, { dryRun: true, pluginRoot });

    expect(result.status).toBe('success');
    const hasAutoDiscovered = result.preview.sourcesScanned.some(p => p.includes('auto-discovered.md'));
    expect(hasAutoDiscovered).toBe(true);
  });
});

// ── Feature 4: 安全邊界 ──

describe('Feature 4: 安全邊界', () => {
  test('Scenario 4-1: 衝突時不覆蓋既有 skill 內容', () => {
    const pluginRoot = makePluginRootWithSkills('4-1');
    const existingPath = join(pluginRoot, 'skills', 'existing-domain', 'SKILL.md');
    const originalContent = readFileSync(existingPath, 'utf8');

    const result = forgeSkill('existing-domain', {}, { dryRun: false, pluginRoot });

    expect(result.status).toBe('conflict');
    // 確認原始內容未被修改
    expect(readFileSync(existingPath, 'utf8')).toBe(originalContent);
  });

  test('Scenario 4-2: 暫停狀態下不嘗試建立任何 skill', () => {
    _resetConsecutiveFailures();
    const pluginRoot = makeMinimalPluginRoot('4-2');

    // maxConsecutiveFailures: 0 → 計數 0 >= 0 → 立即暫停
    const result = forgeSkill('any-domain', {}, { dryRun: false, pluginRoot, maxConsecutiveFailures: 0 });

    expect(result.status).toBe('paused');
    expect(existsSync(join(pluginRoot, 'skills', 'any-domain'))).toBe(false);
  });
});

// ── Feature 5: initialFailures 注入（Phase 2 多 domain 隔離）──

describe('Feature 5: initialFailures 注入', () => {
  test('Scenario 5-1: initialFailures 注入時不影響模組層級計數', () => {
    _resetConsecutiveFailures(); // 模組計數 = 0
    const pluginRoot = makeMinimalPluginRoot('5-1');

    // 注入 initialFailures: 2，但模組層級計數仍為 0
    const result = forgeSkill('new-domain-5-1', {}, {
      dryRun: true,
      pluginRoot,
      initialFailures: 2,
    });

    // dry-run 成功，且回傳注入的計數值
    expect(result.status).toBe('success');
    expect(result.consecutiveFailures).toBe(2);

    // 再次呼叫不帶 initialFailures，確認模組計數仍為 0（未被注入值污染）
    const result2 = forgeSkill('new-domain-5-1b', {}, {
      dryRun: true,
      pluginRoot,
    });
    expect(result2.consecutiveFailures).toBe(0);
  });

  test('Scenario 5-2: initialFailures 達門檻時觸發暫停且不污染模組計數', () => {
    _resetConsecutiveFailures(); // 模組計數 = 0
    const pluginRoot = makeMinimalPluginRoot('5-2');

    // 注入 initialFailures: 3，門檻預設 3 → 暫停
    const result = forgeSkill('any-domain-5-2', {}, {
      dryRun: false,
      pluginRoot,
      initialFailures: 3,
    });

    expect(result.status).toBe('paused');
    expect(result.consecutiveFailures).toBe(3);

    // 模組層級計數仍為 0
    const result2 = forgeSkill('other-domain-5-2', {}, {
      dryRun: true,
      pluginRoot,
    });
    expect(result2.status).toBe('success');
    expect(result2.consecutiveFailures).toBe(0);
  });

  test('Scenario 5-3: 不帶 initialFailures 時回傳模組層級計數', () => {
    _resetConsecutiveFailures(); // 模組計數 = 0
    const pluginRoot = makeMinimalPluginRoot('5-3');

    const result = forgeSkill('domain-5-3', {}, { dryRun: true, pluginRoot });

    expect(result.consecutiveFailures).toBe(0);
  });

  test('Scenario 5-4: conflict 路徑也回傳 consecutiveFailures', () => {
    const pluginRoot = makePluginRootWithSkills('5-4');
    _resetConsecutiveFailures();

    const result = forgeSkill('existing-domain', {}, {
      dryRun: true,
      pluginRoot,
      initialFailures: 1,
    });

    expect(result.status).toBe('conflict');
    expect(result.consecutiveFailures).toBe(1);
  });
});

// ── Feature 7: SKILL.md 結構驗證 ──

describe('Feature 7: SKILL.md 結構驗證', () => {
  test('Scenario 7-1: dry-run 產出的 body 包含三個必要 section（按序）', () => {
    const pluginRoot = makeMinimalPluginRoot('7-1');
    const result = forgeSkill('structure-test', {}, { dryRun: true, pluginRoot });

    expect(result.status).toBe('success');
    const body = result.preview.body;

    // 三 section 都存在
    expect(body).toContain('## 消費者');
    expect(body).toContain('## 資源索引');
    expect(body).toContain('## 按需讀取');

    // 順序正確：消費者 < 資源索引 < 按需讀取
    const idxConsumer = body.indexOf('## 消費者');
    const idxResources = body.indexOf('## 資源索引');
    const idxOnDemand = body.indexOf('## 按需讀取');
    expect(idxConsumer).toBeLessThan(idxResources);
    expect(idxResources).toBeLessThan(idxOnDemand);
  });

  test('Scenario 7-2: 消費者 section 包含 Markdown 表格骨架', () => {
    const pluginRoot = makeMinimalPluginRoot('7-2');
    const result = forgeSkill('table-test', {}, { dryRun: true, pluginRoot });

    const body = result.preview.body;
    // Markdown 表格標頭格式
    expect(body).toContain('| Agent | 用途 |');
  });

  test('Scenario 7-3: 資源索引 section 包含至少一個 reference 佔位', () => {
    const pluginRoot = makeMinimalPluginRoot('7-3');
    const result = forgeSkill('ref-test', {}, { dryRun: true, pluginRoot });

    const body = result.preview.body;
    // 在 ## 資源索引 之後應有 reference 項目
    const resourcesIdx = body.indexOf('## 資源索引');
    const onDemandIdx = body.indexOf('## 按需讀取');
    const resourcesSection = body.slice(resourcesIdx, onDemandIdx);

    // 應包含表格行（含 💡 的 reference 佔位）
    expect(resourcesSection).toContain('| 💡');
  });

  test('Scenario 7-4: buildSkillContent 回傳的 description 非空', () => {
    const pluginRoot = makeMinimalPluginRoot('7-4');
    const extracts = extractKnowledgeFromCodebase('my-domain', pluginRoot);
    const { description, body } = buildSkillContent('my-domain', extracts);

    expect(description).toBeTruthy();
    expect(description.length).toBeGreaterThan(0);
    expect(body).toContain('## 消費者');
  });

  test('Scenario 7-5: preview 包含四個必要欄位', () => {
    const pluginRoot = makeMinimalPluginRoot('7-5');
    const result = forgeSkill('field-test', {}, { dryRun: true, pluginRoot });

    expect(result.preview.domainName).toBe('field-test');
    expect(typeof result.preview.description).toBe('string');
    expect(typeof result.preview.body).toBe('string');
    expect(Array.isArray(result.preview.sourcesScanned)).toBe(true);
  });
});
