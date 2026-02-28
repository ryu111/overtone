'use strict';
const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { writeFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { detectWordingMismatch, WORDING_RULES } = require(join(SCRIPTS_LIB, 'wording'));

// ── 測試用暫存 .md 檔案輔助函式 ──

let tmpCounter = 0;

function writeTmp(content) {
  const path = join(tmpdir(), `wording-test-${Date.now()}-${tmpCounter++}.md`);
  writeFileSync(path, content, 'utf8');
  return path;
}

function withTmp(content, fn) {
  const path = writeTmp(content);
  try {
    return fn(path);
  } finally {
    try { unlinkSync(path); } catch { /* 清理失敗靜默處理 */ }
  }
}

// ── Feature 1：Pattern 觸發（正面測試） ──

describe('detectWordingMismatch — 正面：應觸發警告', () => {
  test('💡 MUST → 有警告', () => {
    withTmp('💡 MUST validate all inputs before processing\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  test('💡 ALWAYS → 有警告', () => {
    withTmp('💡 ALWAYS run tests before committing\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  test('💡 NEVER → 有警告', () => {
    withTmp('💡 NEVER skip error handling\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  test('📋 consider（後有空格）→ 有警告', () => {
    withTmp('📋 consider adding more tests\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  test('📋 may（後有空格）→ 有警告', () => {
    withTmp('📋 may use caching for performance\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  test('📋 could → 有警告', () => {
    withTmp('📋 could be improved by refactoring\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  test('⛔ should → 有警告', () => {
    withTmp('⛔ should avoid committing secrets\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  test('⛔ prefer → 有警告', () => {
    withTmp('⛔ prefer typed parameters over any\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  test('⛔ may（後有空格）→ 有警告', () => {
    withTmp('⛔ may skip validation in some cases\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });
});

// ── Feature 1：正確措詞（負面測試） ──

describe('detectWordingMismatch — 負面：正確措詞不觸發警告', () => {
  test('📋 MUST → 無警告', () => {
    withTmp('📋 MUST validate inputs\n', path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });

  test('💡 should → 無警告', () => {
    withTmp('💡 should consider caching\n', path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });

  test('⛔ NEVER → 無警告', () => {
    withTmp('⛔ NEVER hardcode secrets\n', path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });

  test('🔧 consider → 無警告', () => {
    withTmp('🔧 consider extracting this as a utility\n', path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });

  test('📋 ALWAYS → 無警告', () => {
    withTmp('📋 ALWAYS run validation before saving\n', path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });
});

// ── Feature 2：False Positive 防護 ──

describe('detectWordingMismatch — False Positive 防護', () => {
  test('表格行（以 | 開頭）含 💡 MUST NOT → 無警告', () => {
    withTmp('| 💡 MUST NOT | 強規則 | 說明 |\n', path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });

  test('表格行（縮排後 | 開頭）→ 無警告', () => {
    withTmp('  | 💡 軟引導 | should, prefer | 最佳實踐 |\n', path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });

  test('非 .md 路徑（test.js）→ 回傳空陣列', () => {
    // 函式層級直接測試，不需要建立實際檔案
    const result = detectWordingMismatch('/some/path/test.js');
    expect(result).toEqual([]);
  });

  test('非 .md 路徑（instinct.js）→ 回傳空陣列', () => {
    const result = detectWordingMismatch('scripts/lib/instinct.js');
    expect(result).toEqual([]);
  });

  test('路徑為 undefined → 回傳空陣列', () => {
    expect(detectWordingMismatch(undefined)).toEqual([]);
  });

  test('路徑為 null → 回傳空陣列', () => {
    expect(detectWordingMismatch(null)).toEqual([]);
  });

  test('💡 如需使用 MUST NOT 的場景說明行 → 觸發警告（因為 💡 MUST NOT 在同一行）', () => {
    // BDD Spec: 「💡 如需使用 MUST NOT 的場景，請改用 ⛔ 標記」
    // 注意：此行確實包含 💡...MUST NOT 的 pattern，所以應該觸發
    // 但 spec 說「不應觸發」（因為是說明語境）
    // 實作採用 regex 精確匹配 /💡\s*(MUST|ALWAYS|NEVER|MUST\s*NOT)\b/
    // 此行 "💡 如需使用 MUST NOT" 中 "MUST" 和 "NOT" 之間有空格，且 "💡" 後面不是直接跟 MUST
    // 所以實際上應該不觸發（emoji 後面的詞是「如需」而非 MUST）
    withTmp('💡 如需使用 MUST NOT 的場景，請改用 ⛔ 標記\n', path => {
      // 這行 emoji 後直接跟「如需」，不匹配 /💡\s*(MUST|...)/
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });

  test('不存在的 .md 檔案 → 回傳空陣列（靜默處理）', () => {
    expect(detectWordingMismatch('/nonexistent/path/test.md')).toEqual([]);
  });
});

// ── Feature 3：輸出格式 ──

describe('detectWordingMismatch — 輸出格式', () => {
  test('有不匹配時，警告訊息包含行號（第 1 行）', () => {
    withTmp('💡 MUST validate all inputs before processing\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('第 1 行');
    });
  });

  test('不匹配在第 12 行時，警告包含「第 12 行」', () => {
    const lines = Array.from({ length: 11 }, (_, i) => `# 正常行 ${i + 1}`);
    lines.push('💡 MUST validate all inputs before processing');
    withTmp(lines.join('\n') + '\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('第 12 行');
    });
  });

  test('多處不匹配時，回傳多個警告', () => {
    const content = [
      '# 標題',
      '💡 MUST do X',
      '正常行',
      '📋 consider doing Y',
      '⛔ should avoid Z',
    ].join('\n') + '\n';

    withTmp(content, path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBe(3);
    });
  });

  test('多處不匹配時，各警告包含對應的行號', () => {
    const content = [
      '# 標題',           // 第 1 行
      '💡 MUST do X',     // 第 2 行
      '正常行',            // 第 3 行
      '📋 consider Y',    // 第 4 行
    ].join('\n') + '\n';

    withTmp(content, path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBe(2);
      expect(warnings[0]).toContain('第 2 行');
      expect(warnings[1]).toContain('第 4 行');
    });
  });

  test('警告訊息包含原始違規行內容', () => {
    const violatingLine = '💡 MUST validate all inputs before processing';
    withTmp(violatingLine + '\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings[0]).toContain(violatingLine);
    });
  });

  test('警告訊息包含修正建議', () => {
    withTmp('💡 MUST validate all inputs\n', path => {
      const warnings = detectWordingMismatch(path);
      // 建議應包含「📋」或「should」（引導改正）
      expect(warnings[0]).toMatch(/📋|should/);
    });
  });

  test('無不匹配時，回傳空陣列', () => {
    const content = [
      '📋 MUST validate inputs',
      '💡 should consider caching',
      '⛔ NEVER hardcode secrets',
      '🔧 consider refactoring this',
    ].join('\n') + '\n';

    withTmp(content, path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });
});

// ── Feature 4：Code Fence 排除 ──

describe('detectWordingMismatch — Code Fence 排除', () => {
  test('code fence 外的違規行正常觸發警告', () => {
    withTmp('💡 MUST validate inputs\n', path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  test('code fence 內的違規行不觸發警告', () => {
    const content = [
      '正常說明行',
      '```javascript',
      '💡 MUST validate inputs',
      '```',
    ].join('\n') + '\n';
    withTmp(content, path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });

  test('code fence 開啟行本身（``` 那一行）不觸發警告', () => {
    withTmp('```javascript\n', path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });

  test('code fence 關閉後恢復正常偵測', () => {
    const content = [
      '```javascript',
      '💡 MUST validate（code fence 內，應忽略）',
      '```',
      '💡 MUST always run tests（code fence 外，應偵測）',
    ].join('\n') + '\n';
    withTmp(content, path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('MUST always run tests');
    });
  });

  test('多個 code fence 區塊交替排列，只有 fence 外的違規行產生警告', () => {
    const content = [
      '```javascript',
      '💡 MUST not（fence 1 內，忽略）',
      '```',
      '💡 MUST fence-outside-1（fence 外，偵測）',
      '```python',
      '📋 consider（fence 2 內，忽略）',
      '```',
      '📋 consider fence-outside-2（fence 外，偵測）',
    ].join('\n') + '\n';
    withTmp(content, path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBe(2);
    });
  });

  test('縮排的 code fence 也被正確識別', () => {
    const content = [
      '  ```javascript',
      '💡 MUST validate（縮排 fence 內，應忽略）',
      '  ```',
    ].join('\n') + '\n';
    withTmp(content, path => {
      expect(detectWordingMismatch(path)).toEqual([]);
    });
  });

  test('code fence 關閉後警告的行號正確計算', () => {
    const content = [
      '```javascript',           // 第 1 行（fence 開啟）
      '💡 MUST inside（忽略）',  // 第 2 行（fence 內）
      '```',                     // 第 3 行（fence 關閉）
      '正常行',                  // 第 4 行
      '💡 MUST outside',        // 第 5 行（應偵測）
    ].join('\n') + '\n';
    withTmp(content, path => {
      const warnings = detectWordingMismatch(path);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('第 5 行');
    });
  });
});

// ── WORDING_RULES 常數驗證 ──

describe('WORDING_RULES 常數', () => {
  test('包含三個規則', () => {
    expect(WORDING_RULES).toHaveLength(3);
  });

  test('每個規則包含必要欄位（pattern, emoji, level, suggestion）', () => {
    for (const rule of WORDING_RULES) {
      expect(rule.pattern).toBeInstanceOf(RegExp);
      expect(typeof rule.emoji).toBe('string');
      expect(typeof rule.level).toBe('string');
      expect(typeof rule.suggestion).toBe('string');
    }
  });

  test('第一個規則匹配 💡 MUST', () => {
    expect(WORDING_RULES[0].pattern.test('💡 MUST do something')).toBe(true);
  });

  test('第一個規則匹配 💡 ALWAYS', () => {
    expect(WORDING_RULES[0].pattern.test('💡 ALWAYS run tests')).toBe(true);
  });

  test('第二個規則匹配 📋 consider', () => {
    expect(WORDING_RULES[1].pattern.test('📋 consider adding tests')).toBe(true);
  });

  test('第三個規則匹配 ⛔ should', () => {
    expect(WORDING_RULES[2].pattern.test('⛔ should avoid this')).toBe(true);
  });

  test('第一個規則不匹配 📋 MUST（正確搭配）', () => {
    expect(WORDING_RULES[0].pattern.test('📋 MUST validate')).toBe(false);
  });

  test('第二個規則不匹配 📋 MUST（正確搭配）', () => {
    expect(WORDING_RULES[1].pattern.test('📋 MUST validate')).toBe(false);
  });
});
