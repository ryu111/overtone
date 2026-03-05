'use strict';
const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WORDING_RULES, detectWordingMismatch } = require('../../plugins/overtone/scripts/lib/wording');

// 建立臨時 .md 檔案的輔助函式
let tmpDir;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wording-test-'));
});
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmp(filename, content) {
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

describe('WORDING_RULES', () => {
  test('共有三條規則', () => {
    expect(WORDING_RULES).toHaveLength(3);
  });

  test('每條規則均含必要欄位', () => {
    for (const rule of WORDING_RULES) {
      expect(typeof rule.emoji).toBe('string');
      expect(typeof rule.level).toBe('string');
      expect(typeof rule.matchLevel).toBe('string');
      expect(typeof rule.suggestion).toBe('string');
      expect(rule.pattern).toBeInstanceOf(RegExp);
    }
  });

  test('規則一：💡 + MUST 匹配', () => {
    expect(WORDING_RULES[0].pattern.test('💡 MUST do this')).toBe(true);
  });

  test('規則二：📋 + consider 匹配（case-insensitive）', () => {
    expect(WORDING_RULES[1].pattern.test('📋 Consider this option')).toBe(true);
  });

  test('規則三：⛔ + should 匹配（case-insensitive）', () => {
    expect(WORDING_RULES[2].pattern.test('⛔ should be fine')).toBe(true);
  });
});

describe('detectWordingMismatch', () => {
  describe('輸入守衛', () => {
    test('undefined → 回傳空陣列', () => {
      expect(detectWordingMismatch(undefined)).toEqual([]);
    });

    test('非 .md 檔案 → 回傳空陣列', () => {
      expect(detectWordingMismatch('/some/path/file.js')).toEqual([]);
      expect(detectWordingMismatch('/some/path/file.txt')).toEqual([]);
      expect(detectWordingMismatch('/some/path/file.json')).toEqual([]);
    });

    test('不存在的 .md 檔案 → 回傳空陣列（不拋錯）', () => {
      expect(detectWordingMismatch('/nonexistent/path/file.md')).toEqual([]);
    });
  });

  describe('正常路徑 — 無問題文件', () => {
    test('空內容 → 無警告', () => {
      const f = writeTmp('empty.md', '');
      expect(detectWordingMismatch(f)).toEqual([]);
    });

    test('正確措詞（💡 should）→ 無警告', () => {
      const f = writeTmp('correct1.md', '💡 should 使用此方式\n');
      expect(detectWordingMismatch(f)).toEqual([]);
    });

    test('正確措詞（📋 MUST）→ 無警告', () => {
      const f = writeTmp('correct2.md', '📋 MUST 遵守此規則\n');
      expect(detectWordingMismatch(f)).toEqual([]);
    });

    test('正確措詞（⛔ NEVER）→ 無警告', () => {
      const f = writeTmp('correct3.md', '⛔ NEVER 執行此操作\n');
      expect(detectWordingMismatch(f)).toEqual([]);
    });
  });

  describe('規則一：💡 + 強制關鍵詞', () => {
    test('💡 MUST → 觸發警告', () => {
      const f = writeTmp('rule1-must.md', '💡 MUST do this thing\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('💡');
      expect(warnings[0]).toContain('軟引導');
    });

    test('💡 ALWAYS → 觸發警告', () => {
      const f = writeTmp('rule1-always.md', '💡 ALWAYS remember\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('ALWAYS');
    });

    test('💡 NEVER → 觸發警告', () => {
      const f = writeTmp('rule1-never.md', '💡 NEVER ignore this\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(1);
    });

    test('警告訊息含行號', () => {
      const f = writeTmp('rule1-linenum.md', 'line 1\n💡 MUST check\nline 3\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings[0]).toContain('第 2 行');
    });
  });

  describe('規則二：📋 + 建議用詞', () => {
    test('📋 consider → 觸發警告', () => {
      const f = writeTmp('rule2-consider.md', '📋 consider this approach\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('📋');
    });

    test('📋 may → 觸發警告', () => {
      const f = writeTmp('rule2-may.md', '📋 may be used here\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(1);
    });

    test('📋 could → 觸發警告', () => {
      const f = writeTmp('rule2-could.md', '📋 could work this way\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(1);
    });
  });

  describe('規則三：⛔ + 軟語氣', () => {
    test('⛔ should → 觸發警告', () => {
      const f = writeTmp('rule3-should.md', '⛔ should be avoided\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('⛔');
    });

    test('⛔ prefer → 觸發警告', () => {
      const f = writeTmp('rule3-prefer.md', '⛔ prefer this way\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(1);
    });

    test('⛔ consider → 觸發警告', () => {
      const f = writeTmp('rule3-consider.md', '⛔ consider alternatives\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(1);
    });
  });

  describe('排除邏輯', () => {
    test('code fence 內的不匹配行不觸發警告', () => {
      const content = [
        '正常文字行',
        '```',
        '💡 MUST ignore this inside fence',
        '```',
        '繼續正常行',
      ].join('\n');
      const f = writeTmp('codefence.md', content);
      expect(detectWordingMismatch(f)).toEqual([]);
    });

    test('Markdown 表格行不觸發警告', () => {
      const content = '| 💡 | MUST | 說明用對照表 |\n';
      const f = writeTmp('table.md', content);
      expect(detectWordingMismatch(f)).toEqual([]);
    });

    test('縮排的 code fence 也正確追蹤', () => {
      const content = [
        '項目：',
        '  ```',
        '  💡 MUST be ignored',
        '  ```',
      ].join('\n');
      const f = writeTmp('indented-fence.md', content);
      expect(detectWordingMismatch(f)).toEqual([]);
    });
  });

  describe('每行只報告第一個問題', () => {
    test('同一行有多個規則命中 → 只回傳一個警告', () => {
      // 💡 + MUST 命中規則一，即使也含其他詞
      const f = writeTmp('multi-rule.md', '💡 MUST NEVER ignore this\n');
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(1);
    });
  });

  describe('多行文件', () => {
    test('多個問題行 → 各自一個警告', () => {
      const content = [
        '# 標題',
        '💡 MUST do this',
        '正常行',
        '⛔ should not be soft',
      ].join('\n');
      const f = writeTmp('multi-line.md', content);
      const warnings = detectWordingMismatch(f);
      expect(warnings).toHaveLength(2);
    });

    test('超過 1000 行的檔案只掃描前 1000 行', () => {
      const lines = [];
      for (let i = 0; i < 1010; i++) {
        lines.push(i < 1000 ? '正常行' : '💡 MUST trigger if scanned');
      }
      const f = writeTmp('long-file.md', lines.join('\n'));
      // 問題在第 1001+ 行，不應觸發
      const warnings = detectWordingMismatch(f);
      expect(warnings).toEqual([]);
    });
  });
});
