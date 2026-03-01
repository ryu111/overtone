'use strict';
/**
 * notification-hook.test.js
 *
 * S12: Notification hook（on-notification.js）整合測試
 *
 * 策略：使用 Bun.spawnSync 啟動真實子進程，驗證 hook 端到端行為。
 * 注意：hook 會嘗試播放音效，但非 darwin 平台靜默跳過，不影響測試。
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const { readFileSync } = require('fs');
const { HOOKS_DIR } = require('../helpers/paths');

const HOOK_PATH = join(HOOKS_DIR, 'notification', 'on-notification.js');

// ── 輔助函式 ──

function runHook(input) {
  const envConfig = {
    ...process.env,
    OVERTONE_NO_DASHBOARD: '1',
  };
  delete envConfig.CLAUDE_SESSION_ID;

  const proc = Bun.spawnSync(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: envConfig,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : '';
  const stderr = proc.stderr ? new TextDecoder().decode(proc.stderr) : '';

  return {
    exitCode: proc.exitCode,
    stdout,
    stderr,
    parsed: (() => { try { return JSON.parse(stdout); } catch { return null; } })(),
  };
}

function runHookRaw(rawInput) {
  const envConfig = {
    ...process.env,
    OVERTONE_NO_DASHBOARD: '1',
  };
  delete envConfig.CLAUDE_SESSION_ID;

  const proc = Bun.spawnSync(['node', HOOK_PATH], {
    stdin: Buffer.from(rawInput),
    env: envConfig,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : '';

  return {
    exitCode: proc.exitCode,
    stdout,
    parsed: (() => { try { return JSON.parse(stdout); } catch { return null; } })(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Notification hook 測試
// ────────────────────────────────────────────────────────────────────────────

describe('Notification hook（on-notification.js）', () => {

  // ── elicitation_dialog ──

  describe('elicitation_dialog 事件', () => {
    test('回傳 { result: "" }（不阻擋通知）', () => {
      const { parsed } = runHook({
        type: 'elicitation_dialog',
        session_id: 'test-session-001',
      });

      expect(parsed).not.toBeNull();
      expect(parsed.result).toBe('');
    });

    test('exit code 為 0', () => {
      const { exitCode } = runHook({
        type: 'elicitation_dialog',
        session_id: 'test-session-002',
      });

      expect(exitCode).toBe(0);
    });
  });

  // ── permission_prompt（不播放音效，但不 crash）──

  describe('permission_prompt 事件（不在 SOUND_TYPES 中）', () => {
    test('回傳 { result: "" }（不阻擋通知、不播放音效）', () => {
      const { parsed } = runHook({
        type: 'permission_prompt',
        session_id: 'test-session-003',
      });

      expect(parsed).not.toBeNull();
      expect(parsed.result).toBe('');
    });

    test('exit code 為 0', () => {
      const { exitCode } = runHook({
        type: 'permission_prompt',
        session_id: 'test-session-004',
      });

      expect(exitCode).toBe(0);
    });
  });

  // ── notification_type 欄位（替代欄位名稱）──

  describe('notification_type 欄位（替代格式）', () => {
    test('elicitation_dialog 透過 notification_type 欄位也正確處理', () => {
      const { parsed, exitCode } = runHook({
        notification_type: 'elicitation_dialog',
        session_id: 'test-session-005',
      });

      expect(exitCode).toBe(0);
      expect(parsed).not.toBeNull();
      expect(parsed.result).toBe('');
    });

    test('permission_prompt 透過 notification_type 欄位也不 crash（不播放音效）', () => {
      const { parsed, exitCode } = runHook({
        notification_type: 'permission_prompt',
        session_id: 'test-session-006',
      });

      expect(exitCode).toBe(0);
      expect(parsed).not.toBeNull();
      expect(parsed.result).toBe('');
    });
  });

  // ── 不需要音效的通知類型 ──

  describe('idle_prompt 事件（不在 SOUND_TYPES 中）', () => {
    test('回傳 { result: "" }（不播放音效、不阻擋）', () => {
      const { parsed } = runHook({
        type: 'idle_prompt',
        session_id: 'test-session-007',
      });

      expect(parsed).not.toBeNull();
      expect(parsed.result).toBe('');
    });

    test('exit code 為 0', () => {
      const { exitCode } = runHook({
        type: 'idle_prompt',
        session_id: 'test-session-008',
      });

      expect(exitCode).toBe(0);
    });
  });

  // ── 空 input 容錯 ──

  describe('空 input 或畸形 JSON', () => {
    test('空 JSON {} 不 crash，回傳 { result: "" }', () => {
      const { parsed, exitCode } = runHook({});

      expect(exitCode).toBe(0);
      expect(parsed).not.toBeNull();
      expect(parsed.result).toBe('');
    });

    test('畸形 JSON 不 crash，exit code 為 0', () => {
      const { exitCode, parsed } = runHookRaw('{broken json');

      expect(exitCode).toBe(0);
      // safeRun 確保 fallback 輸出
      expect(parsed).not.toBeNull();
      expect(parsed.result).toBe('');
    });

    test('空字串 input 不 crash，exit code 為 0', () => {
      const { exitCode, parsed } = runHookRaw('');

      expect(exitCode).toBe(0);
      expect(parsed).not.toBeNull();
      expect(parsed.result).toBe('');
    });
  });

  // ── hooks.json 設定驗證 ──

  describe('hooks.json 設定', () => {
    test('hooks.json 包含 Notification hook', () => {
      const hooksJsonPath = join(HOOKS_DIR, '..', 'hooks.json');
      const content = readFileSync(hooksJsonPath, 'utf8');
      const config = JSON.parse(content);
      const notificationHook = config.hooks.find(h => h.event === 'Notification');

      expect(notificationHook).toBeDefined();
      expect(notificationHook.type).toBe('command');
      expect(notificationHook.command).toContain('on-notification.js');
    });

    test('Notification hook 不設定 matcher（接收所有通知類型）', () => {
      const hooksJsonPath = join(HOOKS_DIR, '..', 'hooks.json');
      const content = readFileSync(hooksJsonPath, 'utf8');
      const config = JSON.parse(content);
      const notificationHook = config.hooks.find(h => h.event === 'Notification');

      // 不設定 matcher 表示接收所有通知
      expect(notificationHook.matcher).toBeUndefined();
    });
  });
});
