'use strict';
/**
 * websocket.test.js — WebSocket 即時通訊模組單元測試
 *
 * 全部使用 mock WebSocket，不需要真實網路連線。
 */

const { describe, it, expect, beforeEach } = require('bun:test');
const { connect, send, listen } = require('../../plugins/overtone/scripts/os/websocket');

// Mock WebSocket 工廠
// 建立可控制的 mock WebSocket，模擬各種行為
function createMockWS(behavior = {}) {
  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0; // CONNECTING
      this._behavior = behavior;

      // 延遲觸發事件（讓 onopen/onmessage/onclose 先被設置）
      setImmediate(() => this._init());
    }

    _init() {
      const { error, closeImmediately, messages = [], closeAfterMs, throwOnSend } = this._behavior;

      if (throwOnSend) {
        // 儲存 throwOnSend 讓 send() 可以拋出
        this._throwOnSend = true;
      }

      if (error) {
        // 立即觸發 error 事件
        if (this.onerror) this.onerror(new Error('mock error'));
        if (this.onclose) this.onclose({ code: 1006 });
        return;
      }

      if (closeImmediately) {
        // 不觸發 open，直接觸發 close
        if (this.onclose) this.onclose({ code: 1000 });
        return;
      }

      // 正常流程：觸發 open
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();

      // 發送 messages
      if (messages.length > 0) {
        let delay = 0;
        for (const msg of messages) {
          const d = typeof msg === 'object' && msg.delay ? msg.delay : 0;
          const data = typeof msg === 'object' && msg.data !== undefined ? msg.data : msg;
          delay += d;
          setTimeout(() => {
            if (this.onmessage) this.onmessage({ data });
          }, delay);
        }

        // 發送完 messages 後關閉（若設定了 closeAfterMessages）
        if (behavior.closeAfterMessages) {
          const totalDelay = messages.reduce((acc, m) => acc + (typeof m === 'object' && m.delay ? m.delay : 0), 0);
          setTimeout(() => {
            this.readyState = 3; // CLOSED
            if (this.onclose) this.onclose({ code: 1000 });
          }, totalDelay + 10);
        }
      }

      // 若設定 closeAfterMs，在指定時間後關閉
      if (closeAfterMs != null) {
        setTimeout(() => {
          this.readyState = 3;
          if (this.onclose) this.onclose({ code: 1000 });
        }, closeAfterMs);
      }
    }

    send(data) {
      if (this._throwOnSend) {
        throw new Error('WebSocket is not open');
      }
      // 若設定了 echoOnSend，回傳 echo
      if (this._behavior.echoOnSend) {
        setTimeout(() => {
          if (this.onmessage) this.onmessage({ data });
        }, 5);
      }
    }

    close() {
      this.readyState = 3;
    }
  }

  return MockWebSocket;
}

// --- Feature 1: connect ---

describe('connect — 建立連線並接收訊息', () => {
  it('Scenario: 正常連線並接收多筆訊息', async () => {
    const MockWS = createMockWS({
      messages: ['hello', 'world'],
      closeAfterMessages: true,
    });

    const result = await connect('ws://localhost:8080', {}, { WebSocket: MockWS });

    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].data).toBe('hello');
    expect(result.messages[1].data).toBe('world');
    expect(typeof result.connectedAt).toBe('string');
    expect(typeof result.disconnectedAt).toBe('string');
  });

  it('Scenario: 連線在 timeout 期間未斷線則自動逾時結束', async () => {
    // 不設置 closeAfterMs，open 後保持連線
    const MockWS = createMockWS({
      messages: [{ data: 'msg1', delay: 0 }],
      // 不設 closeAfterMessages，持續連線直到 timeout
    });

    const result = await connect('ws://localhost:8080', { timeout: 100 }, { WebSocket: MockWS });

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.messages)).toBe(true);
    expect(typeof result.connectedAt).toBe('string');
    expect(typeof result.disconnectedAt).toBe('string');
  });

  it('Scenario: 無效 URL 格式導致連線失敗', async () => {
    const result = await connect('not-a-valid-url');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_URL');
    expect(typeof result.message).toBe('string');
  });

  it('Scenario: 伺服器拒絕連線（closeImmediately）', async () => {
    const MockWS = createMockWS({ closeImmediately: true });

    const result = await connect('ws://localhost:19999', {}, { WebSocket: MockWS });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('CONNECTION_FAILED');
    expect(typeof result.message).toBe('string');
  });

  it('Scenario: 連線逾時（open 事件永遠不觸發）', async () => {
    // 建立一個永遠不觸發任何事件的 MockWS
    class NeverOpenWS {
      constructor() {}
      set onopen(_) {}
      set onmessage(_) {}
      set onclose(_) {}
      set onerror(_) {}
      close() {}
      send() {}
    }

    const result = await connect('ws://localhost:8080', { timeout: 100 }, { WebSocket: NeverOpenWS });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('TIMEOUT');
    expect(typeof result.message).toBe('string');
  });
});

// --- Feature 2: send ---

describe('send — 發送訊息並等待回應', () => {
  it('Scenario: 發送訊息並成功收到伺服器 echo 回應', async () => {
    const MockWS = createMockWS({ echoOnSend: true });

    const result = await send('ws://localhost:8080', 'hello', {}, { WebSocket: MockWS });

    expect(result.ok).toBe(true);
    expect(result.sent).toBe('hello');
    expect(typeof result.sentAt).toBe('string');
    expect(result.response).toBeDefined();
    expect(result.response.data).toBe('hello');
    expect(typeof result.responseAt).toBe('string');
  });

  it('Scenario: 發送成功但等待回應逾時', async () => {
    // open 正常觸發，但不送出任何訊息
    const MockWS = createMockWS({ messages: [] });

    const result = await send('ws://localhost:8080', 'ping', { timeout: 100 }, { WebSocket: MockWS });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('TIMEOUT');
    expect(typeof result.message).toBe('string');
  });

  it('Scenario: 發送訊息失敗（send() 拋出例外）', async () => {
    const MockWS = createMockWS({ throwOnSend: true });

    const result = await send('ws://localhost:8080', 'data', {}, { WebSocket: MockWS });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('SEND_FAILED');
    expect(typeof result.message).toBe('string');
  });

  it('Scenario: 無效 URL 導致 send 失敗', async () => {
    const result = await send('invalid-url', 'hello');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_URL');
    expect(typeof result.message).toBe('string');
  });
});

// --- Feature 3: listen ---

describe('listen — 監聽指定時間的訊息', () => {
  it('Scenario: 監聽期間持續收到訊息（依時間間隔）', async () => {
    // 在 0ms、100ms、200ms 各送一筆訊息，監聽 350ms
    const MockWS = createMockWS({
      messages: [
        { data: 'msg1', delay: 0 },
        { data: 'msg2', delay: 100 },
        { data: 'msg3', delay: 100 },
      ],
    });

    const result = await listen('ws://localhost:8080', { duration: 350 }, { WebSocket: MockWS });

    expect(result.ok).toBe(true);
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(300);
    expect(typeof result.connectedAt).toBe('string');
    expect(typeof result.disconnectedAt).toBe('string');
  });

  it('Scenario: 監聽期間連線提前斷開', async () => {
    // 150ms 後觸發 close
    const MockWS = createMockWS({ closeAfterMs: 150 });

    const result = await listen('ws://localhost:8080', { duration: 5000 }, { WebSocket: MockWS });

    expect(result.ok).toBe(true);
    // 實際持續時間應小於 5000ms
    expect(result.durationMs).toBeLessThan(5000);
    expect(typeof result.connectedAt).toBe('string');
    expect(typeof result.disconnectedAt).toBe('string');
  });

  it('Scenario: 監聽期間未收到任何訊息', async () => {
    const MockWS = createMockWS({ messages: [] });

    const result = await listen('ws://localhost:8080', { duration: 100 }, { WebSocket: MockWS });

    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(90);
    expect(typeof result.connectedAt).toBe('string');
    expect(typeof result.disconnectedAt).toBe('string');
  });

  it('Scenario: 無效 URL 導致 listen 失敗', async () => {
    const result = await listen('bad://url', { duration: 100 });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_URL');
    expect(typeof result.message).toBe('string');
  });
});

// --- Feature 4: CLI 入口 ---

describe('CLI 入口 — 參數驗證', () => {
  const PLUGIN_ROOT = '/Users/sbu/projects/overtone/plugins/overtone';
  const WS_SCRIPT = `${PLUGIN_ROOT}/scripts/os/websocket.js`;

  it('Scenario: 無效子命令 → stderr 包含錯誤訊息 + exit code 非零', async () => {
    const proc = Bun.spawn(['bun', WS_SCRIPT, 'invalid-cmd', 'ws://localhost:8080'], {
      cwd: PLUGIN_ROOT,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('無效的子命令');
  });

  it('Scenario: 缺少 URL 參數 → stderr + exit code 非零', async () => {
    const proc = Bun.spawn(['bun', WS_SCRIPT, 'connect'], {
      cwd: PLUGIN_ROOT,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('缺少 URL');
  });

  it('Scenario: send 缺少 message 參數 → stderr + exit code 非零', async () => {
    const proc = Bun.spawn(['bun', WS_SCRIPT, 'send', 'ws://localhost:8080'], {
      cwd: PLUGIN_ROOT,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('message');
  });
});

// --- Feature 5: 依賴注入（Testability）---

describe('依賴注入（Testability）', () => {
  it('Scenario: 使用 mock WebSocket 取代真實實作', async () => {
    let usedUrl = null;
    class CaptureMockWS {
      constructor(url) {
        usedUrl = url;
        setImmediate(() => {
          if (this.onopen) this.onopen();
          setImmediate(() => {
            if (this.onclose) this.onclose({ code: 1000 });
          });
        });
      }
      set onopen(fn) { this._onopen = fn; }
      get onopen() { return this._onopen; }
      set onmessage(fn) { this._onmessage = fn; }
      get onmessage() { return this._onmessage; }
      set onclose(fn) { this._onclose = fn; }
      get onclose() { return this._onclose; }
      set onerror(fn) { this._onerror = fn; }
      get onerror() { return this._onerror; }
      close() {}
      send() {}
    }

    const result = await connect('ws://mock', {}, { WebSocket: CaptureMockWS });

    expect(usedUrl).toBe('ws://mock');
    expect(result.ok).toBe(true);
    expect(typeof result.connectedAt).toBe('string');
  });

  it('Scenario: mock WebSocket 可模擬訊息序列', async () => {
    const MockWS = createMockWS({
      messages: ['alpha', 'beta', 'gamma'],
      closeAfterMessages: true,
    });

    const result = await listen('ws://mock', { duration: 1000 }, { WebSocket: MockWS });

    expect(result.ok).toBe(true);
    // 訊息序列應與 mock 送出的一致
    const datums = result.messages.map(m => m.data);
    expect(datums).toContain('alpha');
    expect(datums).toContain('beta');
    expect(datums).toContain('gamma');
  });

  it('Scenario: mock WebSocket 可模擬連線失敗', async () => {
    const MockWS = createMockWS({ error: true });

    const result = await connect('ws://mock', {}, { WebSocket: MockWS });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('CONNECTION_FAILED');
    expect(typeof result.message).toBe('string');
  });
});
