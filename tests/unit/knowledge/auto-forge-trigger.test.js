'use strict';
/**
 * auto-forge-trigger.test.js — shouldAutoForge + autoForge 單元測試
 *
 * 涵蓋：
 *   - shouldAutoForge：篩選低分 gap、排除已有 SKILL.md 的 domain、空 gaps
 *   - autoForge：dry-run 模式、多 domain 連續 forge、連續失敗暫停
 */

const { describe, it, expect, beforeAll, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../../helpers/paths');
const {
  shouldAutoForge,
  autoForge,
} = require(join(SCRIPTS_LIB, 'knowledge/knowledge-gap-detector'));

// ── 測試環境設置 ──

const TEST_DIR = join(tmpdir(), `auto-forge-trigger-test-${Date.now()}`);
// 模擬 plugin root：建立 skills/ 目錄結構
const MOCK_PLUGIN_ROOT = join(TEST_DIR, 'plugin');

beforeAll(() => {
  mkdirSync(join(MOCK_PLUGIN_ROOT, 'skills'), { recursive: true });
});

afterAll(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── 輔助函式 ──

/**
 * 在 MOCK_PLUGIN_ROOT 建立一個假 SKILL.md
 * @param {string} domain
 */
function createMockSkill(domain) {
  const skillDir = join(MOCK_PLUGIN_ROOT, 'skills', domain);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), `# ${domain} 知識域\n`, 'utf8');
}

/**
 * 建立一個 gap 物件
 * @param {string} domain
 * @param {number} score
 * @returns {{ domain: string, score: number, matchedKeywords: string[] }}
 */
function makeGap(domain, score) {
  return { domain, score, matchedKeywords: [] };
}

// ── Feature 1: shouldAutoForge ──

describe('Feature 1: shouldAutoForge — 篩選需要 forge 的 gaps', () => {

  describe('Scenario 1-1: 空 gaps 陣列回傳空 domains', () => {
    it('gaps 為空陣列時回傳 domains: []', () => {
      // GIVEN
      const gaps = [];

      // WHEN
      const result = shouldAutoForge(gaps, { pluginRoot: MOCK_PLUGIN_ROOT });

      // THEN
      expect(result.domains).toEqual([]);
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it('gaps 為 null 時回傳 domains: []', () => {
      const result = shouldAutoForge(null, { pluginRoot: MOCK_PLUGIN_ROOT });
      expect(result.domains).toEqual([]);
    });

    it('gaps 為 undefined 時回傳 domains: []', () => {
      const result = shouldAutoForge(undefined, { pluginRoot: MOCK_PLUGIN_ROOT });
      expect(result.domains).toEqual([]);
    });
  });

  describe('Scenario 1-2: 低分 gap 被選中', () => {
    it('score < minForgeScore(0.2) 的 domain 被加入 domains 清單', () => {
      // GIVEN：score=0.1 < 0.2
      const gaps = [makeGap('new-domain-xyz', 0.1)];

      // WHEN
      const result = shouldAutoForge(gaps, { pluginRoot: MOCK_PLUGIN_ROOT });

      // THEN
      expect(result.domains).toContain('new-domain-xyz');
    });

    it('score >= minForgeScore 的 domain 不被選中', () => {
      // GIVEN：score=0.3 >= 0.2
      const gaps = [makeGap('new-domain-abc', 0.3)];

      // WHEN
      const result = shouldAutoForge(gaps, { pluginRoot: MOCK_PLUGIN_ROOT });

      // THEN
      expect(result.domains).not.toContain('new-domain-abc');
    });

    it('混合 score 時只有低分被選中', () => {
      // GIVEN
      const gaps = [
        makeGap('low-score-domain', 0.05),  // 低分 → 選中
        makeGap('high-score-domain', 0.5),  // 高分 → 略過
      ];

      // WHEN
      const result = shouldAutoForge(gaps, { pluginRoot: MOCK_PLUGIN_ROOT });

      // THEN
      expect(result.domains).toContain('low-score-domain');
      expect(result.domains).not.toContain('high-score-domain');
    });
  });

  describe('Scenario 1-3: 排除已有 SKILL.md 的 domain', () => {
    it('已有 SKILL.md 的 domain 即使低分也不被選中', () => {
      // GIVEN：建立 mock SKILL.md
      createMockSkill('existing-skill-domain');
      const gaps = [makeGap('existing-skill-domain', 0.05)];

      // WHEN
      const result = shouldAutoForge(gaps, { pluginRoot: MOCK_PLUGIN_ROOT });

      // THEN
      expect(result.domains).not.toContain('existing-skill-domain');
    });
  });

  describe('Scenario 1-4: 自訂 minForgeScore', () => {
    it('minForgeScore=0.5 時，score=0.3 的 domain 應被選中', () => {
      // GIVEN
      const gaps = [makeGap('custom-threshold-domain', 0.3)];

      // WHEN
      const result = shouldAutoForge(gaps, {
        pluginRoot: MOCK_PLUGIN_ROOT,
        minForgeScore: 0.5,
      });

      // THEN
      expect(result.domains).toContain('custom-threshold-domain');
    });

    it('minForgeScore=0.1 時，score=0.15 的 domain 不被選中', () => {
      // GIVEN
      const gaps = [makeGap('above-threshold-domain', 0.15)];

      // WHEN
      const result = shouldAutoForge(gaps, {
        pluginRoot: MOCK_PLUGIN_ROOT,
        minForgeScore: 0.1,
      });

      // THEN
      expect(result.domains).not.toContain('above-threshold-domain');
    });
  });

  describe('Scenario 1-5: reason 欄位說明篩選結果', () => {
    it('有需要 forge 的 domain 時，reason 提及 domain 數量', () => {
      // GIVEN
      const gaps = [makeGap('reason-test-domain', 0.05)];

      // WHEN
      const result = shouldAutoForge(gaps, { pluginRoot: MOCK_PLUGIN_ROOT });

      // THEN
      expect(result.domains).toContain('reason-test-domain');
      expect(result.reason).toMatch(/1/);  // 包含數量
    });
  });
});

// ── Feature 2: autoForge ──

describe('Feature 2: autoForge — 對篩選出的 gaps 執行 forge', () => {

  describe('Scenario 2-1: 空 gaps 不執行 forge', () => {
    it('gaps 為空陣列時回傳 forged: [], skipped: []', () => {
      // GIVEN
      const gaps = [];

      // WHEN
      const result = autoForge(gaps, { dryRun: true, pluginRoot: MOCK_PLUGIN_ROOT });

      // THEN
      expect(result.forged).toEqual([]);
      expect(result.skipped).toEqual([]);
    });
  });

  describe('Scenario 2-2: dry-run 模式', () => {
    it('dryRun: true 時 forged 結果的 status 為 success（預覽）或 conflict', () => {
      // GIVEN：score=0.05 → 低於門檻，應觸發 forge
      // 使用不太可能存在的 domain 名稱
      const uniqueDomain = `dry-run-test-${Date.now()}`;
      const gaps = [makeGap(uniqueDomain, 0.05)];

      // WHEN
      const result = autoForge(gaps, {
        dryRun: true,
        pluginRoot: MOCK_PLUGIN_ROOT,
      });

      // THEN：dry-run 模式下 forged 應有 1 個結果
      expect(result.forged).toHaveLength(1);
      expect(result.skipped).toEqual([]);
      const forgeResult = result.forged[0];
      // dry-run 成功時 status = 'success'（含 preview）
      expect(forgeResult.status).toBe('success');
      expect(forgeResult.domainName).toBe(uniqueDomain);
      // dry-run 成功時應有 preview 物件
      expect(forgeResult.preview).toBeDefined();
      expect(typeof forgeResult.preview.body).toBe('string');
    });
  });

  describe('Scenario 2-3: 高分 gap 被跳過（不進入 forge）', () => {
    it('score >= 0.2 的 gap 不觸發 forge', () => {
      // GIVEN：score=0.5 → 高於門檻，不應觸發
      const gaps = [makeGap('high-score-no-forge', 0.5)];

      // WHEN
      const result = autoForge(gaps, {
        dryRun: true,
        pluginRoot: MOCK_PLUGIN_ROOT,
      });

      // THEN
      expect(result.forged).toEqual([]);
      expect(result.skipped).toEqual([]);
    });
  });

  describe('Scenario 2-4: 連續失敗後暫停', () => {
    it('maxConsecutiveFailures=0 時，所有 domain 因 paused 而跳過或立即回報暫停', () => {
      // GIVEN：score=0.05 的兩個 domain，maxConsecutiveFailures=0 → 第一個就觸發暫停
      const d1 = `paused-test-1-${Date.now()}`;
      const d2 = `paused-test-2-${Date.now()}`;
      const gaps = [makeGap(d1, 0.05), makeGap(d2, 0.05)];

      // WHEN：maxConsecutiveFailures=0 → 已達暫停門檻，第一個就是 paused
      const result = autoForge(gaps, {
        dryRun: true,
        pluginRoot: MOCK_PLUGIN_ROOT,
        maxConsecutiveFailures: 0,
      });

      // THEN：第一個回傳 paused，第二個被 skip
      expect(result.forged).toHaveLength(1);
      expect(result.forged[0].status).toBe('paused');
      expect(result.skipped).toContain(d2);
    });
  });

  describe('Scenario 2-5: 回傳結構完整性', () => {
    it('autoForge 回傳物件包含 forged 和 skipped 陣列', () => {
      // GIVEN
      const gaps = [];

      // WHEN
      const result = autoForge(gaps, { dryRun: true, pluginRoot: MOCK_PLUGIN_ROOT });

      // THEN
      expect(result).toHaveProperty('forged');
      expect(result).toHaveProperty('skipped');
      expect(Array.isArray(result.forged)).toBe(true);
      expect(Array.isArray(result.skipped)).toBe(true);
    });
  });
});
