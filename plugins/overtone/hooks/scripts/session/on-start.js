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
 *   ✅ 啟動 Dashboard + 開啟瀏覽器
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

// ── Dashboard spawn ──

const dashboardPid = require('../../../scripts/lib/dashboard/pid');
const port = process.env.OVERTONE_PORT || '7777';

if (sessionId && !dashboardPid.isRunning()) {
  try {
    const { spawn: spawnChild } = require('child_process');
    const serverPath = require('path').join(__dirname, '../../../scripts/server.js');
    const child = spawnChild('bun', ['run', serverPath], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, OVERTONE_PORT: port },
    });
    child.unref();
  } catch (err) {
    console.error(`[overtone] Dashboard 啟動失敗: ${err.message}`);
  }
}

// ── Banner ──

const dashboardUrl = sessionId ? `http://localhost:${port}/s/${sessionId}` : null;
const banner = [
  '',
  `  🎵 Overtone v${pkg.version}`,
  '  ─────────────────────',
  '  有規範的 Vibe',
  sessionId ? `  📂 Session: ${sessionId.slice(0, 8)}...` : '',
  dashboardUrl ? `  🖥️ Dashboard: ${dashboardUrl}` : '',
  '',
].filter(Boolean).join('\n');

// 自動開啟瀏覽器（macOS）— spawn+detached+unref 確保不被 hook 進程退出中斷
if (dashboardUrl) {
  try {
    const { spawn: spawnOpen } = require('child_process');
    const openProc = spawnOpen('open', [dashboardUrl], { detached: true, stdio: 'ignore' });
    openProc.unref();
  } catch {}
}

process.stdout.write(JSON.stringify({
  result: banner,
}));
