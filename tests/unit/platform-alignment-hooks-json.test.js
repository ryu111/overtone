'use strict';
/**
 * platform-alignment-hooks-json.test.js
 *
 * Feature 1g: hooks.json 更新（SessionEnd + PostToolUseFailure）
 * BDD 規格：specs/features/in-progress/platform-alignment-phase1/bdd.md
 *
 * 驗證 hooks.json 符合 Claude Code 官方三層嵌套格式且包含所有必要 hook。
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

    test('hooks.json 包含 hooks 物件（官方三層嵌套格式）', () => {
      expect(hooksConfig).not.toBeNull();
      expect(typeof hooksConfig.hooks).toBe('object');
      expect(Array.isArray(hooksConfig.hooks)).toBe(false);
    });

    test('hooks 事件數量大於 0', () => {
      expect(Object.keys(hooksConfig.hooks).length).toBeGreaterThan(0);
    });
  });

  // Scenario 1g-1: hooks.json 包含 SessionEnd hook 設定
  describe('Scenario 1g-1: hooks.json 包含 SessionEnd hook', () => {
    test('找到 SessionEnd 事件的 hook', () => {
      expect(hooksConfig.hooks.SessionEnd).toBeDefined();
    });

    test('SessionEnd hook handler type 為 command', () => {
      const handler = hooksConfig.hooks.SessionEnd[0].hooks[0];
      expect(handler.type).toBe('command');
    });

    test('SessionEnd hook command 路徑包含 on-session-end.js', () => {
      const handler = hooksConfig.hooks.SessionEnd[0].hooks[0];
      expect(handler.command).toContain('on-session-end.js');
    });
  });

  // Scenario 1g-2: hooks.json 包含 PostToolUseFailure hook 設定
  describe('Scenario 1g-2: hooks.json 包含 PostToolUseFailure hook', () => {
    test('找到 PostToolUseFailure 事件的 hook', () => {
      expect(hooksConfig.hooks.PostToolUseFailure).toBeDefined();
    });

    test('PostToolUseFailure hook handler type 為 command', () => {
      const handler = hooksConfig.hooks.PostToolUseFailure[0].hooks[0];
      expect(handler.type).toBe('command');
    });

    test('PostToolUseFailure hook command 路徑包含 post-use-failure.js', () => {
      const handler = hooksConfig.hooks.PostToolUseFailure[0].hooks[0];
      expect(handler.command).toContain('post-use-failure.js');
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Guard: hooks.json 官方三層嵌套格式驗證
// 防止格式回退到扁平陣列格式（曾導致 PreCompact 等 hook 無法觸發）
// ────────────────────────────────────────────────────────────────────────────

describe('Guard: hooks.json 官方三層嵌套格式', () => {
  test('hooks 頂層值是物件（不是陣列）', () => {
    expect(typeof hooksConfig.hooks).toBe('object');
    expect(Array.isArray(hooksConfig.hooks)).toBe(false);
  });

  test('每個事件 key 的值是陣列（matcher groups）', () => {
    for (const [event, groups] of Object.entries(hooksConfig.hooks)) {
      expect(Array.isArray(groups), `${event} 的值應該是陣列`).toBe(true);
      expect(groups.length, `${event} 至少有一個 matcher group`).toBeGreaterThan(0);
    }
  });

  test('每個 matcher group 包含 hooks 陣列（handlers）', () => {
    for (const [event, groups] of Object.entries(hooksConfig.hooks)) {
      for (const group of groups) {
        expect(Array.isArray(group.hooks), `${event} 的 matcher group 必須包含 hooks 陣列`).toBe(true);
        expect(group.hooks.length, `${event} 的 hooks 至少有一個 handler`).toBeGreaterThan(0);
      }
    }
  });

  test('每個 handler 包含 type 和 command 欄位', () => {
    for (const [event, groups] of Object.entries(hooksConfig.hooks)) {
      for (const group of groups) {
        for (const handler of group.hooks) {
          expect(handler.type, `${event} handler 缺少 type`).toBeDefined();
          expect(handler.command, `${event} handler 缺少 command`).toBeDefined();
        }
      }
    }
  });

  test('不存在舊格式的 event 欄位（防止回退）', () => {
    for (const [event, groups] of Object.entries(hooksConfig.hooks)) {
      for (const group of groups) {
        expect(group.event, `${event} 的 matcher group 不應有 event 欄位（舊格式殘留）`).toBeUndefined();
        for (const handler of group.hooks) {
          expect(handler.event, `${event} 的 handler 不應有 event 欄位（舊格式殘留）`).toBeUndefined();
        }
      }
    }
  });

  test('matcher 只出現在 group 層級，不在 handler 層級', () => {
    for (const [event, groups] of Object.entries(hooksConfig.hooks)) {
      for (const group of groups) {
        for (const handler of group.hooks) {
          expect(handler.matcher, `${event} 的 handler 不應有 matcher（應在 group 層級）`).toBeUndefined();
        }
      }
    }
  });
});
