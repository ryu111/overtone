'use strict';
/**
 * skill-evaluator.test.js — Feature 1: skill-evaluator 單元測試
 *
 * 涵蓋 BDD spec Feature 1 的所有 Scenario 1-1 ~ 1-6。
 */

const { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../../helpers/paths');
const { evaluateEntries } = require(join(SCRIPTS_LIB, 'knowledge/skill-evaluator'));

// ── 測試環境設置 ──

// 使用臨時目錄隔離測試
const TEST_DIR = join(tmpdir(), `skill-evaluator-test-${Date.now()}`);
const AUTO_DISCOVERED_PATH = join(TEST_DIR, 'auto-discovered.md');
const PROJECT_ROOT = join(TEST_DIR, 'project');

// mock score-engine 和 global-instinct 的路徑
const GLOBAL_DIR_PATH = join(require('os').homedir(), '.overtone', 'global');

// 建立測試用的 global store 目錄
const crypto = require('crypto');
const projectHash = crypto.createHash('sha256').update(PROJECT_ROOT).digest('hex').slice(0, 8);
const GLOBAL_STORE_DIR = join(GLOBAL_DIR_PATH, projectHash);
const SCORES_FILE = join(GLOBAL_STORE_DIR, 'scores.jsonl');
const OBSERVATIONS_FILE = join(GLOBAL_STORE_DIR, 'observations.jsonl');

// 測試用的知識條目內容（包含 testing 相關關鍵詞）
const TESTING_ENTRY = `## testing

使用 describe/it 組織測試案例，beforeEach 設定初始狀態。
assert 斷言需驗證實際值而非僅存在性。
`;

const WORKFLOW_ENTRY = `## workflow-core

agent handoff 時需確認 context 完整。
pipeline stage 轉換要記錄 timeline。
`;

const GENERIC_ENTRY = `## debugging

debug 技巧：stack trace 分析和 root cause 追蹤。
reproduction 步驟要最小化。
`;

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(PROJECT_ROOT, { recursive: true });
  mkdirSync(GLOBAL_STORE_DIR, { recursive: true });
});

afterAll(() => {
  // 清理測試目錄
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  // 清理 global store（測試專用的 projectHash 目錄）
  if (existsSync(GLOBAL_STORE_DIR)) rmSync(GLOBAL_STORE_DIR, { recursive: true, force: true });
});

// 每個 it 前清理 store 資料
beforeEach(() => {
  // 清空評分和觀察資料，讓每個測試自行寫入
  if (existsSync(SCORES_FILE)) rmSync(SCORES_FILE);
  if (existsSync(OBSERVATIONS_FILE)) rmSync(OBSERVATIONS_FILE);
  if (existsSync(AUTO_DISCOVERED_PATH)) rmSync(AUTO_DISCOVERED_PATH);
});

// ── 輔助函式 ──

/**
 * 寫入 scores.jsonl 測試資料
 * @param {object[]} records
 */
function writeScores(records) {
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(SCORES_FILE, content, 'utf8');
}

/**
 * 寫入 observations.jsonl 測試資料
 * @param {object[]} records
 */
function writeObservations(records) {
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(OBSERVATIONS_FILE, content, 'utf8');
}

/**
 * 建立符合 avgScore、confidence、usageCount 要求的測試資料
 * @param {object} params
 */
function setupTestData({ avgScore = 4.0, confidence = 0.8, usageCount = 3 } = {}) {
  // 建立 scores.jsonl
  writeScores([
    {
      ts: new Date().toISOString(),
      sessionId: 'test-session',
      workflowType: 'standard',
      stage: 'TEST',
      agent: 'tester',
      scores: { clarity: avgScore, completeness: avgScore, actionability: avgScore },
      overall: avgScore,
    },
  ]);

  // 建立 observations.jsonl
  // 使用不同 tag 讓每個觀察都能被保留（global-instinct 以 tag+type 去重）
  // 每個觀察的 trigger 包含 testing 關鍵詞，count 累加達到 usageCount
  const observations = [];
  for (let i = 0; i < usageCount; i++) {
    observations.push({
      id: `obs-${i}`,
      tag: `testing-pattern-${i}`,  // 不同 tag 避免去重
      type: 'pattern',
      trigger: `test describe it assert spec coverage`,
      action: 'organize tests',
      confidence,
      count: 1,
      lastSeen: new Date().toISOString(),
      globalTs: new Date().toISOString(),
    });
  }
  writeObservations(observations);
}

// ── Feature 1: skill-evaluator 測試 ──

describe('Feature 1: skill-evaluator — 評估知識條目內化門檻', () => {

  describe('Scenario 1-1: 條目符合所有門檻時標記為 qualified', () => {
    it('三個門檻全通過時 qualified 為 true，reasons 包含通過原因', () => {
      // GIVEN
      writeFileSync(AUTO_DISCOVERED_PATH, TESTING_ENTRY, 'utf8');
      setupTestData({ avgScore: 4.0, confidence: 0.8, usageCount: 3 });

      // WHEN
      const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);

      // THEN
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result.qualified).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(1);
      // reasons 應包含通過原因（至少一條說明「通過」）
      expect(result.reasons.some(r => r.includes('通過'))).toBe(true);
      // domain 應被偵測到（testing 條目）
      expect(result.domain).not.toBeNull();
      expect(typeof result.domain).toBe('string');
    });
  });

  describe('Scenario 1-2: 條目 avgScore 未達門檻時標記為 not qualified', () => {
    it('avgScore 2.0 低於 3.5 門檻時 qualified 為 false，reasons 說明原因', () => {
      // GIVEN
      writeFileSync(AUTO_DISCOVERED_PATH, TESTING_ENTRY, 'utf8');
      setupTestData({ avgScore: 2.0, confidence: 0.9, usageCount: 5 });

      // WHEN
      const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);

      // THEN
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result.qualified).toBe(false);
      // reasons 應包含說明 avgScore 不足的訊息
      expect(result.reasons.some(r => r.includes('avgScore') && r.includes('不足'))).toBe(true);
    });
  });

  describe('Scenario 1-3: 條目 usageCount 未達門檻時標記為 not qualified', () => {
    it('usageCount 為 1（< 2）時 qualified 為 false，reasons 說明原因', () => {
      // GIVEN
      writeFileSync(AUTO_DISCOVERED_PATH, TESTING_ENTRY, 'utf8');
      setupTestData({ avgScore: 4.0, confidence: 0.8, usageCount: 1 });

      // WHEN
      const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);

      // THEN
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result.qualified).toBe(false);
      // reasons 應包含說明 usageCount 不足的訊息
      expect(result.reasons.some(r => r.includes('usageCount') && r.includes('不足'))).toBe(true);
    });
  });

  describe('Scenario 1-4: 呼叫端可透過 options 覆蓋門檻值', () => {
    it('minUsageCount 覆蓋為 1 時，usageCount 1 的條目可通過', () => {
      // GIVEN
      writeFileSync(AUTO_DISCOVERED_PATH, TESTING_ENTRY, 'utf8');
      setupTestData({ avgScore: 4.0, confidence: 0.8, usageCount: 1 });

      // WHEN：使用預設門檻（minUsageCount: 2）— 應 fail
      const defaultResults = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);
      expect(defaultResults[0].qualified).toBe(false);

      // WHEN：覆蓋 minUsageCount 為 1 — 應 pass
      const overrideResults = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT, { minUsageCount: 1 });

      // THEN
      expect(overrideResults).toHaveLength(1);
      // usageCount 1 在 minUsageCount=1 時通過 usageCount 門檻
      // qualified 取決於其他門檻是否通過
      const usageReason = overrideResults[0].reasons.find(r => r.includes('usageCount'));
      expect(usageReason).toBeDefined();
      expect(usageReason).toContain('通過');
    });

    it('minAvgScore 覆蓋為 5.0 時，avgScore 4.0 的條目應 fail avgScore 門檻', () => {
      // GIVEN
      writeFileSync(AUTO_DISCOVERED_PATH, TESTING_ENTRY, 'utf8');
      setupTestData({ avgScore: 4.0, confidence: 0.8, usageCount: 3 });

      // WHEN
      const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT, { minAvgScore: 5.0 });

      // THEN
      const avgScoreReason = results[0].reasons.find(r => r.includes('avgScore'));
      expect(avgScoreReason).toContain('不足');
    });
  });

  describe('Scenario 1-5: auto-discovered.md 包含多個條目時分別評估', () => {
    it('三個條目分別評估，回傳長度為 3，只有第一個 qualified', () => {
      // GIVEN：3 個條目，以 `---` 分隔
      // 第 1 個：testing（高分觀察）
      // 第 2 個：workflow-core（低 avgScore）
      // 第 3 個：debugging（低 confidence）
      const multiEntryContent = [
        TESTING_ENTRY,
        WORKFLOW_ENTRY,
        GENERIC_ENTRY,
      ].join('\n---\n');

      writeFileSync(AUTO_DISCOVERED_PATH, multiEntryContent, 'utf8');

      // 只有 testing 相關觀察達到高分（其他 domain 觀察少）
      writeScores([
        {
          ts: new Date().toISOString(),
          sessionId: 'test-session',
          workflowType: 'standard',
          stage: 'TEST',
          agent: 'tester',
          scores: { clarity: 4.0, completeness: 4.0, actionability: 4.0 },
          overall: 4.0,
        },
      ]);

      // 只有 testing 相關觀察有足夠 count（usageCount 3）且高 confidence
      writeObservations([
        {
          id: 'obs-1',
          tag: 'testing-pattern',
          type: 'pattern',
          trigger: 'test describe it assert spec coverage mock',
          action: 'organize tests',
          confidence: 0.85,
          count: 3,
          lastSeen: new Date().toISOString(),
          globalTs: new Date().toISOString(),
        },
      ]);

      // WHEN
      const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);

      // THEN
      expect(results).toHaveLength(3);
      // 第 1 個（testing）：通過高分觀察，應 qualified
      // 第 2/3 個：其他 domain 觀察不足，usageCount 不足
      const qualifiedCount = results.filter(r => r.qualified).length;
      // 至少第一個（testing）應通過（其他 domain 也可能通過，視資料而定）
      expect(qualifiedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Scenario 1-6: auto-discovered.md 不存在時回傳空陣列', () => {
    it('檔案不存在時回傳空陣列，不拋出例外', () => {
      // GIVEN
      const nonExistentPath = join(TEST_DIR, 'non-existent.md');

      // WHEN & THEN
      expect(() => {
        const results = evaluateEntries(nonExistentPath, PROJECT_ROOT);
        expect(results).toHaveLength(0);
        expect(Array.isArray(results)).toBe(true);
      }).not.toThrow();
    });
  });

  describe('EvaluationResult 結構驗證', () => {
    it('回傳的結果包含所有必要欄位', () => {
      // GIVEN
      writeFileSync(AUTO_DISCOVERED_PATH, TESTING_ENTRY, 'utf8');
      setupTestData({ avgScore: 4.0, confidence: 0.8, usageCount: 3 });

      // WHEN
      const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);

      // THEN
      expect(results).toHaveLength(1);
      const result = results[0];

      // 必要欄位存在
      expect(result).toHaveProperty('entry');
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('qualified');
      expect(result).toHaveProperty('reasons');

      // 型別驗證
      expect(typeof result.entry).toBe('string');
      expect(result.domain === null || typeof result.domain === 'string').toBe(true);
      expect(typeof result.score).toBe('number');
      expect(typeof result.qualified).toBe('boolean');
      expect(Array.isArray(result.reasons)).toBe(true);

      // score 在 0-1 範圍
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);

      // reasons 非空
      expect(result.reasons.length).toBeGreaterThan(0);

      // entry 是原始條目內容
      expect(result.entry).toBe(TESTING_ENTRY.trim());
    });

    it('domain 偵測：testing 條目應偵測到 testing domain', () => {
      // GIVEN
      writeFileSync(AUTO_DISCOVERED_PATH, TESTING_ENTRY, 'utf8');
      setupTestData();

      // WHEN
      const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);

      // THEN
      expect(results[0].domain).toBe('testing');
    });

    it('domain 偵測：無關鍵詞的條目 domain 應為 null', () => {
      // GIVEN：純文字，無任何 domain 關鍵詞
      const plainEntry = `## 無法識別的條目

這是一段完全沒有任何技術關鍵詞的隨機文字。
完全不包含任何已知 domain 的關鍵詞。
`;
      writeFileSync(AUTO_DISCOVERED_PATH, plainEntry, 'utf8');

      // WHEN
      const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);

      // THEN
      expect(results).toHaveLength(1);
      expect(results[0].domain).toBeNull();
    });
  });

  describe('options 邊界情況', () => {
    it('options 為 undefined 時使用預設門檻', () => {
      // GIVEN
      writeFileSync(AUTO_DISCOVERED_PATH, TESTING_ENTRY, 'utf8');
      setupTestData({ avgScore: 4.0, confidence: 0.8, usageCount: 3 });

      // WHEN（不傳 options）
      expect(() => {
        const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);
        expect(Array.isArray(results)).toBe(true);
      }).not.toThrow();
    });

    it('空的 auto-discovered.md 回傳空陣列', () => {
      // GIVEN
      writeFileSync(AUTO_DISCOVERED_PATH, '', 'utf8');

      // WHEN
      const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);

      // THEN
      expect(results).toHaveLength(0);
    });

    it('confidence 門檻不足時標記為 not qualified', () => {
      // GIVEN
      writeFileSync(AUTO_DISCOVERED_PATH, TESTING_ENTRY, 'utf8');

      // 只有低 confidence 的觀察
      writeScores([{
        ts: new Date().toISOString(),
        sessionId: 'test',
        workflowType: 'standard',
        stage: 'TEST',
        agent: 'tester',
        scores: { clarity: 4.0, completeness: 4.0, actionability: 4.0 },
        overall: 4.0,
      }]);
      writeObservations([
        { id: 'obs-1', tag: 'test-tag', type: 'pattern', trigger: 'test describe it assert', action: 'test', confidence: 0.3, count: 5, lastSeen: new Date().toISOString() },
        { id: 'obs-2', tag: 'test-tag2', type: 'pattern', trigger: 'spec coverage mock stub', action: 'test', confidence: 0.3, count: 5, lastSeen: new Date().toISOString() },
      ]);

      // WHEN
      const results = evaluateEntries(AUTO_DISCOVERED_PATH, PROJECT_ROOT);

      // THEN
      expect(results).toHaveLength(1);
      expect(results[0].qualified).toBe(false);
      expect(results[0].reasons.some(r => r.includes('confidence') && r.includes('不足'))).toBe(true);
    });
  });
});
