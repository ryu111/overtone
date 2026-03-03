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

const { mkdirSync, appendFileSync, writeFileSync, readFileSync, chmodSync } = require('fs');
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

  // ── Status Line 自動設定 ──
  // 寫入 wrapper script（~/.claude/statusline.sh）並確保 settings.json 有 statusLine 設定
  try {
    const claudeDir = path.join(require('os').homedir(), '.claude');
    const wrapperPath = path.join(claudeDir, 'statusline.sh');
    const pluginRoot = path.resolve(__dirname, '../../..');
    const statuslineScript = path.join(pluginRoot, 'scripts', 'statusline.js');

    // wrapper: 委派給 plugin 的 statusline.js
    writeFileSync(wrapperPath, `#!/bin/bash\nexec node "${statuslineScript}"\n`);
    chmodSync(wrapperPath, 0o755);

    // settings.json: 只在沒有 statusLine 時新增，不覆蓋既有設定
    const settingsPath = path.join(claudeDir, 'settings.json');
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      if (!settings.statusLine) {
        settings.statusLine = {
          type: 'command',
          command: '~/.claude/statusline.sh',
          padding: 0,
        };
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      }
    } catch {
      // settings.json 讀取失敗 → 跳過
    }
  } catch {
    // Status Line 設定失敗不阻擋 session 啟動
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

  // ── 全域觀察載入 ──
  // 從全域 store 載入高信心觀察，注入 systemMessage 提供跨 session 知識連續性

  let globalObservationsMsg = null;
  try {
    const globalInstinct = require('../../../scripts/lib/global-instinct');
    const { globalInstinctDefaults } = require('../../../scripts/lib/registry');
    const topObs = globalInstinct.queryGlobal(projectRoot, {
      limit: globalInstinctDefaults.loadTopN,
    });

    if (topObs.length > 0) {
      const lines = topObs.map(o =>
        `- [${o.tag}/${o.type}] ${o.action}（信心 ${o.confidence}）`
      );
      globalObservationsMsg = [
        '## 跨 Session 知識記憶',
        '',
        '以下是從過去 session 累積的高信心觀察，供本 session 參考：',
        '',
        ...lines,
      ].join('\n');
    }
  } catch {
    // 全域觀察載入失敗不阻擋 session 啟動，靜默跳過
  }

  // ── 效能基線摘要載入 ──
  // 顯示歷史工作流效能基線，提供「系統是否在進步」的量化參考

  let baselineSummaryMsg = null;
  try {
    const baselineTracker = require('../../../scripts/lib/baseline-tracker');
    const summary = baselineTracker.formatBaselineSummary(projectRoot);
    if (summary) {
      baselineSummaryMsg = '## 效能基線\n\n' + summary;
    }
  } catch {
    // 基線載入失敗不阻擋 session 啟動
  }

  // ── 品質評分摘要載入 ──
  // 顯示歷史 stage 品質評分摘要，提供「輸出品質是否在提升」的量化參考

  let scoreSummaryMsg = null;
  try {
    const scoreEngine = require('../../../scripts/lib/score-engine');
    const summary = scoreEngine.formatScoreSummary(projectRoot);
    if (summary) {
      scoreSummaryMsg = '## 品質評分\n\n' + summary;
    }
  } catch {
    // 品質評分載入失敗不阻擋 session 啟動
  }

  // ── 執行佇列載入 ──
  // PM Discovery 確認的任務序列，注入 systemMessage 確保連續執行

  let queueMsg = null;
  try {
    const executionQueue = require('../../../scripts/lib/execution-queue');
    const summary = executionQueue.formatQueueSummary(projectRoot);
    if (summary) {
      queueMsg = summary;
    }
  } catch {
    // 佇列載入失敗不阻擋 session 啟動
  }

  const output = { result: banner };
  if (pendingTasksMsg) {
    output.systemMessage = pendingTasksMsg;
  }
  if (globalObservationsMsg) {
    if (output.systemMessage) {
      output.systemMessage += '\n\n' + globalObservationsMsg;
    } else {
      output.systemMessage = globalObservationsMsg;
    }
  }
  if (baselineSummaryMsg) {
    if (output.systemMessage) {
      output.systemMessage += '\n\n' + baselineSummaryMsg;
    } else {
      output.systemMessage = baselineSummaryMsg;
    }
  }
  if (scoreSummaryMsg) {
    if (output.systemMessage) {
      output.systemMessage += '\n\n' + scoreSummaryMsg;
    } else {
      output.systemMessage = scoreSummaryMsg;
    }
  }
  if (queueMsg) {
    if (output.systemMessage) {
      output.systemMessage += '\n\n' + queueMsg;
    } else {
      output.systemMessage = queueMsg;
    }
  }

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}, { result: '' });
