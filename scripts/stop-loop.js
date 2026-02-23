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

const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const { dirname } = require('path');
const paths = require('./lib/paths');

const sessionId = process.argv[2];

if (!sessionId) {
  console.error('用法：node stop-loop.js <sessionId>');
  process.exit(1);
}

const loopPath = paths.session.loop(sessionId);

// 讀取現有 loop 狀態，不存在時建立預設
let loopState;
try {
  loopState = JSON.parse(readFileSync(loopPath, 'utf8'));
} catch {
  loopState = { iteration: 0, consecutiveErrors: 0, stopped: false };
}

// 標記停止
loopState.stopped = true;
loopState.stoppedAt = new Date().toISOString();

// 寫回
mkdirSync(dirname(loopPath), { recursive: true });
writeFileSync(loopPath, JSON.stringify(loopState, null, 2) + '\n', 'utf8');

console.log('🛑 Loop 已標記為停止。下次回覆結束時將允許退出。');
