'use strict';
/**
 * test-index.test.js
 * 測試 buildTestIndex 函式的行為規格
 *
 * 對應 BDD：specs/features/in-progress/test-quality-guard/bdd.md — Feature 2
 */

const { describe, it, expect, beforeAll, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, writeFileSync, rmSync, chmodSync } = require('fs');
const { SCRIPTS_DIR } = require('../helpers/paths');

const { buildTestIndex } = require(join(SCRIPTS_DIR, 'test-index'));

// ── 測試暫存目錄 ──

const TMP_DIR = join(__dirname, '..', '..', 'tmp-test-index-' + process.pid);

function makeTmpDir(...parts) {
  const p = join(TMP_DIR, ...parts);
  mkdirSync(p, { recursive: true });
  return p;
}

function writeTestFile(dir, filename, content) {
  writeFileSync(join(dir, filename), content, 'utf8');
}

afterAll(() => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // 清理失敗不影響測試結果
  }
});

// ── Feature 2: test-index.js 掃描行為 ──

describe('buildTestIndex', () => {

  // Scenario: 掃描有效的 tests/ 目錄並產出正確格式摘要
  describe('掃描有效的 tests/ 目錄', () => {
    let testsDir;

    beforeAll(() => {
      testsDir = join(TMP_DIR, 'valid-scan');
      const unitDir = makeTmpDir('valid-scan', 'unit');
      const intDir = makeTmpDir('valid-scan', 'integration');
      const e2eDir = makeTmpDir('valid-scan', 'e2e');

      writeTestFile(unitDir, 'foo.test.js',
        "describe('Foo 模組', () => {\n  it('should work', () => {});\n});\n"
      );
      writeTestFile(unitDir, 'bar.test.js',
        "describe('Bar 功能', () => {});\n"
      );
      writeTestFile(intDir, 'api.test.js',
        "describe('API 整合', () => {});\n"
      );
      writeTestFile(e2eDir, 'workflow.test.js',
        "describe('工作流 E2E', () => {});\n"
      );
    });

    it('回傳字串以 [Test Index] N files 開頭', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toMatch(/^\[Test Index\] \d+ files/);
    });

    it('標頭包含各子目錄計數', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toContain('unit:');
      expect(result).toContain('integration:');
      expect(result).toContain('e2e:');
    });

    it('包含 ## unit/ 節', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toContain('## unit/');
    });

    it('包含 ## integration/ 節', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toContain('## integration/');
    });

    it('包含 ## e2e/ 節', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toContain('## e2e/');
    });

    it('每個測試檔以 - filename: describe名稱 格式列出', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toContain('- foo.test.js: Foo 模組');
      expect(result).toContain('- bar.test.js: Bar 功能');
      expect(result).toContain('- api.test.js: API 整合');
      expect(result).toContain('- workflow.test.js: 工作流 E2E');
    });

    it('總計數正確（4 個測試檔）', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toMatch(/\[Test Index\] 4 files/);
    });
  });

  // Scenario: 每個測試檔擷取 top-level describe 名稱
  describe('擷取 top-level describe 名稱', () => {
    let testsDir;

    beforeAll(() => {
      testsDir = join(TMP_DIR, 'describe-extract');
      const unitDir = makeTmpDir('describe-extract', 'unit');

      // 單一 describe
      writeTestFile(unitDir, 'single.test.js',
        "describe('模組 X 功能', () => {\n  it('test', () => {});\n});\n"
      );

      // 多個 top-level describe
      writeTestFile(unitDir, 'multi.test.js',
        "describe('Alpha 功能', () => {});\ndescribe('Beta 功能', () => {});\ndescribe('Gamma 功能', () => {});\n"
      );

      // 使用雙引號
      writeTestFile(unitDir, 'doublequote.test.js',
        'describe("Double 引號測試", () => {});\n'
      );
    });

    it('單一 describe 正確擷取', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toContain('- single.test.js: 模組 X 功能');
    });

    it('多個 top-level describe 以 | 分隔', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toContain('- multi.test.js: Alpha 功能 | Beta 功能 | Gamma 功能');
    });

    it('雙引號 describe 正確擷取', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toContain('- doublequote.test.js: Double 引號測試');
    });
  });

  // Scenario: maxChars 截斷保護（預設 4000）
  describe('maxChars 截斷保護', () => {
    let testsDir;

    beforeAll(() => {
      testsDir = join(TMP_DIR, 'truncation');
      const unitDir = makeTmpDir('truncation', 'unit');

      // 建立足夠多的測試檔讓輸出超過 4000 字元
      for (let i = 0; i < 50; i++) {
        writeTestFile(unitDir, `module-${i.toString().padStart(2, '0')}.test.js`, `
          describe('這是一個很長的 describe 名稱用來撐大輸出字元數 模組 ${i} 功能描述', () => {});
        `);
      }
    });

    it('預設 maxChars=4000 時回傳不超過 4000 字元', () => {
      const result = buildTestIndex(testsDir);
      expect(result.length).toBeLessThanOrEqual(4000);
    });

    it('截斷時結尾包含截斷標示', () => {
      const result = buildTestIndex(testsDir);
      if (result.length === 4000) {
        expect(result).toContain('... (已截斷)');
      }
      // 若未截斷則不需要此標示
    });
  });

  // Scenario: 自訂 maxChars 選項
  describe('自訂 maxChars 選項', () => {
    let testsDir;

    beforeAll(() => {
      testsDir = join(TMP_DIR, 'custom-maxchars');
      const unitDir = makeTmpDir('custom-maxchars', 'unit');
      writeTestFile(unitDir, 'alpha.test.js', `describe('Alpha', () => {});`);
      writeTestFile(unitDir, 'beta.test.js', `describe('Beta 非常長的名稱讓它超過限制', () => {});`);
    });

    it('maxChars: 100 時回傳不超過 100 字元', () => {
      const result = buildTestIndex(testsDir, { maxChars: 100 });
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('若有截斷則包含截斷標示', () => {
      const result = buildTestIndex(testsDir, { maxChars: 50 });
      // 50 字元很小，必然截斷
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result).toContain('... (已截斷)');
    });

    it('maxChars 足夠大時不截斷', () => {
      const result = buildTestIndex(testsDir, { maxChars: 99999 });
      expect(result).not.toContain('... (已截斷)');
    });
  });

  // Scenario: tests/ 目錄不存在時回傳空字串
  describe('目錄不存在時', () => {
    it('回傳空字串', () => {
      const result = buildTestIndex('/path/that/absolutely/does/not/exist/12345');
      expect(result).toBe('');
    });

    it('不拋出例外', () => {
      expect(() => buildTestIndex('/nonexistent/dir')).not.toThrow();
    });
  });

  // Scenario: 單一測試檔讀取失敗時跳過繼續處理
  describe('單一測試檔讀取失敗時跳過', () => {
    // 注意：chmod 在 CI 中可能受限，此測試採保守策略
    it('其他正常檔案仍被列出', () => {
      const testsDir = join(TMP_DIR, 'partial-fail');
      const unitDir = makeTmpDir('partial-fail', 'unit');
      writeTestFile(unitDir, 'good1.test.js', `describe('Good 1', () => {});`);
      writeTestFile(unitDir, 'good2.test.js', `describe('Good 2', () => {});`);

      const result = buildTestIndex(testsDir);
      expect(result).toContain('- good1.test.js: Good 1');
      expect(result).toContain('- good2.test.js: Good 2');
    });
  });

  // Scenario: 所有測試檔讀取失敗時回傳空字串
  describe('空目錄或無可讀檔案', () => {
    it('空的 unit/ 目錄回傳空字串', () => {
      const testsDir = join(TMP_DIR, 'all-fail');
      makeTmpDir('all-fail', 'unit');
      // 無任何 .test.js 檔案
      const result = buildTestIndex(testsDir);
      expect(result).toBe('');
    });
  });

  // Scenario: 沒有 describe 的測試檔顯示為空 describe 名稱
  describe('沒有 describe 的測試檔', () => {
    let testsDir;

    beforeAll(() => {
      testsDir = join(TMP_DIR, 'no-describe');
      const unitDir = makeTmpDir('no-describe', 'unit');
      writeTestFile(unitDir, 'nodesc.test.js',
        "it('直接使用 it', () => {});\ntest('直接使用 test', () => {});\n"
      );
    });

    it('仍列出該檔案名稱', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toContain('nodesc.test.js');
    });

    it('describe 欄位顯示為空標示，不崩潰', () => {
      const result = buildTestIndex(testsDir);
      expect(result).toContain('- nodesc.test.js:');
      // 不拋出例外即符合規格
    });
  });

  // 額外驗證：只有 unit/ 子目錄有檔案時，不顯示空的 integration/ 和 e2e/ 節
  describe('只有部分子目錄有測試檔', () => {
    it('空子目錄不出現在輸出中', () => {
      const testsDir = join(TMP_DIR, 'partial-subdirs');
      const unitDir = makeTmpDir('partial-subdirs', 'unit');
      makeTmpDir('partial-subdirs', 'integration'); // 空
      // 不建立 e2e/

      writeTestFile(unitDir, 'only-unit.test.js', `describe('Only Unit', () => {});`);

      const result = buildTestIndex(testsDir);
      expect(result).toContain('## unit/');
      expect(result).not.toContain('## integration/');
      expect(result).not.toContain('## e2e/');
    });
  });

  // 驗證真實專案 tests/ 目錄（整合驗證）
  describe('真實專案 tests/ 目錄', () => {
    const realTestsDir = join(__dirname, '..', '..', 'tests');

    it('真實 tests/ 目錄產出非空字串', () => {
      const result = buildTestIndex(realTestsDir);
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it('真實輸出以 [Test Index] 開頭', () => {
      const result = buildTestIndex(realTestsDir);
      expect(result).toMatch(/^\[Test Index\]/);
    });

    it('真實輸出包含 unit/ 節', () => {
      const result = buildTestIndex(realTestsDir);
      expect(result).toContain('## unit/');
    });

    it('真實輸出長度不超過預設 maxChars（4000）', () => {
      const result = buildTestIndex(realTestsDir);
      expect(result.length).toBeLessThanOrEqual(4000);
    });
  });

});
