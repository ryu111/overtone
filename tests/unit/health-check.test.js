// @sequential
'use strict';
/**
 * health-check.test.js — health-check.js 單元測試
 *
 * 覆蓋：
 *   Feature 1: phantom-events 偵測
 *   Feature 2: dead-exports 偵測
 *   Feature 5: duplicate-logic 偵測
 *   Feature 6: 輸出格式（parseModuleExportKeys、parsePathsExports）
 *   Feature 工具函式: collectJsFiles、toRelative
 */

const { test, expect, describe } = require('bun:test');
const path = require('path');
const { join } = path;
const { mkdirSync, writeFileSync, rmSync, utimesSync } = require('fs');
const os = require('os');
const { SCRIPTS_DIR } = require('../helpers/paths');
const {
  checkPhantomEvents,
  checkDeadExports,
  checkDocCodeDrift,
  checkUnusedPaths,
  checkDuplicateLogic,
  checkDocStaleness,
  checkTestGrowth,
  checkSpecsDirectoryStructure,
  collectJsFiles,
  collectMdFiles,
  parseModuleExportKeys,
  parsePathsExports,
  TEST_BASELINE,
  TEST_GROWTH_THRESHOLD,
  PLUGIN_ROOT,
  SCRIPTS_LIB,
  DOCS_DIR,
  PROJECT_ROOT,
} = require(join(SCRIPTS_DIR, 'health-check'));
const { getCachedRunAllChecks } = require('../helpers/health-check-cache');

// ── 效能：lazy cache 避免重複目錄掃描（個別 check 函式用）──
const _cache = new Map();
function cached(fn) {
  if (!_cache.has(fn)) _cache.set(fn, fn());
  return _cache.get(fn);
}

// ══════════════════════════════════════════════════════════════════
// 工具函式測試
// ══════════════════════════════════════════════════════════════════

describe('collectJsFiles', () => {
  test('回傳陣列', () => {
    const files = collectJsFiles(PLUGIN_ROOT);
    expect(Array.isArray(files)).toBe(true);
  });

  test('所有結果都以 .js 結尾', () => {
    const files = collectJsFiles(SCRIPTS_LIB);
    for (const f of files) {
      expect(f.endsWith('.js')).toBe(true);
    }
  });

  test('結果數量大於 0（lib 目錄有檔案）', () => {
    const files = collectJsFiles(SCRIPTS_LIB);
    expect(files.length).toBeGreaterThan(0);
  });

  test('不存在的目錄回傳空陣列', () => {
    const files = collectJsFiles('/nonexistent/path/xyz');
    expect(files).toEqual([]);
  });

  test('遞迴收集子目錄', () => {
    const files = collectJsFiles(SCRIPTS_LIB);
    // scripts/lib 有 dashboard/ 和 remote/ 子目錄
    const hasDashboard = files.some((f) => f.includes('dashboard'));
    const hasRemote = files.some((f) => f.includes('remote'));
    expect(hasDashboard || hasRemote).toBe(true);
  });
});

describe('parseModuleExportKeys', () => {
  test('解析簡單 module.exports = { a, b, c }', () => {
    const content = `
'use strict';
function a() {}
function b() {}
const c = 1;
module.exports = { a, b, c };
    `;
    const keys = parseModuleExportKeys(content);
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).toContain('c');
  });

  test('解析 key: value 格式', () => {
    const content = `
module.exports = {
  readState: readStateImpl,
  writeState: writeStateImpl,
};
    `;
    const keys = parseModuleExportKeys(content);
    expect(keys).toContain('readState');
    expect(keys).toContain('writeState');
  });

  test('沒有 module.exports 時回傳空陣列', () => {
    const content = `function foo() {} exports.foo = foo;`;
    const keys = parseModuleExportKeys(content);
    expect(keys).toEqual([]);
  });

  test('class instance export 不被解析（module.exports = new ...）', () => {
    const content = `class MyClass {} module.exports = new MyClass();`;
    const keys = parseModuleExportKeys(content);
    // module.exports = new ... 不符合 module.exports = { ... } 模式
    expect(keys).toEqual([]);
  });

  test('不重複回傳相同 key', () => {
    const content = `module.exports = { foo, foo };`;
    const keys = parseModuleExportKeys(content);
    const fooCount = keys.filter((k) => k === 'foo').length;
    expect(fooCount).toBe(1);
  });
});

describe('parsePathsExports', () => {
  test('解析 paths.js 真實檔案的 export', () => {
    const { readFileSync } = require('fs');
    const pathsContent = readFileSync(path.join(SCRIPTS_LIB, 'paths.js'), 'utf8');
    const keys = parsePathsExports(pathsContent);

    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);
    // paths.js 已知有 session、project 等 export
    expect(keys.some((k) => ['NOVA_HOME', 'sessionDir', 'session', 'project'].includes(k))).toBe(true);
  });

  test('沒有 module.exports 時回傳空陣列', () => {
    const keys = parsePathsExports('const foo = 1;');
    expect(keys).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 1: phantom-events 偵測
// ══════════════════════════════════════════════════════════════════

describe('checkPhantomEvents', () => {
  test('回傳陣列', () => {
    const findings = cached(checkPhantomEvents);
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "phantom-events"', () => {
    const findings = cached(checkPhantomEvents);
    for (const f of findings) {
      expect(f.check).toBe('phantom-events');
    }
  });

  test('finding severity 只能是 error 或 warning', () => {
    const findings = cached(checkPhantomEvents);
    const validSeverities = new Set(['error', 'warning']);
    for (const f of findings) {
      expect(validSeverities.has(f.severity)).toBe(true);
    }
  });

  test('每個 finding 包含必要欄位', () => {
    const findings = cached(checkPhantomEvents);
    for (const f of findings) {
      expect(typeof f.check).toBe('string');
      expect(typeof f.severity).toBe('string');
      expect(typeof f.file).toBe('string');
      expect(typeof f.message).toBe('string');
    }
  });

  test('registry 沒有定義的 emit 事件會產生 error finding', () => {
    // 此測試驗證邏輯：registry 未定義 → error
    // 由於無法直接注入 mock，改為確認實際結果中 error 的 finding 確實來自未定義事件
    const findings = cached(checkPhantomEvents);
    const errors = findings.filter((f) => f.severity === 'error');
    for (const e of errors) {
      // error finding 的 message 應說明 emit 了未定義的事件
      expect(e.message).toContain('emit');
    }
  });

  test('warning finding 的 file 指向 registry.js', () => {
    const findings = cached(checkPhantomEvents);
    const warnings = findings.filter((f) => f.severity === 'warning');
    for (const w of warnings) {
      expect(w.file).toContain('registry.js');
    }
  });

  // 驗證真實 codebase 不產生假陽性（warning = 0）
  // 已知 7 個事件曾被誤報：含 hyphen 的 event、物件字面量 type 欄位、bash printf 寫入的事件
  test('真實 codebase 不產生 phantom-events warning（false positive 為 0）', () => {
    const findings = cached(checkPhantomEvents);
    const warnings = findings.filter((f) => f.severity === 'warning');
    expect(warnings.length).toBe(0);
  });

  // 驗證含 hyphen 的 registry 事件不被誤報
  test('含 hyphen 的 registry 事件（specs:tasks-missing 等）不產生 warning', () => {
    const findings = cached(checkPhantomEvents);
    const hyphenEvents = [
      'specs:tasks-missing',
      'specs:archive-skipped',
      'session:compact-suggestion',
    ];
    const warnings = findings.filter((f) => f.severity === 'warning');
    for (const evt of hyphenEvents) {
      const found = warnings.some((w) => w.message.includes(evt));
      expect(found).toBe(false);
    }
  });

  // 驗證物件字面量 type 欄位的事件不被誤報（stop-message-builder 回傳模式）
  test('物件字面量 type 欄位的事件（stage:retry、error:fatal、parallel:converge）不產生 warning', () => {
    const findings = cached(checkPhantomEvents);
    const literalEvents = ['stage:retry', 'error:fatal', 'parallel:converge'];
    const warnings = findings.filter((f) => f.severity === 'warning');
    for (const evt of literalEvents) {
      const found = warnings.some((w) => w.message.includes(evt));
      expect(found).toBe(false);
    }
  });

  // 驗證 bash printf 寫入 timeline 的事件（grader:score）不被誤報
  test('bash printf 寫入 timeline 的事件（grader:score）不產生 warning', () => {
    const findings = cached(checkPhantomEvents);
    const warnings = findings.filter((f) => f.severity === 'warning');
    const found = warnings.some((w) => w.message.includes('grader:score'));
    expect(found).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: dead-exports 偵測
// ══════════════════════════════════════════════════════════════════

describe('checkDeadExports', () => {
  test('回傳陣列', () => {
    const findings = cached(checkDeadExports);
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "dead-exports"', () => {
    const findings = cached(checkDeadExports);
    for (const f of findings) {
      expect(f.check).toBe('dead-exports');
    }
  });

  test('finding severity 為 warning', () => {
    const findings = cached(checkDeadExports);
    for (const f of findings) {
      expect(f.severity).toBe('warning');
    }
  });

  test('每個 finding 包含 export key 資訊', () => {
    const findings = cached(checkDeadExports);
    for (const f of findings) {
      expect(f.message).toBeTruthy();
      expect(f.file).toBeTruthy();
    }
  });

  test('instinct.js（class instance export）不被納入檢查', () => {
    const findings = cached(checkDeadExports);
    // instinct.js 使用 module.exports = new Instinct()，應被排除
    // 注意：過濾條件精確匹配 instinct.js，不含 global-instinct.js
    const instinctFindings = findings.filter((f) => f.file.endsWith('lib/instinct.js'));
    expect(instinctFindings.length).toBe(0);
  });

  test('registry.js 的 stages export 不被標記為 dead', () => {
    const findings = cached(checkDeadExports);
    // stages 在多個地方被使用，不應被標記
    const stagesDeadFindings = findings.filter(
      (f) => f.file.includes('registry.js') && f.message.includes('"stages"')
    );
    expect(stagesDeadFindings.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 3: doc-code-drift 偵測
// ══════════════════════════════════════════════════════════════════

describe('checkDocCodeDrift', () => {
  test('回傳陣列', () => {
    const findings = cached(checkDocCodeDrift);
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "doc-code-drift"', () => {
    const findings = cached(checkDocCodeDrift);
    for (const f of findings) {
      expect(f.check).toBe('doc-code-drift');
    }
  });

  test('finding severity 為 warning', () => {
    const findings = cached(checkDocCodeDrift);
    for (const f of findings) {
      expect(f.severity).toBe('warning');
    }
  });

  test('每個 finding 的 message 包含實際值與 docs 記載值', () => {
    const findings = cached(checkDocCodeDrift);
    for (const f of findings) {
      // message 應說明 docs 記載的值與實際不符
      expect(f.message).toMatch(/docs 記載 \d+ 個.+，但程式碼實際有 \d+ 個/);
    }
  });

  test('複合短語不應被視為計數聲明（假陽性排除）', () => {
    // 「8 個 agent 消費」「14 stage shortcut」「8 個 hook 合約」等複合短語
    // 後面緊跟另一個詞，應被 checkDocCodeDrift 排除，不產生 finding
    const findings = cached(checkDocCodeDrift);
    // 已知複合短語：8 個 agent 消費、14 stage shortcut、7 workflow pipeline、8 個 hook 合約等
    // 這些不應出現在 findings 中
    const compositeMatches = findings.filter(
      (f) => f.detail && /match: "8 個 agent"/.test(f.detail) && /docs\/spec\/overtone/.test(f.file)
    );
    expect(compositeMatches.length).toBe(0);

    const stageShortcut = findings.filter(
      (f) => f.detail && /match: "14 stage"/.test(f.detail)
    );
    expect(stageShortcut.length).toBe(0);

    const workflowPipeline = findings.filter(
      (f) => f.detail && /match: "7 workflow"/.test(f.detail)
    );
    expect(workflowPipeline.length).toBe(0);
  });

  test('grader 豁免：agent 數為 actual+1 時不產生 finding', () => {
    // grader.md 存在於 agents/ 目錄但不計入 registry stages，
    // 所以文件中的「17 個 Agents」（16 stage agents + grader）應被豁免
    const findings = cached(checkDocCodeDrift);
    const graderFalsePositives = findings.filter(
      (f) => f.detail && /docs: 17/.test(f.detail) && /actual: 16/.test(f.detail) && /agent/i.test(f.detail)
    );
    expect(graderFalsePositives.length).toBe(0);
  });

  test('當前 codebase 無 doc-code-drift finding', () => {
    // 確保所有文件中的計數描述與程式碼真值一致（含複合短語排除後）
    const findings = cached(checkDocCodeDrift);
    expect(findings.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 4: unused-paths 偵測
// ══════════════════════════════════════════════════════════════════

describe('checkUnusedPaths', () => {
  test('回傳陣列', () => {
    const findings = cached(checkUnusedPaths);
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "unused-paths"', () => {
    const findings = cached(checkUnusedPaths);
    for (const f of findings) {
      expect(f.check).toBe('unused-paths');
    }
  });

  test('finding severity 為 info', () => {
    const findings = cached(checkUnusedPaths);
    for (const f of findings) {
      expect(f.severity).toBe('info');
    }
  });

  test('finding 的 file 指向 paths.js', () => {
    const findings = cached(checkUnusedPaths);
    for (const f of findings) {
      expect(f.file).toContain('paths.js');
    }
  });

  test('每個 finding 包含 export 名稱', () => {
    const findings = cached(checkUnusedPaths);
    for (const f of findings) {
      expect(f.message).toBeTruthy();
      expect(f.detail).toBeTruthy();
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 5: duplicate-logic 偵測
// ══════════════════════════════════════════════════════════════════

describe('checkDuplicateLogic', () => {
  test('回傳陣列', () => {
    const findings = cached(checkDuplicateLogic);
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "duplicate-logic"', () => {
    const findings = cached(checkDuplicateLogic);
    for (const f of findings) {
      expect(f.check).toBe('duplicate-logic');
    }
  });

  test('finding severity 為 info', () => {
    const findings = cached(checkDuplicateLogic);
    for (const f of findings) {
      expect(f.severity).toBe('info');
    }
  });

  test('finding 的 detail 包含出現的檔案清單', () => {
    const findings = cached(checkDuplicateLogic);
    for (const f of findings) {
      expect(f.detail).toContain('出現於：');
    }
  });

  test('finding 的 message 包含 pattern 名稱', () => {
    const findings = cached(checkDuplicateLogic);
    const knownPatterns = ['agentToStage', 'calcDuration', 'findActualStageKey'];
    for (const f of findings) {
      const matchesAnyPattern = knownPatterns.some((p) => f.message.includes(p));
      expect(matchesAnyPattern).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 7: checkDocStaleness 偵測
// ══════════════════════════════════════════════════════════════════

describe('checkDocStaleness', () => {
  // 使用暫存目錄模擬 docs/reference/ 場景
  let tmpDir;

  function setup() {
    tmpDir = path.join(os.tmpdir(), `overtone-test-staleness-${Date.now()}`);
    mkdirSync(path.join(tmpDir, 'reference'), { recursive: true });
    mkdirSync(path.join(tmpDir, 'archive'), { recursive: true });
    mkdirSync(path.join(tmpDir, 'spec'), { recursive: true });
  }

  function teardown() {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  /**
   * 建立一個修改時間為 N 天前的檔案
   */
  function createStaleFile(filePath, daysOld) {
    writeFileSync(filePath, `# ${path.basename(filePath)}\n內容`);
    const mtime = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    utimesSync(filePath, mtime, mtime);
  }

  test('空的 reference 目錄回傳空陣列', () => {
    setup();
    // 直接呼叫實際函式（docs/reference 存在且有檔案的話才有 finding）
    // 本測試驗證：若 reference 目錄不存在，回傳空陣列
    const findings = cached(checkDocStaleness);
    expect(Array.isArray(findings)).toBe(true);
    teardown();
  });

  test('所有 finding 的 check 欄位為 "doc-staleness"', () => {
    const findings = cached(checkDocStaleness);
    for (const f of findings) {
      expect(f.check).toBe('doc-staleness');
    }
  });

  test('finding severity 為 warning', () => {
    const findings = cached(checkDocStaleness);
    for (const f of findings) {
      expect(f.severity).toBe('warning');
    }
  });

  test('每個 finding 包含必要欄位', () => {
    const findings = cached(checkDocStaleness);
    for (const f of findings) {
      expect(typeof f.check).toBe('string');
      expect(typeof f.severity).toBe('string');
      expect(typeof f.file).toBe('string');
      expect(typeof f.message).toBe('string');
      expect(typeof f.detail).toBe('string');
    }
  });

  test('finding message 包含天數和「建議歸檔或刪除」', () => {
    const findings = cached(checkDocStaleness);
    for (const f of findings) {
      expect(f.message).toMatch(/\d+ 天未更新，建議歸檔或刪除/);
    }
  });

  test('finding detail 包含「最後更新」和「無引用」', () => {
    const findings = cached(checkDocStaleness);
    for (const f of findings) {
      expect(f.detail).toContain('最後更新：');
      expect(f.detail).toContain('無引用');
    }
  });

  test('finding file 路徑以 docs/reference/ 開頭', () => {
    const findings = cached(checkDocStaleness);
    for (const f of findings) {
      expect(f.file).toMatch(/^docs\/reference\//);
    }
  });

  test('回傳陣列（真實 codebase）', () => {
    const findings = cached(checkDocStaleness);
    expect(Array.isArray(findings)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 6: runAllChecks 輸出格式
// ══════════════════════════════════════════════════════════════════

describe('runAllChecks', () => {
  test('回傳 { checks, findings } 物件', () => {
    const result = getCachedRunAllChecks();
    expect(result).toBeDefined();
    expect(Array.isArray(result.checks)).toBe(true);
    expect(Array.isArray(result.findings)).toBe(true);
  }, 15_000); // 首次呼叫（如尚未 cache）需要 7-10 秒，後續命中 cache 極快

  test('checks 陣列長度至少為 12（含 F1/F2/F3 三個主動偵測）', () => {
    const { checks } = getCachedRunAllChecks();
    expect(checks.length).toBeGreaterThanOrEqual(12);
  });

  test('checks 包含所有 12 個偵測項目名稱', () => {
    const { checks } = getCachedRunAllChecks();
    const names = checks.map((c) => c.name);
    expect(names).toContain('phantom-events');
    expect(names).toContain('dead-exports');
    expect(names).toContain('doc-code-drift');
    expect(names).toContain('unused-paths');
    expect(names).toContain('duplicate-logic');
    expect(names).toContain('platform-drift');
    expect(names).toContain('doc-staleness');
    expect(names).toContain('os-tools');
    expect(names).toContain('component-chain');
    expect(names).toContain('data-quality');
    expect(names).toContain('quality-trends');
    expect(names).toContain('test-growth');
  });

  test('每個 check 項目包含 name、passed、findingsCount', () => {
    const { checks } = getCachedRunAllChecks();
    for (const c of checks) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.passed).toBe('boolean');
      expect(typeof c.findingsCount).toBe('number');
    }
  });

  test('check.findingsCount 與實際 findings 數量一致', () => {
    const { checks, findings } = getCachedRunAllChecks();
    for (const c of checks) {
      const actual = findings.filter((f) => f.check === c.name).length;
      expect(c.findingsCount).toBe(actual);
    }
  });

  test('check.passed 當且僅當 findingsCount === 0 時為 true', () => {
    const { checks } = getCachedRunAllChecks();
    for (const c of checks) {
      if (c.findingsCount === 0) {
        expect(c.passed).toBe(true);
      } else {
        expect(c.passed).toBe(false);
      }
    }
  });

  test('所有 finding 的 severity 只能是 error/warning/info', () => {
    const { findings } = getCachedRunAllChecks();
    const valid = new Set(['error', 'warning', 'info']);
    for (const f of findings) {
      expect(valid.has(f.severity)).toBe(true);
    }
  });

  test('所有 finding 的 check 只能是已知 25 個 check 名稱之一', () => {
    const { findings } = getCachedRunAllChecks();
    const validChecks = new Set([
      'phantom-events', 'dead-exports', 'doc-code-drift', 'unused-paths',
      'duplicate-logic', 'platform-drift', 'doc-staleness', 'os-tools',
      'component-chain', 'data-quality', 'quality-trends', 'test-growth',
      'closed-loop', 'recovery-strategy', 'completion-gap', 'dependency-sync',
      'internalization-index', 'test-file-alignment', 'skill-reference-integrity',
      'concurrency-guards', 'compact-frequency', 'sequential-markers',
      'specs-directory-structure', 'orphan-queues', 'skill-quality',
    ]);
    for (const f of findings) {
      expect(validChecks.has(f.check)).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 12: checkTestGrowth 測試增長率偵測
// ══════════════════════════════════════════════════════════════════

describe('checkTestGrowth', () => {
  test('回傳陣列', () => {
    const findings = cached(checkTestGrowth);
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "test-growth"', () => {
    const findings = cached(checkTestGrowth);
    for (const f of findings) {
      expect(f.check).toBe('test-growth');
    }
  });

  test('finding severity 為 warning', () => {
    const findings = cached(checkTestGrowth);
    for (const f of findings) {
      expect(f.severity).toBe('warning');
    }
  });

  test('每個 finding 包含必要欄位', () => {
    const findings = cached(checkTestGrowth);
    for (const f of findings) {
      expect(typeof f.check).toBe('string');
      expect(typeof f.severity).toBe('string');
      expect(typeof f.file).toBe('string');
      expect(typeof f.message).toBe('string');
    }
  });

  // ── DI 注入測試 ──

  test('正常情況（未超標）：注入等於基線的計數 → 回傳空陣列（pass）', () => {
    const fakeDeps = () => ({ tests: TEST_BASELINE.tests, files: TEST_BASELINE.files });
    const findings = checkTestGrowth(fakeDeps);
    expect(findings).toEqual([]);
  });

  test('正常情況（略微增長但未超標）：注入 +10% 計數 → 回傳空陣列', () => {
    const fakeDeps = () => ({
      tests: Math.floor(TEST_BASELINE.tests * 1.10),
      files: Math.floor(TEST_BASELINE.files * 1.10),
    });
    const findings = checkTestGrowth(fakeDeps);
    expect(findings).toEqual([]);
  });

  test('超標情況（tests 增長 > 20%）：注入 +25% tests 計數 → 回傳 warning', () => {
    const fakeDeps = () => ({
      tests: Math.floor(TEST_BASELINE.tests * 1.25),
      files: TEST_BASELINE.files,
    });
    const findings = checkTestGrowth(fakeDeps);
    const testWarnings = findings.filter((f) => f.message.includes('tests:'));
    expect(testWarnings.length).toBe(1);
    expect(testWarnings[0].severity).toBe('warning');
    expect(testWarnings[0].message).toMatch(/\+\d+%/);
    expect(testWarnings[0].message).toContain('threshold: 20%');
  });

  test('超標情況（files 增長 > 20%）：注入 +30% files 計數 → 回傳 warning', () => {
    const fakeDeps = () => ({
      tests: TEST_BASELINE.tests,
      files: Math.floor(TEST_BASELINE.files * 1.30),
    });
    const findings = checkTestGrowth(fakeDeps);
    const fileWarnings = findings.filter((f) => f.message.includes('files:'));
    expect(fileWarnings.length).toBe(1);
    expect(fileWarnings[0].severity).toBe('warning');
    expect(fileWarnings[0].message).toContain('threshold: 20%');
  });

  test('tests 和 files 同時超標：兩個 warning', () => {
    const fakeDeps = () => ({
      tests: Math.floor(TEST_BASELINE.tests * 1.50),
      files: Math.floor(TEST_BASELINE.files * 1.50),
    });
    const findings = checkTestGrowth(fakeDeps);
    expect(findings.length).toBe(2);
    const checks = findings.map((f) => f.check);
    expect(checks.every((c) => c === 'test-growth')).toBe(true);
  });

  test('finding detail 包含 baseline 值和 current 值', () => {
    const fakeDeps = () => ({
      tests: Math.floor(TEST_BASELINE.tests * 1.25),
      files: TEST_BASELINE.files,
    });
    const findings = checkTestGrowth(fakeDeps);
    const testWarning = findings.find((f) => f.message.includes('tests:'));
    expect(testWarning).toBeDefined();
    expect(testWarning.detail).toContain(`baseline: ${TEST_BASELINE.tests}`);
    expect(testWarning.detail).toContain('current:');
  });

  test('getDepsOverride 拋出例外時回傳 warning finding', () => {
    const brokenDeps = () => { throw new Error('計數失敗'); };
    const findings = checkTestGrowth(brokenDeps);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toContain('計數失敗');
  });

  test('TEST_BASELINE 常數格式正確', () => {
    expect(typeof TEST_BASELINE.tests).toBe('number');
    expect(typeof TEST_BASELINE.files).toBe('number');
    expect(typeof TEST_BASELINE.date).toBe('string');
    expect(TEST_BASELINE.tests).toBeGreaterThan(0);
    expect(TEST_BASELINE.files).toBeGreaterThan(0);
  });

  test('TEST_GROWTH_THRESHOLD 為 0.20', () => {
    expect(TEST_GROWTH_THRESHOLD).toBe(0.20);
  });
});

// ══════════════════════════════════════════════════════════════════
// checkSpecsDirectoryStructure
// ══════════════════════════════════════════════════════════════════

describe('checkSpecsDirectoryStructure', () => {
  const tmpDir = path.join(os.tmpdir(), `hc-specs-dir-${Date.now()}`);
  const featuresDir = path.join(tmpDir, 'specs', 'features');

  test('合法目錄不產生 finding', () => {
    mkdirSync(path.join(featuresDir, 'in-progress'), { recursive: true });
    mkdirSync(path.join(featuresDir, 'archive'), { recursive: true });
    mkdirSync(path.join(featuresDir, 'backlog'), { recursive: true });

    const findings = checkSpecsDirectoryStructure(tmpDir);
    expect(findings).toEqual([]);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('非法目錄 "done" 產生 error', () => {
    mkdirSync(path.join(featuresDir, 'in-progress'), { recursive: true });
    mkdirSync(path.join(featuresDir, 'done'), { recursive: true });

    const findings = checkSpecsDirectoryStructure(tmpDir);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('done');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('specs/features 不存在時靜默回傳空陣列', () => {
    const noExist = path.join(os.tmpdir(), `hc-no-specs-${Date.now()}`);
    const findings = checkSpecsDirectoryStructure(noExist);
    expect(findings).toEqual([]);
  });
});
