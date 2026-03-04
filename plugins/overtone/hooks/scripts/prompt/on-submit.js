#!/usr/bin/env node
'use strict';
/**
 * UserPromptSubmit hook — 注入 systemMessage 指向 /ot:auto
 *
 * 觸發：每次使用者送出 prompt
 * 作用：在 system context 注入工作流選擇器指引
 * 例外：使用者已手動使用 /ot: 命令時不注入
 * 覆寫：prompt 含 [workflow:xxx] 時直接指定 workflow，跳過 /ot:auto
 *
 * 薄殼：業務邏輯已移至 scripts/lib/on-submit-handler.js
 */

const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');

// ── 入口守衛 ──
if (require.main === module) {
safeRun(() => {
  const input = safeReadStdin();
  const handler = require('../../../scripts/lib/on-submit-handler');
  const result = handler.handleOnSubmit(input);
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}, { result: '' });
}

// 供測試使用（從 handler 重新匯出）
const { buildSystemMessage } = require('../../../scripts/lib/on-submit-handler');
module.exports = { buildSystemMessage };
