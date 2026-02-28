'use strict';
/**
 * platform-alignment-hooks-json.test.js
 *
 * Feature 1g: hooks.json 更新（SessionEnd + PostToolUseFailure）
 * BDD 規格：specs/features/in-progress/platform-alignment-phase1/bdd.md
 *
 * 驗證 hooks.json 包含兩個新增的 hook 設定且仍是合法 JSON。
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const fs = require('fs');
const { PLUGIN_ROOT } = require('../helpers/paths');

const HOOKS_JSON_PATH = join(PLUGIN_ROOT, 'hooks', 'hooks.json');

// ── 讀取並解析 hooks.json ──

let hooksConfig = null;

try {
  const content = fs.readFileSync(HOOKS_JSON_PATH, 'utf8');
  hooksConfig = JSON.parse(content);
} catch {
  // 解析失敗時留 null，測試中驗證
}

// ────────────────────────────────────────────────────────────────────────────
// Feature 1g: hooks.json 更新
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1g: hooks.json 更新', () => {

  // Scenario 1g-3: hooks.json 是合法 JSON
  describe('Scenario 1g-3: hooks.json 是合法 JSON', () => {
    test('hooks.json 存在', () => {
      expect(fs.existsSync(HOOKS_JSON_PATH)).toBe(true);
    });

    test('hooks.json 可解析為合法 JSON', () => {
      const content = fs.readFileSync(HOOKS_JSON_PATH, 'utf8');
      let parsed;
      expect(() => {
        parsed = JSON.parse(content);
      }).not.toThrow();
      expect(parsed).toBeDefined();
    });

    test('hooks.json 包含 hooks 陣列', () => {
      expect(hooksConfig).not.toBeNull();
      expect(Array.isArray(hooksConfig.hooks)).toBe(true);
    });

    test('hooks 陣列長度大於 0', () => {
      expect(hooksConfig.hooks.length).toBeGreaterThan(0);
    });
  });

  // Scenario 1g-1: hooks.json 包含 SessionEnd hook 設定
  describe('Scenario 1g-1: hooks.json 包含 SessionEnd hook', () => {
    test('找到 event 為 SessionEnd 的 hook', () => {
      const sessionEndHook = hooksConfig.hooks.find(h => h.event === 'SessionEnd');
      expect(sessionEndHook).toBeDefined();
    });

    test('SessionEnd hook type 為 command', () => {
      const sessionEndHook = hooksConfig.hooks.find(h => h.event === 'SessionEnd');
      expect(sessionEndHook.type).toBe('command');
    });

    test('SessionEnd hook command 路徑包含 on-session-end.js', () => {
      const sessionEndHook = hooksConfig.hooks.find(h => h.event === 'SessionEnd');
      expect(sessionEndHook.command).toContain('on-session-end.js');
    });
  });

  // Scenario 1g-2: hooks.json 包含 PostToolUseFailure hook 設定
  describe('Scenario 1g-2: hooks.json 包含 PostToolUseFailure hook', () => {
    test('找到 event 為 PostToolUseFailure 的 hook', () => {
      const failureHook = hooksConfig.hooks.find(h => h.event === 'PostToolUseFailure');
      expect(failureHook).toBeDefined();
    });

    test('PostToolUseFailure hook type 為 command', () => {
      const failureHook = hooksConfig.hooks.find(h => h.event === 'PostToolUseFailure');
      expect(failureHook.type).toBe('command');
    });

    test('PostToolUseFailure hook command 路徑包含 post-use-failure.js', () => {
      const failureHook = hooksConfig.hooks.find(h => h.event === 'PostToolUseFailure');
      expect(failureHook.command).toContain('post-use-failure.js');
    });
  });
});
