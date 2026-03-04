'use strict';
/**
 * telegram-run.test.js — Telegram /run 命令單元測試
 *
 * 測試 TelegramAdapter._handleRun 佇列寫入功能：
 *   - 缺少 featureName → 用法提示
 *   - 缺少 projectRoot → 錯誤訊息
 *   - 無效 workflow → 錯誤訊息
 *   - 正常寫入 → 確認訊息
 *   - 預設 workflow → standard
 */

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, readFileSync, existsSync } = require('fs');
const { tmpdir } = require('os');

const TelegramAdapter = require('../../plugins/overtone/scripts/lib/remote/telegram-adapter');

// mock _sendMessage 收集發送的訊息
function createAdapter(options = {}) {
  const adapter = new TelegramAdapter('fake-token', null, options);
  adapter._messages = [];
  adapter._sendMessage = function (chatId, text) {
    this._messages.push({ chatId, text });
  };
  return adapter;
}

// 建立臨時 projectRoot（需要 global hash 目錄結構）
let tmpRoot;
beforeEach(() => {
  tmpRoot = join(tmpdir(), `overtone-test-run-${Date.now()}`);
  mkdirSync(tmpRoot, { recursive: true });
});
afterEach(() => {
  try { rmSync(tmpRoot, { recursive: true }); } catch { /* 忽略 */ }
});

describe('Telegram /run 命令', () => {
  test('缺少 featureName → 回覆用法提示', () => {
    const adapter = createAdapter({ projectRoot: tmpRoot });
    adapter._handleRun(123, undefined, undefined);

    expect(adapter._messages.length).toBe(1);
    expect(adapter._messages[0].text).toContain('/run');
    expect(adapter._messages[0].chatId).toBe(123);
  });

  test('缺少 projectRoot → 回覆錯誤', () => {
    const adapter = createAdapter();
    adapter._handleRun(123, 'my-feature', 'quick');

    expect(adapter._messages.length).toBe(1);
    expect(adapter._messages[0].text).toContain('projectRoot');
  });

  test('無效 workflow → 回覆錯誤並列出可用清單', () => {
    const adapter = createAdapter({ projectRoot: tmpRoot });
    adapter._handleRun(123, 'my-feature', 'nonexistent-workflow');

    expect(adapter._messages.length).toBe(1);
    expect(adapter._messages[0].text).toContain('未知');
    expect(adapter._messages[0].text).toContain('nonexistent-workflow');
  });

  test('正常 /run → 寫入佇列並回覆確認', () => {
    const adapter = createAdapter({ projectRoot: tmpRoot });
    adapter._handleRun(123, 'fix-auth', 'quick');

    expect(adapter._messages.length).toBe(1);
    expect(adapter._messages[0].text).toContain('已加入佇列');
    expect(adapter._messages[0].text).toContain('fix-auth');
    expect(adapter._messages[0].text).toContain('quick');
  });

  test('未指定 workflow → 預設使用 standard', () => {
    const adapter = createAdapter({ projectRoot: tmpRoot });
    adapter._handleRun(123, 'new-feature', undefined);

    expect(adapter._messages.length).toBe(1);
    expect(adapter._messages[0].text).toContain('standard');
  });

  test('_handleUpdate 正確路由 /run 命令', () => {
    const adapter = createAdapter({ projectRoot: tmpRoot });
    adapter._handleUpdate({
      message: {
        chat: { id: 456 },
        text: '/run deploy-fix quick',
      },
    });

    expect(adapter._messages.length).toBe(1);
    expect(adapter._messages[0].text).toContain('已加入佇列');
    expect(adapter._messages[0].text).toContain('deploy-fix');
  });
});

describe('TelegramAdapter constructor', () => {
  test('projectRoot 從 options 傳入', () => {
    const adapter = new TelegramAdapter('token', null, { projectRoot: '/test/path' });
    expect(adapter.projectRoot).toBe('/test/path');
  });

  test('projectRoot 預設為 null', () => {
    const adapter = new TelegramAdapter('token', null, {});
    expect(adapter.projectRoot).toBeNull();
  });
});
