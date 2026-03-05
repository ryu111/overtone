'use strict';
/**
 * websocket.js — WebSocket 即時通訊能力
 *
 * 提供 connect、send、listen 三種功能。
 * 支援跨平台（不受 darwin 限制，WebSocket 為通用協議）。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 *
 * 依賴注入：最後一個參數 _deps = { WebSocket } 供測試替換。
 *
 * CLI 入口：
 *   bun scripts/os/websocket.js <connect|send|listen> <url> [message] [--timeout ms] [--duration ms]
 */

// 統一 response 建構工具
function ok(fields) {
  return { ok: true, ...fields };
}

function fail(error, message) {
  return { ok: false, error, message };
}

// URL 格式驗證（ws:// 或 wss:// 開頭）
function isValidWsUrl(url) {
  if (typeof url !== 'string') return false;
  return /^wss?:\/\/.+/.test(url);
}

/**
 * 建立 WebSocket 連線，接收訊息直到斷線或逾時
 * @param {string} url - WebSocket 伺服器 URL
 * @param {object} [opts]
 * @param {number} [opts.timeout=30000] - 連線逾時（毫秒）
 * @param {object} [_deps]
 * @param {Function} [_deps.WebSocket] - WebSocket 建構子，預設使用全域 WebSocket
 * @returns {Promise<{ ok: true, messages: MessageEntry[], connectedAt: string, disconnectedAt: string }
 *                  |{ ok: false, error: string, message: string }>}
 */
async function connect(url, opts = {}, _deps = {}) {
  if (!isValidWsUrl(url)) {
    return fail('INVALID_URL', `無效的 WebSocket URL：${url}`);
  }

  const timeout = opts.timeout ?? 30000;
  const WS = _deps.WebSocket || globalThis.WebSocket;

  return new Promise((resolve) => {
    let ws;
    let connectedAt = null;
    const messages = [];
    let timeoutId = null;
    let settled = false;

    function settle(result) {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(result);
    }

    // 連線逾時計時器（等待 open 事件）
    timeoutId = setTimeout(() => {
      if (connectedAt === null) {
        // open 尚未觸發 → TIMEOUT
        try { ws.close(); } catch (_) {}
        settle(fail('TIMEOUT', `連線逾時（${timeout}ms）：伺服器未回應`));
      } else {
        // open 已觸發，timeout 代表接收逾時 → 正常結束
        const disconnectedAt = new Date().toISOString();
        try { ws.close(); } catch (_) {}
        settle(ok({ messages, connectedAt, disconnectedAt }));
      }
    }, timeout);

    try {
      ws = new WS(url);
    } catch (err) {
      clearTimeout(timeoutId);
      return resolve(fail('CONNECTION_FAILED', `無法建立 WebSocket 連線：${err.message}`));
    }

    ws.onopen = () => {
      connectedAt = new Date().toISOString();
    };

    ws.onmessage = (event) => {
      messages.push({
        data: typeof event.data === 'string' ? event.data : String(event.data),
        receivedAt: new Date().toISOString(),
      });
    };

    ws.onclose = () => {
      if (!settled) {
        const disconnectedAt = new Date().toISOString();
        if (connectedAt === null) {
          // 連線從未建立就關閉 → 失敗
          settle(fail('CONNECTION_FAILED', '連線被拒絕或伺服器不可用'));
        } else {
          settle(ok({ messages, connectedAt, disconnectedAt }));
        }
      }
    };

    ws.onerror = () => {
      if (!settled) {
        if (connectedAt === null) {
          settle(fail('CONNECTION_FAILED', '連線失敗：WebSocket 錯誤'));
        }
        // 若 open 已觸發，error 後通常也會觸發 close，交給 onclose 處理
      }
    };
  });
}

/**
 * 連線到 WebSocket 伺服器，發送訊息並等待第一個回應
 * @param {string} url - WebSocket 伺服器 URL
 * @param {string} message - 要發送的訊息
 * @param {object} [opts]
 * @param {number} [opts.timeout=10000] - 回應逾時（毫秒）
 * @param {object} [_deps]
 * @param {Function} [_deps.WebSocket]
 * @returns {Promise<{ ok: true, sent: string, sentAt: string, response: MessageEntry, responseAt: string }
 *                  |{ ok: false, error: string, message: string }>}
 */
async function send(url, message, opts = {}, _deps = {}) {
  if (!isValidWsUrl(url)) {
    return fail('INVALID_URL', `無效的 WebSocket URL：${url}`);
  }

  const timeout = opts.timeout ?? 10000;
  const WS = _deps.WebSocket || globalThis.WebSocket;

  return new Promise((resolve) => {
    let ws;
    let sentAt = null;
    let timeoutId = null;
    let settled = false;

    function settle(result) {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      try { ws.close(); } catch (_) {}
      resolve(result);
    }

    timeoutId = setTimeout(() => {
      settle(fail('TIMEOUT', `等待回應逾時（${timeout}ms）`));
    }, timeout);

    try {
      ws = new WS(url);
    } catch (err) {
      clearTimeout(timeoutId);
      return resolve(fail('CONNECTION_FAILED', `無法建立 WebSocket 連線：${err.message}`));
    }

    ws.onopen = () => {
      try {
        ws.send(message);
        sentAt = new Date().toISOString();
      } catch (err) {
        settle(fail('SEND_FAILED', `訊息發送失敗：${err.message}`));
      }
    };

    ws.onmessage = (event) => {
      if (!settled) {
        const responseAt = new Date().toISOString();
        const response = {
          data: typeof event.data === 'string' ? event.data : String(event.data),
          receivedAt: responseAt,
        };
        settle(ok({ sent: message, sentAt, response, responseAt }));
      }
    };

    ws.onclose = () => {
      if (!settled) {
        settle(fail('CONNECTION_FAILED', '連線提前關閉，未收到回應'));
      }
    };

    ws.onerror = () => {
      if (!settled && sentAt === null) {
        settle(fail('SEND_FAILED', '連線發生錯誤'));
      }
    };
  });
}

/**
 * 監聽 WebSocket 伺服器的訊息，持續 durationMs 毫秒
 * @param {string} url - WebSocket 伺服器 URL
 * @param {object} [opts]
 * @param {number} [opts.duration=5000] - 監聽時間（毫秒）
 * @param {object} [_deps]
 * @param {Function} [_deps.WebSocket]
 * @returns {Promise<{ ok: true, messages: MessageEntry[], durationMs: number, connectedAt: string, disconnectedAt: string }
 *                  |{ ok: false, error: string, message: string }>}
 */
async function listen(url, opts = {}, _deps = {}) {
  if (!isValidWsUrl(url)) {
    return fail('INVALID_URL', `無效的 WebSocket URL：${url}`);
  }

  const durationMs = opts.duration ?? 5000;
  const WS = _deps.WebSocket || globalThis.WebSocket;

  return new Promise((resolve) => {
    let ws;
    let connectedAt = null;
    const messages = [];
    let durationTimerId = null;
    let settled = false;
    let startTime = null;

    function settle(result) {
      if (settled) return;
      settled = true;
      if (durationTimerId) clearTimeout(durationTimerId);
      try { ws.close(); } catch (_) {}
      resolve(result);
    }

    try {
      ws = new WS(url);
    } catch (err) {
      return resolve(fail('CONNECTION_FAILED', `無法建立 WebSocket 連線：${err.message}`));
    }

    ws.onopen = () => {
      connectedAt = new Date().toISOString();
      startTime = Date.now();

      // 監聽計時器：持續 durationMs 後結束
      durationTimerId = setTimeout(() => {
        const disconnectedAt = new Date().toISOString();
        const actualDuration = Date.now() - startTime;
        settle(ok({ messages, durationMs: actualDuration, connectedAt, disconnectedAt }));
      }, durationMs);
    };

    ws.onmessage = (event) => {
      messages.push({
        data: typeof event.data === 'string' ? event.data : String(event.data),
        receivedAt: new Date().toISOString(),
      });
    };

    ws.onclose = () => {
      if (!settled) {
        const disconnectedAt = new Date().toISOString();
        if (connectedAt === null) {
          settle(fail('CONNECTION_FAILED', '連線失敗'));
        } else {
          const actualDuration = Date.now() - startTime;
          settle(ok({ messages, durationMs: actualDuration, connectedAt, disconnectedAt }));
        }
      }
    };

    ws.onerror = () => {
      if (!settled && connectedAt === null) {
        settle(fail('CONNECTION_FAILED', '連線發生錯誤'));
      }
    };
  });
}

module.exports = { connect, send, listen };

// CLI 入口
if (require.main === module || (process.argv[1] && process.argv[1].endsWith('websocket.js'))) {
  const args = process.argv.slice(2);

  // 解析 --timeout 和 --duration flag
  function parseFlags(args) {
    const flags = {};
    const positional = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--timeout' && i + 1 < args.length) {
        flags.timeout = parseInt(args[++i], 10);
      } else if (args[i] === '--duration' && i + 1 < args.length) {
        flags.duration = parseInt(args[++i], 10);
      } else {
        positional.push(args[i]);
      }
    }
    return { flags, positional };
  }

  const { flags, positional } = parseFlags(args);
  const subcommand = positional[0];
  const url = positional[1];

  async function main() {
    if (!subcommand || !['connect', 'send', 'listen'].includes(subcommand)) {
      process.stderr.write(`錯誤：無效的子命令 "${subcommand || ''}"。\n`);
      process.stderr.write(`用法：websocket.js <connect|send|listen> <url> [message] [--timeout ms] [--duration ms]\n`);
      process.exit(1);
    }

    if (!url) {
      process.stderr.write(`錯誤：缺少 URL 參數。\n`);
      process.stderr.write(`用法：websocket.js ${subcommand} <url> [--timeout ms]\n`);
      process.exit(1);
    }

    if (subcommand === 'send') {
      const message = positional[2];
      if (!message) {
        process.stderr.write(`錯誤：send 子命令需要提供 message 參數。\n`);
        process.stderr.write(`用法：websocket.js send <url> <message> [--timeout ms]\n`);
        process.exit(1);
      }
      const result = await send(url, message, flags);
      process.stdout.write(JSON.stringify(result) + '\n');
    } else if (subcommand === 'connect') {
      const result = await connect(url, flags);
      process.stdout.write(JSON.stringify(result) + '\n');
    } else if (subcommand === 'listen') {
      const result = await listen(url, flags);
      process.stdout.write(JSON.stringify(result) + '\n');
    }
  }

  main().catch((err) => {
    process.stderr.write(`未預期的錯誤：${err.message}\n`);
    process.exit(1);
  });
}
