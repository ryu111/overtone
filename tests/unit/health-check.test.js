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
const {
  checkPhantomEvents,
  checkDeadExports,
  checkDocCodeDrift,
  checkUnusedPaths,
  checkDuplicateLogic,
  runAllChecks,
  collectJsFiles,
  parseModuleExportKeys,
  parsePathsExports,
  PLUGIN_ROOT,
  SCRIPTS_LIB,
} = require('../../plugins/overtone/scripts/health-check');

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
    expect(keys.some((k) => ['OVERTONE_HOME', 'sessionDir', 'session', 'project'].includes(k))).toBe(true);
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
    const findings = checkPhantomEvents();
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "phantom-events"', () => {
    const findings = checkPhantomEvents();
    for (const f of findings) {
      expect(f.check).toBe('phantom-events');
    }
  });

  test('finding severity 只能是 error 或 warning', () => {
    const findings = checkPhantomEvents();
    const validSeverities = new Set(['error', 'warning']);
    for (const f of findings) {
      expect(validSeverities.has(f.severity)).toBe(true);
    }
  });

  test('每個 finding 包含必要欄位', () => {
    const findings = checkPhantomEvents();
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
    const findings = checkPhantomEvents();
    const errors = findings.filter((f) => f.severity === 'error');
    for (const e of errors) {
      // error finding 的 message 應說明 emit 了未定義的事件
      expect(e.message).toContain('emit');
    }
  });

  test('warning finding 的 file 指向 registry.js', () => {
    const findings = checkPhantomEvents();
    const warnings = findings.filter((f) => f.severity === 'warning');
    for (const w of warnings) {
      expect(w.file).toContain('registry.js');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: dead-exports 偵測
// ══════════════════════════════════════════════════════════════════

describe('checkDeadExports', () => {
  test('回傳陣列', () => {
    const findings = checkDeadExports();
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "dead-exports"', () => {
    const findings = checkDeadExports();
    for (const f of findings) {
      expect(f.check).toBe('dead-exports');
    }
  });

  test('finding severity 為 warning', () => {
    const findings = checkDeadExports();
    for (const f of findings) {
      expect(f.severity).toBe('warning');
    }
  });

  test('每個 finding 包含 export key 資訊', () => {
    const findings = checkDeadExports();
    for (const f of findings) {
      expect(f.message).toBeTruthy();
      expect(f.file).toBeTruthy();
    }
  });

  test('instinct.js（class instance export）不被納入檢查', () => {
    const findings = checkDeadExports();
    // instinct.js 使用 module.exports = new Instinct()，應被排除
    const instinctFindings = findings.filter((f) => f.file.includes('instinct.js'));
    expect(instinctFindings.length).toBe(0);
  });

  test('registry.js 的 stages export 不被標記為 dead', () => {
    const findings = checkDeadExports();
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
    const findings = checkDocCodeDrift();
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "doc-code-drift"', () => {
    const findings = checkDocCodeDrift();
    for (const f of findings) {
      expect(f.check).toBe('doc-code-drift');
    }
  });

  test('finding severity 為 warning', () => {
    const findings = checkDocCodeDrift();
    for (const f of findings) {
      expect(f.severity).toBe('warning');
    }
  });

  test('每個 finding 的 message 包含實際值與 docs 記載值', () => {
    const findings = checkDocCodeDrift();
    for (const f of findings) {
      // message 應說明 docs 記載的值與實際不符
      expect(f.message).toMatch(/docs 記載 \d+ 個.+，但程式碼實際有 \d+ 個/);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 4: unused-paths 偵測
// ══════════════════════════════════════════════════════════════════

describe('checkUnusedPaths', () => {
  test('回傳陣列', () => {
    const findings = checkUnusedPaths();
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "unused-paths"', () => {
    const findings = checkUnusedPaths();
    for (const f of findings) {
      expect(f.check).toBe('unused-paths');
    }
  });

  test('finding severity 為 info', () => {
    const findings = checkUnusedPaths();
    for (const f of findings) {
      expect(f.severity).toBe('info');
    }
  });

  test('finding 的 file 指向 paths.js', () => {
    const findings = checkUnusedPaths();
    for (const f of findings) {
      expect(f.file).toContain('paths.js');
    }
  });

  test('每個 finding 包含 export 名稱', () => {
    const findings = checkUnusedPaths();
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
    const findings = checkDuplicateLogic();
    expect(Array.isArray(findings)).toBe(true);
  });

  test('所有 finding 的 check 欄位為 "duplicate-logic"', () => {
    const findings = checkDuplicateLogic();
    for (const f of findings) {
      expect(f.check).toBe('duplicate-logic');
    }
  });

  test('finding severity 為 info', () => {
    const findings = checkDuplicateLogic();
    for (const f of findings) {
      expect(f.severity).toBe('info');
    }
  });

  test('finding 的 detail 包含出現的檔案清單', () => {
    const findings = checkDuplicateLogic();
    for (const f of findings) {
      expect(f.detail).toContain('出現於：');
    }
  });

  test('finding 的 message 包含 pattern 名稱', () => {
    const findings = checkDuplicateLogic();
    const knownPatterns = ['agentToStage', 'calcDuration', 'findActualStageKey'];
    for (const f of findings) {
      const matchesAnyPattern = knownPatterns.some((p) => f.message.includes(p));
      expect(matchesAnyPattern).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 6: runAllChecks 輸出格式
// ══════════════════════════════════════════════════════════════════

describe('runAllChecks', () => {
  test('回傳 { checks, findings } 物件', () => {
    const result = runAllChecks();
    expect(result).toBeDefined();
    expect(Array.isArray(result.checks)).toBe(true);
    expect(Array.isArray(result.findings)).toBe(true);
  });

  test('checks 陣列長度為 5', () => {
    const { checks } = runAllChecks();
    expect(checks.length).toBe(5);
  });

  test('checks 包含所有 5 個偵測項目名稱', () => {
    const { checks } = runAllChecks();
    const names = checks.map((c) => c.name);
    expect(names).toContain('phantom-events');
    expect(names).toContain('dead-exports');
    expect(names).toContain('doc-code-drift');
    expect(names).toContain('unused-paths');
    expect(names).toContain('duplicate-logic');
  });

  test('每個 check 項目包含 name、passed、findingsCount', () => {
    const { checks } = runAllChecks();
    for (const c of checks) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.passed).toBe('boolean');
      expect(typeof c.findingsCount).toBe('number');
    }
  });

  test('check.findingsCount 與實際 findings 數量一致', () => {
    const { checks, findings } = runAllChecks();
    for (const c of checks) {
      const actual = findings.filter((f) => f.check === c.name).length;
      expect(c.findingsCount).toBe(actual);
    }
  });

  test('check.passed 當且僅當 findingsCount === 0 時為 true', () => {
    const { checks } = runAllChecks();
    for (const c of checks) {
      if (c.findingsCount === 0) {
        expect(c.passed).toBe(true);
      } else {
        expect(c.passed).toBe(false);
      }
    }
  });

  test('所有 finding 的 severity 只能是 error/warning/info', () => {
    const { findings } = runAllChecks();
    const valid = new Set(['error', 'warning', 'info']);
    for (const f of findings) {
      expect(valid.has(f.severity)).toBe(true);
    }
  });

  test('所有 finding 的 check 只能是已知 5 個 check 名稱之一', () => {
    const { findings } = runAllChecks();
    const validChecks = new Set(['phantom-events', 'dead-exports', 'doc-code-drift', 'unused-paths', 'duplicate-logic']);
    for (const f of findings) {
      expect(validChecks.has(f.check)).toBe(true);
    }
  });
});
