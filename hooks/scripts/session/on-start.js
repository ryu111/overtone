#!/usr/bin/env node
'use strict';
/**
 * SessionStart hook — Banner + 初始化 + Dashboard spawn
 *
 * 觸發：session 開始時
 * 職責：
 *   ✅ 顯示 banner
 *   ✅ 初始化 session 目錄
 *   ✅ emit session:start timeline 事件
 *   ✅ 啟動 Dashboard（Phase 4 實作，目前佔位）
 */

const { mkdirSync } = require('fs');
const pkg = require('../../../.claude-plugin/plugin.json');
const paths = require('../../../scripts/lib/paths');
const timeline = require('../../../scripts/lib/timeline');

const sessionId = process.env.CLAUDE_SESSION_ID || '';

// ── 初始化 session 目錄 ──

if (sessionId) {
  mkdirSync(paths.sessionDir(sessionId), { recursive: true });
  mkdirSync(paths.session.handoffsDir(sessionId), { recursive: true });

  // 記錄 session 啟動
  timeline.emit(sessionId, 'session:start', {
    version: pkg.version,
  });
}

// ── Banner ──

const banner = [
  '',
  `  🎵 Overtone v${pkg.version}`,
  '  ─────────────────────',
  '  有規範的 Vibe',
  sessionId ? `  📂 Session: ${sessionId.slice(0, 8)}...` : '',
  '',
].filter(Boolean).join('\n');

// ── Dashboard spawn（Phase 4 佔位）──
// TODO: Phase 4 啟動 Dashboard server

process.stdout.write(JSON.stringify({
  result: banner,
}));
