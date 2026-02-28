#!/usr/bin/env node
'use strict';
/**
 * UserPromptSubmit hook — 注入 systemMessage 指向 /ot:auto
 *
 * 觸發：每次使用者送出 prompt
 * 作用：在 system context 注入工作流選擇器指引
 * 例外：使用者已手動使用 /ot: 命令時不注入
 * 覆寫：prompt 含 [workflow:xxx] 時直接指定 workflow，跳過 /ot:auto
 */

const state = require('../../../scripts/lib/state');
const instinct = require('../../../scripts/lib/instinct');
const { workflows } = require('../../../scripts/lib/registry');
const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');

safeRun(() => {
  // 從 stdin 讀取 hook input
  const input = safeReadStdin();
  // Claude Code 真實 hook 傳 `prompt`，手動測試或舊版傳 `user_prompt`，兩者都支援
  const userPrompt = (input.prompt || input.user_prompt || '').trim();

  // 取得 session ID 和 projectRoot
  // session ID 優先從 hook input JSON（stdin）讀取，環境變數作為 fallback
  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || '';
  const projectRoot = input.cwd || process.cwd();

  // 將 sessionId 寫入共享文件，讓 Skill 中的 Bash 工具呼叫（如 init-workflow.js）能讀到
  // Bash 工具環境沒有 CLAUDE_SESSION_ID 環境變數，需靠此橋接
  if (sessionId) {
    try {
      const { writeFileSync, mkdirSync } = require('fs');
      const { CURRENT_SESSION_FILE, OVERTONE_HOME } = require('../../../scripts/lib/paths');
      mkdirSync(OVERTONE_HOME, { recursive: true });
      writeFileSync(CURRENT_SESSION_FILE, sessionId, 'utf8');
    } catch {
      // 靜默失敗，不阻擋主流程
    }
  }

  // 如果使用者已手動輸入 /ot: 命令，不覆蓋
  if (userPrompt.startsWith('/ot:')) {
    process.stdout.write(JSON.stringify({ additionalContext: '' }));
    process.exit(0);
  }

  // 解析 [workflow:xxx] 覆寫語法
  const workflowOverrideMatch = userPrompt.match(/\[workflow:([a-z0-9_-]+)\]/i);
  const workflowOverride = workflowOverrideMatch ? workflowOverrideMatch[1].toLowerCase() : null;

  // 驗證覆寫的 workflow key 是否合法（若不合法則忽略，回到正常流程）
  const validWorkflowOverride = workflowOverride && workflows[workflowOverride] ? workflowOverride : null;

  // 如果已有進行中的 workflow，提供狀態摘要而非重新觸發 /ot:auto
  const currentState = sessionId ? state.readState(sessionId) : null;

  // 讀取活躍 feature（靜默失敗）
  let activeFeatureContext = '';
  try {
    const specsLib = require('../../../scripts/lib/specs');
    const active = specsLib.getActiveFeature(projectRoot);
    if (active) {
      const checked = active.tasks ? active.tasks.checked : 0;
      const total = active.tasks ? active.tasks.total : 0;
      const taskInfo = total > 0 ? `（${checked}/${total} tasks 完成）` : '';
      activeFeatureContext = `📂 活躍 Feature：${active.name}${taskInfo}（specs/features/in-progress/${active.name}/）`;
    }
  } catch {
    // 靜默忽略
  }

  // ── workflow_routing 觀察記錄 ──
  // 當已有進行中的 workflow 時，記錄使用者 prompt 和 workflow 類型的對應關係
  if (currentState && currentState.workflowType && sessionId) {
    try {
      const routingTrigger = userPrompt.slice(0, 80) || '(empty prompt)';
      const routingAction = `工作流選擇：${currentState.workflowType}`;
      instinct.emit(
        sessionId,
        'workflow_routing',
        routingTrigger,
        routingAction,
        `wf-${currentState.workflowType}`
      );
    } catch {
      // 觀察失敗不影響主流程
    }
  }

  let systemMessage;

  if (validWorkflowOverride) {
    // 使用者指定了 workflow 覆寫 → 直接告知使用指定 workflow
    const workflowDef = workflows[validWorkflowOverride];
    systemMessage = [
      `[Overtone] 使用者指定了 workflow：${validWorkflowOverride}（${workflowDef.label}）。`,
      `請直接執行此 workflow，不需要執行 /ot:auto 判斷。`,
      `讀取對應的 workflow skill：/ot:${validWorkflowOverride} 取得完整執行指引。`,
      `⛔ MUST 依照 workflow skill 指引委派 agent，不要自己寫碼。`,
      `📊 初始化後、委派第一個 agent 前，MUST 使用 TaskCreate 建立 pipeline 進度追蹤。`,
    ].join('\n');
  } else if (currentState && currentState.currentStage) {
    const { currentStage, stages, workflowType, failCount, rejectCount } = currentState;
    const stageStatus = Object.entries(stages)
      .map(([k, v]) => {
        const icon = v.status === 'completed' ? '✅' : v.status === 'active' ? '⏳' : '⬜';
        return `${icon} ${k}`;
      })
      .join(' → ');

    systemMessage = [
      `[Overtone] 工作流進行中：${workflowType}`,
      `進度：${stageStatus}`,
      `目前階段：${currentStage}`,
      failCount > 0 ? `失敗次數：${failCount}/3` : '',
      rejectCount > 0 ? `拒絕次數：${rejectCount}/3` : '',
      activeFeatureContext || '',
      '請依照目前階段繼續執行。如需查看工作流指引，請使用 /ot:auto。',
    ].filter(Boolean).join('\n');
  } else {
    // 無進行中 workflow → 注入 /ot:auto 指引
    systemMessage = [
      '[Overtone] 請先閱讀 /ot:auto 工作流選擇器來決定最適合的工作流。',
      '根據使用者需求自動選擇：single/quick/standard/full/secure/tdd/debug/refactor 等 12 種模板。',
      '⛔ 選好工作流後，MUST 依照 workflow skill 指引委派 agent，不要自己寫碼。',
      '📊 初始化後、委派第一個 agent 前，MUST 使用 TaskCreate 建立 pipeline 進度追蹤。',
      activeFeatureContext || '',
    ].filter(Boolean).join('\n');
  }

  process.stdout.write(JSON.stringify({ additionalContext: systemMessage }));
  process.exit(0);
}, { additionalContext: '' });
