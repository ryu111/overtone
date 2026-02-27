'use strict';
/**
 * event-bus.test.js — EventBus 核心方法整合測試
 *
 * 覆蓋範圍：
 *   - register 後 push 事件會呼叫 adapter.onPush()
 *   - handleControl('stop') 將 loop 標記為停止
 *   - 未 register 的 adapter 不在 push 分發中（靜默）
 *   - handleControl 傳入未知命令回傳 ok: false
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { mkdirSync, rmSync, readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const EventBus = require(join(SCRIPTS_LIB, 'remote', 'event-bus'));
const Adapter = require(join(SCRIPTS_LIB, 'remote', 'adapter'));
const loop = require(join(SCRIPTS_LIB, 'loop'));

// 測試用 session ID（全域唯一，避免衝突）
const TEST_SESSION = `test_event_bus_${Date.now()}`;
const SESSION_DIR = join(homedir(), '.overtone', 'sessions', TEST_SESSION);

beforeAll(() => {
  mkdirSync(SESSION_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(SESSION_DIR, { recursive: true, force: true });
});

// ── Mock Adapter ──

/**
 * 繼承 Adapter，override onPush 記錄呼叫參數。
 */
class MockAdapter extends Adapter {
  constructor(eventBus) {
    super('mock', eventBus);
    /** @type {Array<[string|null, string, object]>} */
    this.calls = [];
  }

  onPush(sessionId, eventType, data) {
    this.calls.push([sessionId, eventType, data]);
  }
}

// ── Scenario 1 ──

describe('Scenario 1: register 後 push 事件會呼叫 adapter.onPush()', () => {
  test('push 呼叫 adapter.onPush 一次，且參數正確', () => {
    const eventBus = new EventBus();
    const mockAdapter = new MockAdapter(eventBus);

    eventBus.register(mockAdapter);
    eventBus.push('session-1', 'workflow', { stages: {} });

    expect(mockAdapter.calls.length).toBe(1);
    expect(mockAdapter.calls[0]).toEqual(['session-1', 'workflow', { stages: {} }]);
  });
});

// ── Scenario 2 ──

describe('Scenario 2: handleControl("stop") 將 loop 標記為停止', () => {
  test('回傳 ok: true 且 loop.json 的 stopped 變為 true', () => {
    // loop.readLoop 在 loop.json 不存在時會自動初始化（stopped: false）
    // 需確保 session 目錄存在（beforeAll 已建立）
    const loopBefore = loop.readLoop(TEST_SESSION);
    expect(loopBefore.stopped).toBe(false);

    const eventBus = new EventBus();
    const result = eventBus.handleControl(TEST_SESSION, 'stop');

    expect(result.ok).toBe(true);
    expect(typeof result.message).toBe('string');

    // 讀回驗證
    const saved = loop.readLoop(TEST_SESSION);
    expect(saved.stopped).toBe(true);
  });
});

// ── Scenario 3 ──

describe('Scenario 3: 未 register 的 adapter 不在 push 分發中', () => {
  test('adapters 為空時 push 不拋出例外', () => {
    const eventBus = new EventBus();
    // 確認沒有任何 adapter
    expect(eventBus.adapters.size).toBe(0);

    // 不應拋出
    expect(() => {
      eventBus.push('session-1', 'heartbeat', { ts: '2026-01-01' });
    }).not.toThrow();
  });
});

// ── Scenario 4 ──

describe('Scenario 4: handleControl 傳入未知命令回傳 ok: false', () => {
  test('未知命令回傳包含 ok: false 的物件', () => {
    const eventBus = new EventBus();
    const result = eventBus.handleControl(null, 'nonexistent-command');

    expect(result.ok).toBe(false);
  });
});
