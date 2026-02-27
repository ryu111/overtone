'use strict';
const { test, expect, describe } = require('bun:test');
const Adapter = require('../../plugins/overtone/scripts/lib/remote/adapter');

describe('Adapter 基類', () => {
  describe('建立實例後可正常存取 name 屬性', () => {
    test('name 屬性等於建構時傳入的字串', () => {
      const adapter = new Adapter('test-adapter', null);
      expect(adapter.name).toBe('test-adapter');
    });

    test('初始 _connected 為 false', () => {
      const adapter = new Adapter('test-adapter', null);
      expect(adapter._connected).toBe(false);
    });
  });

  describe('呼叫 onPush() 未被子類覆寫時不拋出錯誤', () => {
    test('onPush() 靜默回傳，不拋出任何例外', () => {
      const adapter = new Adapter('test-adapter', null);
      expect(() => {
        adapter.onPush('session-1', 'workflow', { data: 1 });
      }).not.toThrow();
    });
  });

  describe('connect() / disconnect() 更新 isConnected 狀態', () => {
    test('初始 isConnected 為 false', () => {
      const adapter = new Adapter('test-adapter', null);
      expect(adapter.isConnected).toBe(false);
    });

    test('connect() 後 isConnected 為 true', () => {
      const adapter = new Adapter('test-adapter', null);
      adapter.connect();
      expect(adapter.isConnected).toBe(true);
    });

    test('disconnect() 後 isConnected 為 false', () => {
      const adapter = new Adapter('test-adapter', null);
      adapter.connect();
      adapter.disconnect();
      expect(adapter.isConnected).toBe(false);
    });
  });

  describe('子類可繼承並 override onPush()', () => {
    test('子類的 onPush 被呼叫且可記錄參數', () => {
      const calls = [];

      class TestAdapter extends Adapter {
        onPush(sessionId, eventType, data) {
          calls.push({ sessionId, eventType, data });
        }
      }

      const adapter = new TestAdapter('child-adapter', null);
      adapter.onPush('session-1', 'timeline', { value: 42 });

      expect(calls).toHaveLength(1);
      expect(calls[0].sessionId).toBe('session-1');
      expect(calls[0].eventType).toBe('timeline');
      expect(calls[0].data).toEqual({ value: 42 });
    });
  });
});
