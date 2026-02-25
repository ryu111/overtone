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

const { readFileSync } = require('fs');
const state = require('../../../scripts/lib/state');
const { workflows } = require('../../../scripts/lib/registry');

// 從 stdin 讀取 hook input
const input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
const userPrompt = (input.user_prompt || '').trim();

// 取得 session ID（由環境變數提供）
const sessionId = process.env.CLAUDE_SESSION_ID || '';

// 如果使用者已手動輸入 /ot: 命令，不覆蓋
if (userPrompt.startsWith('/ot:')) {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

// 解析 [workflow:xxx] 覆寫語法
const workflowOverrideMatch = userPrompt.match(/\[workflow:([a-z0-9_-]+)\]/i);
const workflowOverride = workflowOverrideMatch ? workflowOverrideMatch[1].toLowerCase() : null;

// 驗證覆寫的 workflow key 是否合法（若不合法則忽略，回到正常流程）
const validWorkflowOverride = workflowOverride && workflows[workflowOverride] ? workflowOverride : null;

// 如果已有進行中的 workflow，提供狀態摘要而非重新觸發 /ot:auto
const currentState = sessionId ? state.readState(sessionId) : null;
let systemMessage;

if (validWorkflowOverride) {
  // 使用者指定了 workflow 覆寫 → 直接告知使用指定 workflow
  const workflowDef = workflows[validWorkflowOverride];
  systemMessage = [
    `[Overtone] 使用者指定了 workflow：${validWorkflowOverride}（${workflowDef.label}）。`,
    `請直接執行此 workflow，不需要執行 /ot:auto 判斷。`,
    `讀取對應的 workflow skill：/ot:${validWorkflowOverride} 取得完整執行指引。`,
    `⛔ MUST 依照 workflow skill 指引委派 agent，不要自己寫碼。`,
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
    '請依照目前階段繼續執行。如需查看工作流指引，請使用 /ot:auto。',
  ].filter(Boolean).join('\n');
} else {
  // 無進行中 workflow → 注入 /ot:auto 指引
  systemMessage = [
    '[Overtone] 請先閱讀 /ot:auto 工作流選擇器來決定最適合的工作流。',
    '根據使用者需求自動選擇：single/quick/standard/full/secure/tdd/debug/refactor 等 12 種模板。',
    '⛔ 選好工作流後，MUST 依照 workflow skill 指引委派 agent，不要自己寫碼。',
  ].join('\n');
}

process.stdout.write(JSON.stringify({ additionalContext: systemMessage }));
