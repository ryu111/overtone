'use strict';
/**
 * session-start-handler.js — SessionStart hook 業務邏輯模組
 *
 * 從 on-start.js 提取的純業務邏輯，供直接 require 測試（Humble Object 模式）。
 *
 * 職責：
 *   ✅ 設定 CLAUDE_CODE_EFFORT_LEVEL（透過 CLAUDE_ENV_FILE 機制）
 *   ✅ Status Line 自動設定（寫入 wrapper script + settings.json）
 *   ✅ 初始化 session 目錄 + 狀態自癒（sanitize）
 *   ✅ 掃描式歸檔（specs-archive-scanner）
 *   ✅ 全域觀察載入
 *   ✅ 效能基線 / 品質評分 / 失敗模式摘要載入
 *   ✅ 執行佇列載入
 *   ✅ 組裝並回傳 output 物件（banner + systemMessage）
 *
 * 不負責：
 *   ❌ stdin 解析（由 hook 層負責）
 *   ❌ process.stdout.write / process.exit（由 hook 層負責）
 *   ❌ hookTimer 建立（由 hook 層建立後傳入）
 */

const { mkdirSync, appendFileSync, writeFileSync, readFileSync, chmodSync } = require('fs');
const path = require('path');
const os = require('os');

// plugin.json 路徑：支援兩種佈署格式
//   開發環境：plugins/overtone/.claude-plugin/plugin.json
//   全域安裝：~/.claude/plugin.json
const { existsSync: _existsSync } = require('fs');
const _pluginJsonPaths = [
  path.resolve(__dirname, '../../.claude-plugin/plugin.json'),  // 開發環境（plugins/overtone/）
  path.resolve(__dirname, '../../plugin.json'),                  // 全域安裝（~/.claude/）
];
const _pluginJsonPath = _pluginJsonPaths.find(_existsSync) || _pluginJsonPaths[0];
const pkg = require(_pluginJsonPath);
const paths = require('./paths');
const timeline = require('./timeline');
const { syncFeatureName } = require('./feature-sync');
const state = require('./state');
const { hookError, buildPendingTasksMessage } = require('./hook-utils');
const { effortLevels, stages, workflows, hookEvents, timelineEvents, parallelGroupDefs, journalDefaults } = require('./registry');

// ────────────────────────────────────────────────────────────────────────────
// 純函數：buildBanner
// ────────────────────────────────────────────────────────────────────────────

/**
 * 組裝 banner 字串
 * @param {string} version - 版本號
 * @param {string|null} sessionId - session ID
 * @param {number|string|null} port - Dashboard port（null 時不顯示）
 * @param {object} deps - 依賴狀態 { agentBrowserStatus, ghStatus, grayMatterStatus }
 * @returns {string} banner 字串
 */
function buildBanner(version, sessionId, port, deps) {
  const { agentBrowserStatus = null, ghStatus = null, grayMatterStatus = null } = deps || {};
  const dashboardUrl = port ? `http://localhost:${port}/` : null;
  return [
    '',
    `  🎵 Overtone v${version}`,
    '  ─────────────────────',
    '  裝上 Claude Code，就像有了一個開發團隊。',
    '',
    '  💡 直接輸入你的需求 — 系統自動選擇工作流，委派專職 agent 完成。',
    '',
    sessionId ? `  📂 Session: ${sessionId.slice(0, 8)}...` : null,
    dashboardUrl ? `  🖥️ Dashboard: ${dashboardUrl}` : null,
    agentBrowserStatus || null,
    ghStatus || null,
    grayMatterStatus || null,
    '',
  ].filter(line => line != null).join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// 純函數：buildPluginContext
// ────────────────────────────────────────────────────────────────────────────

/**
 * 從 registry.js 動態計算 plugin 上下文，供 SessionStart systemMessage 注入。
 * 讓每個 session 都能感知目前的 plugin 版本、元件數量和核心規範。
 *
 * @returns {string|null} 格式化的 plugin context 字串，失敗時回傳 null
 */
function buildPluginContext() {
  try {
    // 動態計算 Agent 清單（從 stages 去重取 agent 欄位）
    const agentSet = new Set();
    for (const stageDef of Object.values(stages)) {
      if (stageDef.agent) agentSet.add(stageDef.agent);
    }
    const agentList = [...agentSet].sort();
    const agentCount = agentList.length;

    // Stage 數量
    const stageCount = Object.keys(stages).length;

    // Workflow 模板清單（常用的放前面）
    const workflowCount = Object.keys(workflows).length;
    const commonWorkflows = ['single', 'quick', 'standard', 'full', 'debug', 'tdd']
      .filter(k => workflows[k])
      .map(k => `${k}（${workflows[k].label}）`)
      .join('、');

    // Timeline events 數量
    const timelineEventCount = Object.keys(timelineEvents).length;

    // Hook events 清單
    const hookEventList = hookEvents.join('、');

    // 並行群組定義
    const parallelGroupLines = Object.entries(parallelGroupDefs)
      .map(([name, members]) => `  - ${name}：${members.join(' + ')}`)
      .join('\n');

    return [
      `## Overtone Plugin Context（v${pkg.version}）`,
      '',
      `**元件概覽**：${agentCount} agents、${stageCount} stages、${workflowCount} workflow 模板、${timelineEventCount} timeline events`,
      '',
      `**Agents（${agentCount}）**：${agentList.join('、')}`,
      '',
      `**常用 Workflow**：${commonWorkflows}`,
      '',
      `**Hook Events**：${hookEventList}`,
      '',
      `**並行群組**：`,
      parallelGroupLines,
      '',
      '**核心規範**：',
      '- registry.js 是 SoT — 所有 stage/agent/workflow/event 映射從此 import，禁止硬編碼',
      '- Handoff 格式：Context → Findings → Files Modified → Open Questions',
      '- Hook 薄殼化架構：hook 本體 ~29 行，業務邏輯在 scripts/lib/*-handler.js',
      '- 元件閉環：新增/修改 Skill/Agent/Hook 三者依賴必須同步更新',
      '- updatedInput 是 REPLACE 語意：必須 { ...toolInput, prompt: newPrompt } 保留所有欄位',
      '- 不做向後相容：舊 API 直接改成新的，沒有地方用到直接刪除',
      '',
      '**目錄結構**：~/.claude/{agents,skills,commands,hooks,scripts/lib,web}（全域元件），專案內 tests/（測試），docs/（文件）',
      '',
      '**常用指令**：`bun scripts/test-parallel.js`（測試）、`bun scripts/validate-agents.js`（驗證）、`bun scripts/manage-component.js`（元件管理）',
    ].join('\n');
  } catch {
    // 失敗時靜默跳過，不阻擋 session 啟動
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 純函數：buildStartOutput
// ────────────────────────────────────────────────────────────────────────────

/**
 * 組裝 SessionStart hook 的輸出物件（result + 可選 systemMessage）
 * @param {object} _input - stdin 解析後的物件（保留相容性，目前未使用）
 * @param {object} options - 選項
 * @param {string} options.banner - result 欄位的 banner 字串
 * @param {string[]} options.msgs - 需要注入的 systemMessage 字串陣列（falsy 值自動過濾）
 * @returns {{ result: string, systemMessage?: string }}
 */
function buildStartOutput(_input, options) {
  const { banner = '', msgs = [] } = options || {};
  const validMsgs = (msgs || []).filter(Boolean);
  const output = { result: banner };
  if (validMsgs.length > 0) {
    output.systemMessage = validMsgs.join('\n\n');
  }
  return output;
}

// ────────────────────────────────────────────────────────────────────────────
// 主要 handler
// ────────────────────────────────────────────────────────────────────────────

/**
 * 執行 SessionStart 的完整業務邏輯
 *
 * @param {object} input - stdin 解析後的物件（含 session_id、model、cwd 等欄位）
 * @param {string|null} sessionId - session ID（已從 input 提取）
 * @param {object} [hookTimer] - hook-timing timer 實例（可選）
 * @returns {{ result: string, systemMessage?: string }} hook 輸出物件
 */
function handleSessionStart(input, sessionId, hookTimer) {

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
    const claudeDir = path.join(os.homedir(), '.claude');
    const wrapperPath = path.join(claudeDir, 'statusline.sh');
    const pluginRoot = path.resolve(__dirname, '../..');
    const statuslineScript = path.join(pluginRoot, 'scripts', 'statusline.js');

    // wrapper：委派給 plugin 的 statusline.js
    writeFileSync(wrapperPath, `#!/bin/bash\nexec node "${statuslineScript}"\n`);
    chmodSync(wrapperPath, 0o755);

    // settings.json：只在沒有 statusLine 時新增，不覆蓋既有設定
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

    // 清理上一個 session 可能遺留的不一致狀態
    try {
      const sanitizeResult = state.sanitize(sessionId);
      if (sanitizeResult && sanitizeResult.fixed.length > 0) {
        hookError('on-session-start', `自動修復 ${sanitizeResult.fixed.length} 項狀態不一致`);
      }
    } catch { /* 靜默，不阻擋 session 啟動 */ }

    // 記錄 session 啟動
    timeline.emit(sessionId, 'session:start', {
      version: pkg.version,
    });
  }

  // ── 取得 projectRoot ──

  const projectRoot = input.cwd || process.env.CLAUDE_PROJECT_ROOT || process.cwd();

  // ── 掃描式歸檔（自癒）──
  // 清理上一個 session 遺留的已完成 feature（checkbox 全勾選但未歸檔）

  try {
    const specsArchiveScanner = require('./specs-archive-scanner');
    specsArchiveScanner.scanAndArchive(projectRoot, sessionId, { source: 'on-start' });
  } catch {
    // 掃描歸檔失敗不阻擋 session 啟動
  }

  // ── Dashboard spawn ──

  const dashboardPid = require('./dashboard/pid');
  const port = process.env.OVERTONE_PORT || '7777';

  // OVERTONE_NO_DASHBOARD=1 完全跳過 Dashboard spawn（測試環境使用）
  const skipDashboard = process.env.OVERTONE_NO_DASHBOARD;
  const shouldSpawnDashboard = sessionId
    && !skipDashboard
    && !dashboardPid.isRunning({ port: parseInt(port, 10) });

  if (shouldSpawnDashboard) {
    try {
      const { spawn: spawnChild } = require('child_process');
      const serverPath = path.join(__dirname, '../../scripts/server.js');
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
    require.resolve('gray-matter', { paths: [path.join(__dirname, '../../')] });
    grayMatterStatus = null; // 已安裝不顯示
  } catch {
    grayMatterStatus = '  ⚠️  gray-matter 未安裝 — cd ~/.claude && bun add gray-matter';
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

  const banner = buildBanner(pkg.version, sessionId, port, {
    agentBrowserStatus,
    ghStatus,
    grayMatterStatus,
  });

  // ── featureName 同步 ──
  // 確保 workflow.json 與 active feature 同步（on-stop.js 自動歸檔閉環）

  syncFeatureName(projectRoot, sessionId);

  // ── 未完成任務注入（disk-based TaskList 恢復）──
  // context compact 後 in-memory TaskList 歸零，此處讀取 specs/features/in-progress 的 tasks.md
  // 注入 systemMessage，讓 Main Agent resume 後能重建 TaskList。

  const pendingTasksMsg = buildPendingTasksMessage(projectRoot, {
    header: '未完成任務（上次 session 中斷）',
  });

  // ── 全域觀察載入 ──
  // 從全域 store 載入高信心觀察，注入 systemMessage 提供跨 session 知識連續性

  let globalObservationsMsg = null;
  try {
    const globalInstinct = require('./knowledge/global-instinct');
    const { globalInstinctDefaults } = require('./registry');
    const topObs = globalInstinct.queryGlobal(projectRoot, {
      limit: globalInstinctDefaults.loadTopN,
      excludeTypes: ['intent_journal'],
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

      // ── 時間序列學習：記錄本 session 注入的觀察 ID ──
      // 供 session 結束時比對品質結果，反向更新觀察 confidence

      try {
        if (sessionId) {
          const appliedIds = topObs.map(o => o.id).filter(Boolean);
          if (appliedIds.length > 0) {
            state.updateStateAtomic(sessionId, (s) => ({ ...s, appliedObservationIds: appliedIds }));
          }
        }
      } catch {
        // 靜默跳過，不阻擋 session 啟動
      }
    }
  } catch {
    // 全域觀察載入失敗不阻擋 session 啟動，靜默跳過
  }

  // ── 效能基線摘要載入 ──
  // 顯示歷史工作流效能基線，提供「系統是否在進步」的量化參考

  let baselineSummaryMsg = null;
  try {
    const baselineTracker = require('./baseline-tracker');
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
    const scoreEngine = require('./score-engine');
    const summary = scoreEngine.formatScoreSummary(projectRoot);
    if (summary) {
      scoreSummaryMsg = '## 品質評分\n\n' + summary;
    }
  } catch {
    // 品質評分載入失敗不阻擋 session 啟動
  }

  // ── 失敗模式摘要載入 ──
  // 顯示跨 session 失敗模式聚合，提供「哪個 stage/agent 最常失敗」的量化參考

  let failureSummaryMsg = null;
  try {
    const failureTracker = require('./failure-tracker');
    const summary = failureTracker.formatFailureSummary(projectRoot);
    if (summary) {
      failureSummaryMsg = '## 失敗模式\n\n' + summary;
    }
  } catch {
    // 失敗模式載入失敗不阻擋 session 啟動
  }

  // ── 執行佇列載入 ──
  // PM Discovery 確認的任務序列，注入 systemMessage 確保連續執行

  let queueMsg = null;
  try {
    const executionQueue = require('./execution-queue');
    const summary = executionQueue.formatQueueSummary(projectRoot);
    if (summary) {
      queueMsg = summary;
    }
  } catch {
    // 佇列載入失敗不阻擋 session 啟動
  }

  // ── 最近常做的事（intent_journal 摘要）──
  // 從全域 store 載入近期成功 prompt，提供使用者意圖模式提示

  let recentIntentsMsg = null;
  try {
    const globalInstinct = require('./knowledge/global-instinct');
    const journals = globalInstinct.queryGlobal(projectRoot, {
      type: 'intent_journal',
      limit: journalDefaults.loadTopN,
    });
    const passJournals = journals
      .filter(j => j.sessionResult === journalDefaults.minResultForGlobal)
      .sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''))
      .slice(0, journalDefaults.loadTopN);

    if (passJournals.length > 0) {
      const lines = passJournals.map(j =>
        `- [${j.workflowType || 'unknown'}] ${j.trigger.slice(0, 60)}${j.trigger.length > 60 ? '...' : ''}`
      );
      recentIntentsMsg = ['## 最近常做的事', '', ...lines].join('\n');
    }
  } catch {
    // 靜默失敗，不阻擋 session 啟動
  }

  // ── Plugin context 注入 ──
  // 動態計算 plugin 上下文（版本、元件數量、核心規範），讓 Main Agent 感知當前 plugin 狀態

  const pluginContextMsg = buildPluginContext();

  // ── pendingAction 恢復 ──
  // 結構化待執行動作（reject/fail 後的修復指令），確保跨 session 不遺失
  let pendingActionMsg = null;
  const currentState = sessionId ? state.readState(sessionId) : null;
  if (currentState && currentState.pendingAction) {
    const pa = currentState.pendingAction;
    const lines = ['## ⚠️ 待執行動作（上次 session 未完成）', ''];
    if (pa.type === 'fix-reject') {
      lines.push(`**REVIEW 被拒絕**（${pa.count}/3）— 階段：${pa.stage}`);
      if (pa.reason) lines.push(`拒絕原因：${pa.reason}`);
      lines.push('');
      lines.push('📋 MUST：委派 developer agent（帶入拒絕原因）修復 → 完成後委派 code-reviewer 再審');
    } else if (pa.type === 'fix-fail') {
      lines.push(`**${pa.stage} 失敗**（${pa.count}/3）`);
      if (pa.reason) lines.push(`失敗原因：${pa.reason}`);
      lines.push('');
      lines.push('📋 MUST：委派 debugger agent 分析根因 → developer 修復 → tester 驗證');
    }
    pendingActionMsg = lines.join('\n');
  }

  // ── 組裝輸出 ──

  const output = buildStartOutput(input, {
    banner,
    msgs: [pluginContextMsg, pendingActionMsg, pendingTasksMsg, globalObservationsMsg, recentIntentsMsg, baselineSummaryMsg, scoreSummaryMsg, failureSummaryMsg, queueMsg].filter(Boolean),
  });

  // ── hook:timing — 記錄 SessionStart 執行耗時 ──

  if (hookTimer) {
    hookTimer.emit(sessionId, 'on-start', 'SessionStart');
  }

  return output;
}

// ── 匯出 ──
module.exports = { handleSessionStart, buildBanner, buildStartOutput, buildPluginContext };
