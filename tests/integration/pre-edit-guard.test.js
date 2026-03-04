'use strict';
// pre-edit-guard.test.js — PreToolUse(Write|Edit) guard 整合測試
//
// 測試元件檔案保護機制：
//   受保護檔案 → deny、非受保護檔案 → allow
//   plugin 目錄外檔案 → allow、無 file_path → allow
//   MEMORY.md 行數守衛 → 超過上限 deny、限制內 allow

const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { PLUGIN_ROOT } = require('../helpers/paths');
const { runPreEditGuard, isAllowed } = require('../helpers/hook-runner');

// MEMORY.md 相關常數
const MEMORY_LINE_LIMIT = 200;
const MEMORY_PATH = '/Users/sbu/.claude/projects/-Users-sbu-projects-overtone/memory/MEMORY.md';

// ── 輔助函式 ──

/**
 * 判斷 guard 輸出是否為 deny
 * @param {object} parsed
 * @returns {boolean}
 */
function isDenied(parsed) {
  return parsed?.hookSpecificOutput?.permissionDecision === 'deny';
}

/**
 * 取得 deny 原因
 * @param {object} parsed
 * @returns {string}
 */
function denyReason(parsed) {
  return parsed?.hookSpecificOutput?.permissionDecisionReason || '';
}

// ────────────────────────────────────────────────────────────────────────────
// 受保護檔案 → deny
// ────────────────────────────────────────────────────────────────────────────

describe('PreEditGuard: 受保護檔案阻擋', () => {

  describe('agents/*.md', () => {
    test('Write agents/developer.md → deny', () => {
      const result = runPreEditGuard('Write', {
        file_path: join(PLUGIN_ROOT, 'agents', 'developer.md'),
      });
      expect(result.exitCode).toBe(0);
      expect(isDenied(result.parsed)).toBe(true);
      expect(denyReason(result.parsed)).toContain('Agent 定義');
      expect(denyReason(result.parsed)).toContain('manage-component.js');
    });

    test('Edit agents/planner.md → deny', () => {
      const result = runPreEditGuard('Edit', {
        file_path: join(PLUGIN_ROOT, 'agents', 'planner.md'),
      });
      expect(result.exitCode).toBe(0);
      expect(isDenied(result.parsed)).toBe(true);
      expect(denyReason(result.parsed)).toContain('Agent 定義');
    });

    test('Write agents/new-agent.md → deny（新建也擋）', () => {
      const result = runPreEditGuard('Write', {
        file_path: join(PLUGIN_ROOT, 'agents', 'new-agent.md'),
      });
      expect(result.exitCode).toBe(0);
      expect(isDenied(result.parsed)).toBe(true);
    });
  });

  describe('hooks/hooks.json', () => {
    test('Write hooks/hooks.json → deny', () => {
      const result = runPreEditGuard('Write', {
        file_path: join(PLUGIN_ROOT, 'hooks', 'hooks.json'),
      });
      expect(result.exitCode).toBe(0);
      expect(isDenied(result.parsed)).toBe(true);
      expect(denyReason(result.parsed)).toContain('Hook 設定');
    });

    test('Edit hooks/hooks.json → deny', () => {
      const result = runPreEditGuard('Edit', {
        file_path: join(PLUGIN_ROOT, 'hooks', 'hooks.json'),
      });
      expect(result.exitCode).toBe(0);
      expect(isDenied(result.parsed)).toBe(true);
    });
  });

  describe('skills/*/SKILL.md', () => {
    test('Write skills/testing/SKILL.md → deny', () => {
      const result = runPreEditGuard('Write', {
        file_path: join(PLUGIN_ROOT, 'skills', 'testing', 'SKILL.md'),
      });
      expect(result.exitCode).toBe(0);
      expect(isDenied(result.parsed)).toBe(true);
      expect(denyReason(result.parsed)).toContain('Skill 定義');
    });

    test('Edit skills/auto/SKILL.md → deny', () => {
      const result = runPreEditGuard('Edit', {
        file_path: join(PLUGIN_ROOT, 'skills', 'auto', 'SKILL.md'),
      });
      expect(result.exitCode).toBe(0);
      expect(isDenied(result.parsed)).toBe(true);
    });
  });

  describe('scripts/lib/registry-data.json', () => {
    test('Write registry-data.json → deny', () => {
      const result = runPreEditGuard('Write', {
        file_path: join(PLUGIN_ROOT, 'scripts', 'lib', 'registry-data.json'),
      });
      expect(result.exitCode).toBe(0);
      expect(isDenied(result.parsed)).toBe(true);
      expect(denyReason(result.parsed)).toContain('Registry 資料');
    });

    test('Edit registry-data.json → deny', () => {
      const result = runPreEditGuard('Edit', {
        file_path: join(PLUGIN_ROOT, 'scripts', 'lib', 'registry-data.json'),
      });
      expect(result.exitCode).toBe(0);
      expect(isDenied(result.parsed)).toBe(true);
    });
  });

  describe('.claude-plugin/plugin.json', () => {
    test('Write plugin.json → deny', () => {
      const result = runPreEditGuard('Write', {
        file_path: join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'),
      });
      expect(result.exitCode).toBe(0);
      expect(isDenied(result.parsed)).toBe(true);
      expect(denyReason(result.parsed)).toContain('Plugin manifest');
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 非受保護檔案 → allow
// ────────────────────────────────────────────────────────────────────────────

describe('PreEditGuard: 非受保護檔案放行', () => {

  test('commands/*.md → allow（commands 不受保護）', () => {
    const result = runPreEditGuard('Write', {
      file_path: join(PLUGIN_ROOT, 'commands', 'auto', 'COMMAND.md'),
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('skills/*/references/*.md → allow（reference 不受保護）', () => {
    const result = runPreEditGuard('Write', {
      file_path: join(PLUGIN_ROOT, 'skills', 'testing', 'references', 'bdd.md'),
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('hooks/scripts/*.js → allow（hook 腳本不受保護）', () => {
    const result = runPreEditGuard('Edit', {
      file_path: join(PLUGIN_ROOT, 'hooks', 'scripts', 'tool', 'pre-task.js'),
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('scripts/lib/state.js → allow（一般 lib 不受保護）', () => {
    const result = runPreEditGuard('Edit', {
      file_path: join(PLUGIN_ROOT, 'scripts', 'lib', 'state.js'),
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('web/dashboard.html → allow（前端不受保護）', () => {
    const result = runPreEditGuard('Edit', {
      file_path: join(PLUGIN_ROOT, 'web', 'dashboard.html'),
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Plugin 目錄外 → allow
// ────────────────────────────────────────────────────────────────────────────

describe('PreEditGuard: Plugin 目錄外放行', () => {

  test('專案根目錄的檔案 → allow', () => {
    const result = runPreEditGuard('Write', {
      file_path: '/Users/sbu/projects/overtone/CLAUDE.md',
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('tests/ 目錄的檔案 → allow', () => {
    const result = runPreEditGuard('Write', {
      file_path: '/Users/sbu/projects/overtone/tests/unit/foo.test.js',
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('docs/ 目錄的檔案 → allow', () => {
    const result = runPreEditGuard('Edit', {
      file_path: '/Users/sbu/projects/overtone/docs/spec/overtone.md',
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('完全不相關的路徑 → allow', () => {
    const result = runPreEditGuard('Write', {
      file_path: '/tmp/some-random-file.txt',
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 邊界情況
// ────────────────────────────────────────────────────────────────────────────

describe('PreEditGuard: 邊界情況', () => {

  test('無 file_path → allow', () => {
    const result = runPreEditGuard('Write', {});
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('空 file_path → allow', () => {
    const result = runPreEditGuard('Write', { file_path: '' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('空 tool_input → allow', () => {
    const result = runPreEditGuard('Edit', undefined);
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('deny 訊息包含正確做法指引', () => {
    const result = runPreEditGuard('Write', {
      file_path: join(PLUGIN_ROOT, 'agents', 'developer.md'),
    });
    expect(isDenied(result.parsed)).toBe(true);
    const reason = denyReason(result.parsed);
    expect(reason).toContain('manage-component.js');
    expect(reason).toContain('createAgent');
    expect(reason).toContain('updateAgent');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MEMORY.md 行數守衛
// ────────────────────────────────────────────────────────────────────────────

describe('PreEditGuard: MEMORY.md 行數守衛', () => {

  test('Write 超過行數上限 → deny', () => {
    // 產生超過上限的內容
    const lines = Array.from({ length: MEMORY_LINE_LIMIT + 10 }, (_, i) => `第 ${i + 1} 行`);
    const result = runPreEditGuard('Write', {
      file_path: MEMORY_PATH,
      content: lines.join('\n'),
    });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('MEMORY.md');
    expect(denyReason(result.parsed)).toContain(`${MEMORY_LINE_LIMIT}`);
  });

  test('Write 在行數限制內 → allow', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 行`);
    const result = runPreEditGuard('Write', {
      file_path: MEMORY_PATH,
      content: lines.join('\n'),
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('Write 剛好等於上限 → allow', () => {
    const lines = Array.from({ length: MEMORY_LINE_LIMIT }, (_, i) => `第 ${i + 1} 行`);
    const result = runPreEditGuard('Write', {
      file_path: MEMORY_PATH,
      content: lines.join('\n'),
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('deny 訊息包含記錄規則', () => {
    const lines = Array.from({ length: MEMORY_LINE_LIMIT + 10 }, (_, i) => `第 ${i + 1} 行`);
    const result = runPreEditGuard('Write', {
      file_path: MEMORY_PATH,
      content: lines.join('\n'),
    });
    expect(isDenied(result.parsed)).toBe(true);
    const reason = denyReason(result.parsed);
    expect(reason).toContain('可記');
    expect(reason).toContain('禁記');
    expect(reason).toContain('架構決策');
    expect(reason).toContain('API 文檔');
  });

  test('非 .claude/projects 路徑的 MEMORY.md → 不觸發守衛', () => {
    // 這不是 Claude Code 的 auto-memory 路徑，不應攔截
    const result = runPreEditGuard('Write', {
      file_path: '/tmp/memory/MEMORY.md',
      content: Array.from({ length: 100 }, (_, i) => `${i}`).join('\n'),
    });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });
});
