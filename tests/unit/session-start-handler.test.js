'use strict';
/**
 * session-start-handler.test.js — session-start-handler.js 純函數單元測試
 *
 * 驗證範圍（Humble Object 模式）：
 *   - buildBanner：banner 字串組裝邏輯
 *   - buildStartOutput：輸出物件組裝邏輯
 *   - handleSessionStart：主 handler（副作用部分以整合測試覆蓋）
 *
 * 不測試：
 *   - stdin/stdout 解析（那是 hook 薄殼層面，由 session-start.test.js 的 spawn 測試覆蓋）
 *   - 目錄建立、timeline emit 等 I/O 副作用（由 session-start.test.js 覆蓋）
 */

const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const handler = require(join(SCRIPTS_LIB, 'session-start-handler'));
const { buildBanner, buildStartOutput } = handler;

// ────────────────────────────────────────────────────────────────────────────
// buildBanner
// ────────────────────────────────────────────────────────────────────────────

describe('buildBanner', () => {
  test('回傳值為字串', () => {
    const result = buildBanner('1.0.0', 'test-session-id', 7777, {});
    expect(typeof result).toBe('string');
  });

  test('包含傳入的版本號', () => {
    const result = buildBanner('0.28.99', 'any-session', 7777, {});
    expect(result).toContain('0.28.99');
  });

  test('包含 session ID 前 8 碼', () => {
    const result = buildBanner('1.0.0', 'abcdef1234567890', 7777, {});
    expect(result).toContain('abcdef12');
  });

  test('有 port 時顯示 Dashboard URL', () => {
    const result = buildBanner('1.0.0', 'test-session', 7777, {});
    expect(result).toContain('http://localhost:7777/');
  });

  test('port 為 null 時不顯示 Dashboard URL', () => {
    const result = buildBanner('1.0.0', 'test-session', null, {});
    expect(result).not.toContain('Dashboard:');
  });

  test('sessionId 為 null 時不顯示 Session 行', () => {
    const result = buildBanner('1.0.0', null, null, {});
    expect(result).not.toContain('Session:');
  });

  test('有 agentBrowserStatus 時顯示', () => {
    const result = buildBanner('1.0.0', 'test-session', null, {
      agentBrowserStatus: '  🌐 agent-browser: 已安裝',
    });
    expect(result).toContain('agent-browser: 已安裝');
  });

  test('有 ghStatus 時顯示', () => {
    const result = buildBanner('1.0.0', 'test-session', null, {
      ghStatus: '  🐙 gh CLI: 已安裝且已認證',
    });
    expect(result).toContain('gh CLI: 已安裝且已認證');
  });

  test('有 grayMatterStatus 時顯示', () => {
    const result = buildBanner('1.0.0', 'test-session', null, {
      grayMatterStatus: '  ⚠️  gray-matter 未安裝 — cd plugins/overtone && bun add gray-matter',
    });
    expect(result).toContain('gray-matter 未安裝');
  });

  test('deps 為 null 時不拋出例外', () => {
    expect(() => buildBanner('1.0.0', 'test-session', null, null)).not.toThrow();
  });

  test('banner 開頭為空行（確保排版一致）', () => {
    const result = buildBanner('1.0.0', 'test-session', null, {});
    expect(result.startsWith('\n')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildStartOutput
// ────────────────────────────────────────────────────────────────────────────

describe('buildStartOutput', () => {
  test('回傳含 result 欄位的物件', () => {
    const output = buildStartOutput({}, { banner: 'some banner', msgs: [] });
    expect(output).toHaveProperty('result');
    expect(output.result).toBe('some banner');
  });

  test('msgs 為空時不包含 systemMessage', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: [] });
    expect(output.systemMessage).toBeUndefined();
  });

  test('msgs 含一個字串時 systemMessage 等於該字串', () => {
    const msg = '## 未完成任務\n\n- [ ] DEV';
    const output = buildStartOutput({}, { banner: 'banner', msgs: [msg] });
    expect(output.systemMessage).toBe(msg);
  });

  test('msgs 含多個字串時以雙換行連接', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: ['A', 'B', 'C'] });
    expect(output.systemMessage).toBe('A\n\nB\n\nC');
  });

  test('msgs 含 null/undefined 時自動過濾', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: [null, 'valid', undefined, ''] });
    expect(output.systemMessage).toBe('valid');
  });

  test('msgs 全為 falsy 時不包含 systemMessage', () => {
    const output = buildStartOutput({}, { banner: 'banner', msgs: [null, undefined, ''] });
    expect(output.systemMessage).toBeUndefined();
  });

  test('options 為 undefined 時回傳預設結構', () => {
    const output = buildStartOutput({}, undefined);
    expect(output.result).toBe('');
    expect(output.systemMessage).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// handleSessionStart — 基本回傳結構（不測副作用）
// ────────────────────────────────────────────────────────────────────────────

describe('handleSessionStart — 基本回傳結構', () => {
  test('回傳物件含 result 欄位（字串）', () => {
    // 傳入無 session 環境（避免 I/O 副作用）
    const result = handler.handleSessionStart(
      { cwd: process.cwd() },
      null,  // sessionId 為 null，跳過目錄建立和 timeline emit
      null   // hookTimer 為 null，跳過 timing emit
    );
    expect(typeof result).toBe('object');
    expect(typeof result.result).toBe('string');
  });

  test('result 字串包含版本號（來自 plugin.json）', () => {
    const result = handler.handleSessionStart({ cwd: process.cwd() }, null, null);
    // 版本號格式為 x.y.z，確認 result 中包含合理的版本字串
    expect(result.result).toMatch(/\d+\.\d+\.\d+/);
  });

  test('hookTimer 為 null 時不拋出例外', () => {
    expect(() => handler.handleSessionStart({ cwd: process.cwd() }, null, null)).not.toThrow();
  });

  test('hookTimer 提供 emit 時會被呼叫（sessionId 為 null 時跳過）', () => {
    let emitCalled = false;
    const mockTimer = {
      emit: (sid, hookName, eventName) => {
        // sessionId 為 null 時 hook-timing 內部會跳過，但 handler 仍會呼叫
        emitCalled = true;
      },
    };
    handler.handleSessionStart({ cwd: process.cwd() }, null, mockTimer);
    expect(emitCalled).toBe(true);
  });
});
