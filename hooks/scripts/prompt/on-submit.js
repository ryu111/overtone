#!/usr/bin/env node
'use strict';
/**
 * UserPromptSubmit hook — 注入 systemMessage 指向 /ot:auto
 *
 * 觸發：每次使用者送出 prompt
 * 作用：在 system context 注入工作流選擇器指引
 * 例外：使用者已手動使用 /ot: 命令時不注入
 */

const { readFileSync } = require('fs');
const state = require('../../../scripts/lib/state');

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

// 如果已有進行中的 workflow，提供狀態摘要而非重新觸發 /ot:auto
const currentState = sessionId ? state.readState(sessionId) : null;
let systemMessage;

if (currentState && currentState.currentStage) {
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

process.stdout.write(JSON.stringify({ hookSpecificOutput: { additionalContext: systemMessage } }));
