'use strict';
/**
 * skill-generalizer.test.js — Feature 2 BDD 規格驗證
 *
 * 對應 specs/features/in-progress/skill-internalization/bdd.md Feature 2
 */

const { describe, it, expect, beforeAll } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../../helpers/paths');
const {
  PROJECT_SPECIFIC_PATTERNS,
  generalizeEntry,
  generalizeEntries,
} = require(join(SCRIPTS_LIB, 'knowledge/skill-generalizer'));

describe('Feature 2: skill-generalizer — 移除專案特定內容', () => {
  // Scenario 2-1: 包含檔案路徑的段落被移除
  describe('Scenario 2-1: 包含 Overtone 路徑的段落被移除', () => {
    it('移除含 plugins/overtone/ 路徑的段落，保留通用描述段落', () => {
      const content = [
        '此函式位於 plugins/overtone/scripts/lib/paths.js，負責路徑計算。',
        '',
        '段落級移除是一種以空行為邊界分段再判斷的技術，適用於知識通用化場景。',
      ].join('\n');

      const result = generalizeEntry(content);

      expect(result.original).toBe(content);
      expect(result.generalized).not.toContain('plugins/overtone/');
      expect(result.generalized).toContain('段落級移除是一種');
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]).toContain('plugins/overtone/');
    });
  });

  // Scenario 2-2: 包含版本號的段落被移除
  describe('Scenario 2-2: 包含版本號的段落被移除', () => {
    it('移除含 v0.28.49 版本號的段落', () => {
      const content = [
        '薄殼化架構在 v0.28.49 版本引入，大幅降低 hook 耦合度。',
        '',
        '薄殼化是一種設計模式，將業務邏輯與 I/O 操作分離，提高可測試性。',
      ].join('\n');

      const result = generalizeEntry(content);

      expect(result.generalized).not.toContain('v0.28.49');
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0]).toContain('v0.28.49');
      expect(result.generalized).toContain('薄殼化是一種設計模式');
    });
  });

  // Scenario 2-3: 包含 require 模組引用的段落被移除
  describe('Scenario 2-3: 包含 require 模組引用的段落被移除', () => {
    it("移除含 require('./skill-router') 具體模組名稱的段落", () => {
      const content = [
        "使用 require('./skill-router') 載入路由模組。",
        '',
        '模組化設計允許各元件獨立替換，降低耦合度。',
      ].join('\n');

      const result = generalizeEntry(content);

      expect(result.generalized).not.toContain("require('./skill-router')");
      expect(result.removed.length).toBeGreaterThanOrEqual(1);
      expect(result.removed.some(p => p.includes("require('./skill-router')"))).toBe(true);
    });
  });

  // Scenario 2-4: 通用化後內容不足 50 字元時標記 isEmpty
  describe('Scenario 2-4: 通用化後不足 minLength 時標記 isEmpty', () => {
    it('所有段落均含路徑引用時 isEmpty 為 true', () => {
      const content = [
        '載入 plugins/overtone/scripts/lib/paths.js 模組。',
        '',
        '執行 scripts/lib/state.js 更新狀態。',
      ].join('\n');

      const result = generalizeEntry(content);

      expect(result.isEmpty).toBe(true);
      expect(result.generalized.length).toBeLessThan(50);
    });

    it('自訂 minLength=0 時即使內容很短也不標記 isEmpty', () => {
      const content = '短句，但不含特定路徑。';
      const result = generalizeEntry(content, { minLength: 0 });
      expect(result.isEmpty).toBe(false);
    });
  });

  // Scenario 2-5: 純通用內容的條目不被修改
  describe('Scenario 2-5: 純通用內容不被修改', () => {
    it('不含路徑、版本號、require 引用的條目回傳原始內容', () => {
      const content = [
        '測試應驗證實際行為而非實作細節，才能在重構後保持穩定。',
        '',
        '單元測試以小型、快速、獨立為目標，每個測試只驗證一個行為。',
      ].join('\n');

      const result = generalizeEntry(content);

      // generalized 應與原始內容一致（忽略空白差異）
      expect(result.generalized.trim()).toBe(content.trim());
      expect(result.removed).toHaveLength(0);
      expect(result.isEmpty).toBe(false);
    });
  });

  // Scenario 2-6: generalizeEntries 只處理 qualified=true 的條目
  describe('Scenario 2-6: generalizeEntries 只處理 qualified 條目', () => {
    it('過濾 qualified=false 的條目，只回傳 qualified=true 的處理結果', () => {
      const entries = [
        { entry: '通用化知識 A，不含特定路徑，可被保留為通用知識使用。', qualified: true, domain: 'testing', score: 0.8 },
        { entry: '此條目品質不足，不應被內化。', qualified: false, domain: null, score: 0.3 },
        { entry: '通用化知識 B，描述設計模式的一般性原則，適合跨專案使用。', qualified: true, domain: 'architecture', score: 0.7 },
      ];

      const results = generalizeEntries(entries);

      // 只有 2 個 qualified=true
      expect(results).toHaveLength(2);
    });

    it('回傳空陣列當無 qualified 條目', () => {
      const entries = [
        { entry: '不合格條目', qualified: false, domain: null, score: 0.1 },
      ];
      expect(generalizeEntries(entries)).toHaveLength(0);
    });

    it('entries 為空陣列時回傳空陣列', () => {
      expect(generalizeEntries([])).toHaveLength(0);
    });

    it('entries 非陣列時回傳空陣列', () => {
      expect(generalizeEntries(null)).toHaveLength(0);
      expect(generalizeEntries(undefined)).toHaveLength(0);
    });
  });

  // Scenario 2-7: customPatterns 額外篩選
  describe('Scenario 2-7: 呼叫端可傳入 customPatterns 額外篩選', () => {
    it('自訂 pattern 匹配的段落被移除', () => {
      const content = [
        'ACME_PROJECT_SPECIFIC 是本專案獨有的配置鍵值名稱。',
        '',
        '此知識可以通用化，適用於任何專案的最佳實踐說明。',
      ].join('\n');

      const result = generalizeEntry(content, {
        customPatterns: [/ACME_PROJECT_SPECIFIC/],
      });

      expect(result.generalized).not.toContain('ACME_PROJECT_SPECIFIC');
      expect(result.removed.some(p => p.includes('ACME_PROJECT_SPECIFIC'))).toBe(true);
      expect(result.generalized).toContain('此知識可以通用化');
    });
  });

  // 額外邊界測試
  describe('邊界情況', () => {
    it('空字串輸入回傳空 generalized 且 isEmpty=true', () => {
      const result = generalizeEntry('');
      expect(result.original).toBe('');
      expect(result.generalized).toBe('');
      expect(result.removed).toHaveLength(0);
      expect(result.isEmpty).toBe(true);
    });

    it('只有空行的輸入回傳 isEmpty=true', () => {
      const result = generalizeEntry('\n\n\n');
      expect(result.generalized).toBe('');
      expect(result.isEmpty).toBe(true);
    });

    it('絕對路徑 /Users/ 的段落被移除', () => {
      const content = [
        '設定檔位於 /Users/sbu/.overtone/sessions/abc123/workflow.json。',
        '',
        '工作流狀態追蹤是自動化的核心機制，確保任務不會遺失。',
      ].join('\n');

      const result = generalizeEntry(content);

      expect(result.generalized).not.toContain('/Users/');
      expect(result.removed.length).toBeGreaterThanOrEqual(1);
    });

    it('removedCount 欄位：removed 陣列長度即為移除的段落數', () => {
      // 規格 API 說 removedCount，設計說 removed 陣列
      // 測試 removed.length 即代表 removedCount
      const content = [
        '段落一：plugins/overtone/ 路徑引用。',
        '',
        '段落二：scripts/lib/ 路徑引用。',
        '',
        '段落三：這是通用化後可保留的知識說明。',
      ].join('\n');

      const result = generalizeEntry(content);

      expect(result.removed).toHaveLength(2);
      expect(result.generalized).toContain('段落三');
    });

    it('PROJECT_SPECIFIC_PATTERNS 為可 import 的陣列', () => {
      expect(Array.isArray(PROJECT_SPECIFIC_PATTERNS)).toBe(true);
      expect(PROJECT_SPECIFIC_PATTERNS.length).toBeGreaterThan(0);
      PROJECT_SPECIFIC_PATTERNS.forEach(p => {
        expect(p).toBeInstanceOf(RegExp);
      });
    });
  });
});
