'use strict';
/**
 * experience-index.test.js — experience-index.js 單元測試
 *
 * 覆蓋 BDD 規格 Feature 3: experience-index — 專案經驗索引
 *   Scenario 3-1: buildIndex 為新專案建立索引條目
 *   Scenario 3-2: buildIndex 對已存在的專案更新條目（upsert 語意）
 *   Scenario 3-3: queryIndex 根據 specText 關鍵詞推薦 domains
 *   Scenario 3-4: queryIndex 當 specText 無對應關鍵詞時回傳空推薦
 *   Scenario 3-5: readIndex 讀取全部條目
 *   Scenario 3-6: experience-index.json 不存在時 readIndex 回傳空陣列
 *   Scenario 3-7: projectHash 計算一致性
 */

const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, rmSync, readFileSync, existsSync } = require('fs');
const os = require('os');
const path = require('path');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../../helpers/paths');

const experienceIndex = require(join(SCRIPTS_LIB, 'knowledge/experience-index'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── 輔助工具 ──

/**
 * 建立唯一的測試用 projectRoot（避免測試間污染）
 */
function makeTmpProject(suffix = '') {
  const dir = path.join(os.tmpdir(), `ot-ei-test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 清理專案對應的全域 hash 目錄
 */
function cleanupProject(projectRoot) {
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(paths.global.dir(projectRoot), { recursive: true, force: true });
}

// ════════════════════════════════════════════════════════════════════
// Feature 3: experience-index — 專案經驗索引
// ════════════════════════════════════════════════════════════════════

describe('Feature 3: experience-index — 專案經驗索引', () => {

  // ── Scenario 3-1 ──
  describe('Scenario 3-1: buildIndex 為新專案建立索引條目', () => {
    let projectRoot;

    beforeEach(() => {
      projectRoot = makeTmpProject('s31');
    });

    afterEach(() => {
      cleanupProject(projectRoot);
    });

    test('experience-index.json 被建立，包含正確條目', () => {
      experienceIndex.buildIndex(projectRoot, ['testing', 'workflow-core']);

      const filePath = paths.global.experienceIndex(projectRoot);
      expect(existsSync(filePath)).toBe(true);

      const raw = readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);

      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.entries.length).toBe(1);

      const entry = data.entries[0];
      expect(entry.projectHash).toBe(paths.projectHash(projectRoot));
      expect(entry.domains).toContain('testing');
      expect(entry.domains).toContain('workflow-core');
      expect(entry.sessionCount).toBe(1);
      // lastUpdated 是有效的 ISO 8601 字串
      expect(() => new Date(entry.lastUpdated)).not.toThrow();
      expect(new Date(entry.lastUpdated).toISOString()).toBe(entry.lastUpdated);
    });
  });

  // ── Scenario 3-2 ──
  describe('Scenario 3-2: buildIndex 對已存在的專案更新條目（upsert 語意）', () => {
    let projectRoot;

    beforeEach(() => {
      projectRoot = makeTmpProject('s32');
      // 先建立初始條目（sessionCount = 1 後變為 2）
      experienceIndex.buildIndex(projectRoot, ['testing']);
      experienceIndex.buildIndex(projectRoot, ['testing']);
      // 現在 sessionCount 應為 2
    });

    afterEach(() => {
      cleanupProject(projectRoot);
    });

    test('sessionCount 遞增，domains 合併，lastUpdated 更新', () => {
      // 先記錄原本的 lastUpdated
      const before = readFileSync(paths.global.experienceIndex(projectRoot), 'utf8');
      const beforeData = JSON.parse(before);
      const beforeTs = beforeData.entries[0].lastUpdated;

      // 稍等一毫秒確保時間戳不同
      const t0 = Date.now();
      while (Date.now() === t0) { /* busy-wait */ }

      // 第三次呼叫：新增 'database' domain
      experienceIndex.buildIndex(projectRoot, ['database', 'testing']);

      const filePath = paths.global.experienceIndex(projectRoot);
      const data = JSON.parse(readFileSync(filePath, 'utf8'));

      // 應只有一筆條目（upsert，非 append）
      expect(data.entries.length).toBe(1);

      const entry = data.entries[0];
      expect(entry.sessionCount).toBe(3);
      expect(entry.domains).toContain('testing');
      expect(entry.domains).toContain('database');
      // domains 不重複
      const testingCount = entry.domains.filter(d => d === 'testing').length;
      expect(testingCount).toBe(1);
      // lastUpdated 更新（>= beforeTs）
      expect(new Date(entry.lastUpdated) >= new Date(beforeTs)).toBe(true);
    });
  });

  // ── Scenario 3-3 ──
  describe('Scenario 3-3: queryIndex 根據 specText 關鍵詞推薦 domains', () => {
    let projectA, projectB, projectC, queryProject;

    beforeEach(() => {
      projectA = makeTmpProject('s33a');
      projectB = makeTmpProject('s33b');
      projectC = makeTmpProject('s33c');
      queryProject = makeTmpProject('s33q');

      // 建立 3 個不同專案的索引條目
      // 其中 A 和 B 都有 'testing'，C 只有 'architecture'
      experienceIndex.buildIndex(projectA, ['testing', 'database']);
      experienceIndex.buildIndex(projectB, ['testing', 'security-kb']);
      experienceIndex.buildIndex(projectC, ['architecture', 'code-review']);

      // 把 A/B/C 的索引資料合併到 queryProject 的 global 目錄
      // 由於每個 projectRoot 有獨立的 hash 目錄，需要在同一個 index 檔案下建多筆條目
      // 使用不同 projectRoot 但共享一個查詢入口
      // 這裡直接測試：在 queryProject 的 store 中預先寫入多個 entries
      const { atomicWrite } = require(join(SCRIPTS_LIB, 'utils'));
      const indexPath = paths.global.experienceIndex(queryProject);
      const hashA = paths.projectHash(projectA);
      const hashB = paths.projectHash(projectB);
      const hashC = paths.projectHash(projectC);
      const selfHash = paths.projectHash(queryProject);

      atomicWrite(indexPath, {
        version: 1,
        entries: [
          { projectHash: hashA, domains: ['testing', 'database'], lastUpdated: new Date().toISOString(), sessionCount: 1 },
          { projectHash: hashB, domains: ['testing', 'security-kb'], lastUpdated: new Date().toISOString(), sessionCount: 1 },
          { projectHash: hashC, domains: ['architecture', 'code-review'], lastUpdated: new Date().toISOString(), sessionCount: 1 },
        ],
      });
    });

    afterEach(() => {
      cleanupProject(projectA);
      cleanupProject(projectB);
      cleanupProject(projectC);
      cleanupProject(queryProject);
    });

    test('specText 含測試相關關鍵詞時，recommendedDomains 包含 testing', () => {
      const specText = 'We need to write unit tests and specs for this feature. Use bun:test describe it.';

      const result = experienceIndex.queryIndex(queryProject, specText);

      expect(result.recommendedDomains).toContain('testing');
      expect(result.matchedProjects).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Scenario 3-4 ──
  describe('Scenario 3-4: queryIndex 當 specText 無對應關鍵詞時回傳空推薦', () => {
    let queryProject, otherProject;

    beforeEach(() => {
      queryProject = makeTmpProject('s34q');
      otherProject = makeTmpProject('s34o');

      // 建立一個 entry（使用 database 相關詞彙的專案）
      const { atomicWrite } = require(join(SCRIPTS_LIB, 'utils'));
      const indexPath = paths.global.experienceIndex(queryProject);
      const hashOther = paths.projectHash(otherProject);

      atomicWrite(indexPath, {
        version: 1,
        entries: [
          { projectHash: hashOther, domains: ['database', 'architecture'], lastUpdated: new Date().toISOString(), sessionCount: 2 },
        ],
      });
    });

    afterEach(() => {
      cleanupProject(queryProject);
      cleanupProject(otherProject);
    });

    test('specText 與所有 entry domains 無關鍵詞重疊時回傳空推薦', () => {
      // 使用完全無法匹配任何 domain 關鍵詞的 specText
      const specText = 'zzz aaa bbb completely unrelated random words xyz';

      const result = experienceIndex.queryIndex(queryProject, specText);

      expect(result.recommendedDomains).toEqual([]);
      expect(result.matchedProjects).toBe(0);
    });
  });

  // ── Scenario 3-5 ──
  describe('Scenario 3-5: readIndex 讀取全部條目', () => {
    let projectRoot;

    beforeEach(() => {
      projectRoot = makeTmpProject('s35');

      // 直接寫入 5 筆條目
      const { atomicWrite } = require(join(SCRIPTS_LIB, 'utils'));
      const indexPath = paths.global.experienceIndex(projectRoot);

      const entries = Array.from({ length: 5 }, (_, i) => ({
        projectHash: `hash${i}`,
        domains: ['testing'],
        lastUpdated: new Date().toISOString(),
        sessionCount: i + 1,
      }));

      atomicWrite(indexPath, { version: 1, entries });
    });

    afterEach(() => {
      cleanupProject(projectRoot);
    });

    test('回傳 5 筆 ExperienceEntry，每筆包含必要欄位', () => {
      const entries = experienceIndex.readIndex(projectRoot);

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBe(5);

      for (const entry of entries) {
        expect(typeof entry.projectHash).toBe('string');
        expect(Array.isArray(entry.domains)).toBe(true);
        expect(typeof entry.lastUpdated).toBe('string');
        expect(typeof entry.sessionCount).toBe('number');
      }
    });
  });

  // ── Scenario 3-6 ──
  describe('Scenario 3-6: experience-index.json 不存在時 readIndex 回傳空陣列', () => {
    let projectRoot;

    beforeEach(() => {
      projectRoot = makeTmpProject('s36');
      // 不建立任何檔案
    });

    afterEach(() => {
      cleanupProject(projectRoot);
    });

    test('檔案不存在時回傳空陣列，不拋出例外', () => {
      expect(() => {
        const result = experienceIndex.readIndex(projectRoot);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
      }).not.toThrow();
    });
  });

  // ── Scenario 3-7 ──
  describe('Scenario 3-7: projectHash 計算一致性', () => {
    let projectRoot;

    beforeEach(() => {
      projectRoot = makeTmpProject('s37');
    });

    afterEach(() => {
      cleanupProject(projectRoot);
    });

    test('相同 projectRoot 兩次呼叫 buildIndex 產生相同 hash，只有一筆條目', () => {
      experienceIndex.buildIndex(projectRoot, ['testing']);
      experienceIndex.buildIndex(projectRoot, ['workflow-core']);

      const entries = experienceIndex.readIndex(projectRoot);

      // upsert：只有一筆條目
      expect(entries.length).toBe(1);
      // hash 確定性
      expect(entries[0].projectHash).toBe(paths.projectHash(projectRoot));
      // sessionCount 累加
      expect(entries[0].sessionCount).toBe(2);
    });
  });

});

// ════════════════════════════════════════════════════════════════════
// 邊界條件
// ════════════════════════════════════════════════════════════════════

describe('experience-index 邊界條件', () => {

  describe('buildIndex：重複 domains 自動 dedup', () => {
    let projectRoot;

    beforeEach(() => {
      projectRoot = makeTmpProject('dedup');
    });

    afterEach(() => {
      cleanupProject(projectRoot);
    });

    test('傳入重複 domain 時，儲存的 domains 不含重複值', () => {
      experienceIndex.buildIndex(projectRoot, ['testing', 'testing', 'workflow-core']);
      const entries = experienceIndex.readIndex(projectRoot);
      const testingCount = entries[0].domains.filter(d => d === 'testing').length;
      expect(testingCount).toBe(1);
    });
  });

  describe('queryIndex：空 specText 回傳空推薦', () => {
    let projectRoot, otherProject;

    beforeEach(() => {
      projectRoot = makeTmpProject('empty-spec');
      otherProject = makeTmpProject('empty-spec-other');
      experienceIndex.buildIndex(otherProject, ['testing']);
    });

    afterEach(() => {
      cleanupProject(projectRoot);
      cleanupProject(otherProject);
    });

    test('空 specText 不拋出例外，回傳空推薦', () => {
      expect(() => {
        const result = experienceIndex.queryIndex(projectRoot, '');
        expect(result.recommendedDomains).toEqual([]);
      }).not.toThrow();
    });
  });

  describe('queryIndex：maxRecommendations 選項生效', () => {
    let projectRoot, otherProject;

    beforeEach(() => {
      projectRoot = makeTmpProject('maxrec');
      otherProject = makeTmpProject('maxrec-other');

      const { atomicWrite } = require(join(SCRIPTS_LIB, 'utils'));
      const indexPath = paths.global.experienceIndex(projectRoot);
      const hashOther = paths.projectHash(otherProject);

      atomicWrite(indexPath, {
        version: 1,
        entries: [
          {
            projectHash: hashOther,
            domains: ['testing', 'database', 'security-kb', 'architecture', 'workflow-core', 'debugging'],
            lastUpdated: new Date().toISOString(),
            sessionCount: 1,
          },
        ],
      });
    });

    afterEach(() => {
      cleanupProject(projectRoot);
      cleanupProject(otherProject);
    });

    test('maxRecommendations: 2 時最多回傳 2 個推薦', () => {
      // specText 包含廣泛關鍵詞讓所有 domain 都匹配
      const specText = 'test spec security database workflow architecture debug';
      const result = experienceIndex.queryIndex(projectRoot, specText, { maxRecommendations: 2 });
      expect(result.recommendedDomains.length).toBeLessThanOrEqual(2);
    });
  });

});
