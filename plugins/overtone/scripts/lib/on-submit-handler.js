'use strict';
/**
 * on-submit-handler.js — UserPromptSubmit 業務邏輯 handler
 *
 * 從 on-submit.js hook 提取的純業務邏輯，供薄殼 hook 呼叫。
 * 不呼叫 process.exit() 或 process.stdout.write()，回傳結構化結果。
 */

const state = require('./state');
const instinct = require('./knowledge/instinct');
const { workflows, journalDefaults } = require('./registry');
const { getSessionId } = require('./hook-utils');

/**
 * 處理 UserPromptSubmit 事件
 * @param {object} input - hook stdin 解析後的物件
 * @returns {{ systemMessage?: string, result: string }}
 */
function handleOnSubmit(input) {
  // Claude Code 真實 hook 傳 `prompt`，手動測試或舊版傳 `user_prompt`，兩者都支援
  const userPrompt = (input.prompt || input.user_prompt || '').trim();

  // 取得 session ID 和 projectRoot
  const sessionId = getSessionId(input);
  const projectRoot = input.cwd || process.cwd();

  // 將 sessionId 寫入共享文件，讓 Skill 中的 Bash 工具呼叫（如 init-workflow.js）能讀到
  // Bash 工具環境沒有 CLAUDE_SESSION_ID 環境變數，需靠此橋接
  if (sessionId) {
    try {
      const { writeFileSync, mkdirSync } = require('fs');
      const { CURRENT_SESSION_FILE, OVERTONE_HOME } = require('./paths');
      mkdirSync(OVERTONE_HOME, { recursive: true });
      writeFileSync(CURRENT_SESSION_FILE, sessionId, 'utf8');
    } catch {
      // 靜默失敗，不阻擋主流程
    }
  }

  // 如果使用者已手動輸入 /ot: 命令，不覆蓋
  if (userPrompt.startsWith('/ot:')) {
    return { result: '' };
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
    const specsLib = require('./specs');
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

  // ── intent_journal 記錄 ──
  // 每次 UserPromptSubmit 記錄 prompt 原文，供 session 結束時配對結果
  if (sessionId) {
    try {
      const fullPrompt = userPrompt.slice(0, journalDefaults.maxPromptLength);
      const workflowCtx = currentState?.workflowType
        ? `工作流：${currentState.workflowType}`
        : '無進行中工作流';
      const journalTag = `journal-${Date.now().toString(36)}`;
      instinct.emit(
        sessionId,
        'intent_journal',
        fullPrompt || '(empty prompt)',
        workflowCtx,
        journalTag,
        { skipDedup: true, extraFields: { sessionResult: 'pending' } }
      );
    } catch {
      // 觀察失敗不影響主流程
    }
  }

  const systemMessage = buildSystemMessage({
    validWorkflowOverride,
    currentState,
    activeFeatureContext,
    workflows,
  });

  return { systemMessage, result: '' };
}

/**
 * 組裝 UserPromptSubmit 的 systemMessage
 * @param {object} opts
 * @param {string|null} opts.validWorkflowOverride - 已驗證的 workflow 覆寫鍵值（null 表示無覆寫）
 * @param {object|null} opts.currentState - 當前 workflow 狀態物件（null 表示無進行中 workflow）
 * @param {string} opts.activeFeatureContext - 活躍 feature 上下文字串（空字串表示無）
 * @param {object} opts.workflows - workflows 定義物件（registry）
 * @returns {string|null} systemMessage 字串，無適用情境時回傳 null
 */
function buildSystemMessage(opts) {
  const {
    validWorkflowOverride = null,
    currentState = null,
    activeFeatureContext = '',
    workflows: workflowDefs = {},
  } = opts || {};

  if (validWorkflowOverride) {
    const workflowDef = workflowDefs[validWorkflowOverride] || {};
    return [
      `[Overtone] 使用者指定了 workflow：${validWorkflowOverride}（${workflowDef.label || validWorkflowOverride}）。`,
      `請直接執行此 workflow，不需要執行 /ot:auto 判斷。`,
      `讀取對應的 workflow command：/ot:${validWorkflowOverride} 取得完整執行指引。`,
      `⛔ MUST 依照 workflow command 指引委派 agent，不要自己寫碼。`,
      `📊 初始化後、委派第一個 agent 前，MUST 使用 TaskCreate 建立 pipeline 進度追蹤。`,
    ].join('\n');
  }

  if (currentState && currentState.currentStage) {
    const { currentStage, workflowType } = currentState;
    return [
      `[Overtone] 工作流進行中：${workflowType}（${currentStage}）`,
      activeFeatureContext || '',
      '查看 /ot:auto 取得完整狀態和執行指引。',
    ].filter(Boolean).join('\n');
  }

  // 無進行中 workflow → 注入 /ot:auto 指引
  return [
    '[Overtone] 請先閱讀 /ot:auto 工作流選擇器來決定最適合的工作流。',
    '根據使用者需求自動選擇：dev/quick/standard/full/secure/tdd/debug/refactor 等 18 個 workflow 模板。',
    '⛔ 選好工作流後，MUST 依照 workflow command 指引委派 agent，不要自己寫碼。',
    '📊 初始化後、委派第一個 agent 前，MUST 使用 TaskCreate 建立 pipeline 進度追蹤。',
    activeFeatureContext || '',
  ].filter(Boolean).join('\n');
}

module.exports = { handleOnSubmit, buildSystemMessage };
