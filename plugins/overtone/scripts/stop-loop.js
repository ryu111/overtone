#!/usr/bin/env node
'use strict';
/**
 * stop-loop.js — 設定 Loop 為停止狀態
 *
 * 用法：node stop-loop.js <sessionId>
 *
 * 讀取 loop.json，設定 stopped: true，寫回。
 * 下次 Stop hook 觸發時會偵測此旗標並允許退出。
 */

const loop = require('./lib/loop');

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('用法：node stop-loop.js <sessionId>');
  process.exit(1);
}

const loopState = loop.readLoop(sessionId);
loopState.stopped = true;
loopState.stoppedAt = new Date().toISOString();
loop.writeLoop(sessionId, loopState);

console.log('🛑 Loop 已標記為停止。下次回覆結束時將允許退出。');
