#!/usr/bin/env node
'use strict';
/**
 * SubagentStop hook — 記錄 agent 結果 + 提示下一步 + 寫 state + emit timeline
 *
 * 觸發：每個 subagent（Task）結束時
 * 職責：記錄結果、偵測 FAIL/REJECT、並行收斂、提示下一步
 *
 * 薄殼模式：業務邏輯全在 agent-stop-handler.js
 */

const { safeReadStdin, safeRun, getSessionId } = require('../../../scripts/lib/hook-utils');

if (require.main === module) {
  safeRun(() => {
    const input = safeReadStdin();
    const sessionId = getSessionId(input);
    const handler = require('../../../scripts/lib/agent-stop-handler');
    const result = handler.handleAgentStop(input, sessionId);
    process.stdout.write(JSON.stringify(result.output));
    process.exit(0);
  }, { result: '' });
}

module.exports = {};
