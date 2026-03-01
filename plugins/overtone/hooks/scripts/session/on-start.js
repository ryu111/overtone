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
 *   ✅ 啟動 Dashboard（OVERTONE_NO_DASHBOARD=1 可跳過）
 */

const { mkdirSync, appendFileSync } = require('fs');
const path = require('path');
const pkg = require('../../../.claude-plugin/plugin.json');
const paths = require('../../../scripts/lib/paths');
const timeline = require('../../../scripts/lib/timeline');
const specs = require('../../../scripts/lib/specs');
const state = require('../../../scripts/lib/state');
const { safeReadStdin, safeRun, hookError, buildPendingTasksMessage, getSessionId } = require('../../../scripts/lib/hook-utils');
const { effortLevels } = require('../../../scripts/lib/registry');

// session ID 優先從 hook stdin JSON 讀取，環境變數作為 fallback
const input = safeReadStdin();
const sessionId = getSessionId(input);

safeRun(() => {
  // ── 設定 CLAUDE_CODE_EFFORT_LEVEL（透過 CLAUDE_ENV_FILE 機制）──
  // 從 stdin model 欄位取得 main agent model，查表決定適當的 effort level。
  // 若使用者已手動設定 CLAUDE_CODE_EFFORT_LEVEL，則不覆蓋。
  // 若 CLAUDE_ENV_FILE 不存在（環境不支援），靜默跳過。

  try {
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile && !process.env.CLAUDE_CODE_EFFORT_LEVEL) {
      const model = input.model;
      const effortLevel = model ? effortLevels[model] : undefined;
      if (effortLevel) {
        appendFileSync(envFile, `CLAUDE_CODE_EFFORT_LEVEL=${effortLevel}\n`);
      }
    }
  } catch {
    // 靜默跳過，不阻擋 session 啟動
  }

  // ── 初始化 session 目錄 ──

  if (sessionId) {
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // 記錄 session 啟動
    timeline.emit(sessionId, 'session:start', {
      version: pkg.version,
    });
  }

  // ── Dashboard spawn ──

  const dashboardPid = require('../../../scripts/lib/dashboard/pid');
  const port = process.env.OVERTONE_PORT || '7777';

  // OVERTONE_NO_DASHBOARD=1 完全跳過 Dashboard spawn（測試環境使用）
  const skipDashboard = process.env.OVERTONE_NO_DASHBOARD;
  const shouldSpawnDashboard = sessionId
    && !skipDashboard
    && !dashboardPid.isRunning({ port: parseInt(port, 10) });

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
      hookError('on-start', `Dashboard 啟動失敗: ${err.message}`);
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

  let ghStatus;
  try {
    require('child_process').execSync('which gh', { stdio: 'ignore' });
    // gh CLI 已安裝，進一步確認認證狀態
    try {
      require('child_process').execSync('gh auth status', { stdio: 'ignore' });
      ghStatus = '  🐙 gh CLI: 已安裝且已認證';
    } catch {
      ghStatus = '  ⚠️  gh CLI: 已安裝但未認證 — gh auth login';
    }
  } catch {
    ghStatus = null; // 未安裝不顯示（非必要工具）
  }

  // ── Banner ──

  const dashboardUrl = `http://localhost:${port}/`;
  const banner = [
    '',
    `  🎵 Overtone v${pkg.version}`,
    '  ─────────────────────',
    '  裝上 Claude Code，就像有了一個開發團隊。',
    '',
    '  💡 直接輸入你的需求 — 系統自動選擇工作流，委派專職 agent 完成。',
    '',
    sessionId ? `  📂 Session: ${sessionId.slice(0, 8)}...` : null,
    dashboardUrl ? `  🖥️ Dashboard: ${dashboardUrl}` : null,
    agentBrowserStatus,
    ghStatus,
    grayMatterStatus,
    '',
  ].filter(line => line != null).join('\n');

  // ── 未完成任務注入（disk-based TaskList 恢復）──
  // context compact 後 in-memory TaskList 歸零，此處讀取 specs/features/in-progress 的 tasks.md
  // 注入 systemMessage，讓 Main Agent resume 後能重建 TaskList。

  const projectRoot = input.cwd || process.env.CLAUDE_PROJECT_ROOT || process.cwd();

  // featureName 同步：確保 workflow.json 與 active feature 同步（on-stop.js 自動歸檔閉環）
  try {
    const activeFeature = specs.getActiveFeature(projectRoot);
    if (activeFeature && sessionId) {
      const ws = state.readState(sessionId);
      if (ws && !ws.featureName) {
        state.setFeatureName(sessionId, activeFeature.name);
      }
    }
  } catch {
    // 忽略，不阻擋 session 啟動
  }

  // 組裝未完成任務訊息（on-start 專用標頭，標示「上次 session 中斷」）
  const pendingTasksMsg = buildPendingTasksMessage(projectRoot, {
    header: '未完成任務（上次 session 中斷）',
  });

  const output = { result: banner };
  if (pendingTasksMsg) {
    output.systemMessage = pendingTasksMsg;
  }

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}, { result: '' });
