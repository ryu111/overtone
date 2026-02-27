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

const { mkdirSync, readFileSync } = require('fs');
const path = require('path');
const pkg = require('../../../.claude-plugin/plugin.json');
const paths = require('../../../scripts/lib/paths');
const timeline = require('../../../scripts/lib/timeline');
const specs = require('../../../scripts/lib/specs');
const state = require('../../../scripts/lib/state');

// session ID 優先從 hook stdin JSON 讀取，環境變數作為 fallback
let input = {};
try { input = JSON.parse(readFileSync('/dev/stdin', 'utf8')); } catch { /* 無 stdin 時靜默 */ }
const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || '';

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

// 記錄 Dashboard 是否為首次啟動，用於決定是否開啟瀏覽器
const shouldSpawnDashboard = sessionId && !dashboardPid.isRunning();

if (shouldSpawnDashboard) {
  try {
    const { spawn: spawnChild } = require('child_process');
    const serverPath = path.join(__dirname, '../../../scripts/server.js');
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

// ── 依賴狀態檢查 ──

let agentBrowserStatus;
try {
  require('child_process').execSync('which agent-browser', { stdio: 'ignore' });
  agentBrowserStatus = '  🌐 agent-browser: 已安裝';
} catch {
  agentBrowserStatus = '  ⚠️  agent-browser 未安裝 — npm i -g agent-browser && agent-browser install';
}

let grayMatterStatus;
try {
  require.resolve('gray-matter', { paths: [path.join(__dirname, '../../../')] });
  grayMatterStatus = null; // 已安裝不顯示
} catch {
  grayMatterStatus = '  ⚠️  gray-matter 未安裝 — cd plugins/overtone && bun add gray-matter';
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
  agentBrowserStatus,
  grayMatterStatus,
  '',
].filter(Boolean).join('\n');

// 自動開啟瀏覽器（macOS）— 只在 Dashboard 首次啟動時開啟，避免每個 session 都開新標籤
// OVERTONE_NO_BROWSER=1 可跳過（測試環境使用）
if (shouldSpawnDashboard && dashboardUrl && !process.env.OVERTONE_NO_BROWSER) {
  try {
    const { spawn: spawnOpen } = require('child_process');
    const openProc = spawnOpen('open', [dashboardUrl], { detached: true, stdio: 'ignore' });
    openProc.unref();
  } catch {}
}

// ── 未完成任務注入（disk-based TaskList 恢復）──
// context compact 後 in-memory TaskList 歸零，此處讀取 specs/features/in-progress 的 tasks.md
// 注入 systemMessage，讓 Main Agent resume 後能重建 TaskList。

let pendingTasksMsg = null;
const projectRoot = input.cwd || process.env.CLAUDE_PROJECT_ROOT || process.cwd();
try {
  const activeFeature = specs.getActiveFeature(projectRoot);
  if (activeFeature) {
    // 自動補寫 featureName：確保 workflow.json 與 active feature 同步
    // 讓 on-stop.js 的自動歸檔閉環（featureName 存在才觸發 archiveFeature）
    if (sessionId) {
      const ws = state.readState(sessionId);
      if (ws && !ws.featureName) {
        state.setFeatureName(sessionId, activeFeature.name);
      }
    }
    const checkboxes = activeFeature.tasks;
    if (checkboxes && !checkboxes.allChecked && checkboxes.total > 0) {
      const unchecked = checkboxes.unchecked || [];
      const lines = [
        `📋 **未完成任務（上次 session 中斷）**`,
        `Feature：${activeFeature.name}（${checkboxes.checked}/${checkboxes.total} 完成）`,
        ...unchecked.slice(0, 5).map(t => `- [ ] ${t}`),
      ];
      if (unchecked.length > 5) {
        lines.push(`... 還有 ${unchecked.length - 5} 個`);
      }
      lines.push(`→ 請使用 TaskCreate 重建以上任務的 TaskList，然後繼續執行。`);
      pendingTasksMsg = lines.join('\n');
    }
  }
} catch {
  // 忽略，不阻擋 session 啟動
}

const output = { result: banner };
if (pendingTasksMsg) {
  output.systemMessage = pendingTasksMsg;
}

process.stdout.write(JSON.stringify(output));
