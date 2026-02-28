'use strict';
/**
 * hook-runner.js — E2E/integration 測試共用的 hook 執行 helper
 *
 * 提供統一的 hook 執行介面，處理：
 *   - Bun.spawn / spawnSync 的 stdin pipe
 *   - 共用環境變數（OVERTONE_NO_DASHBOARD、CLAUDE_SESSION_ID）
 *   - JSON 解析輸出
 */

const { join } = require('path');
const { HOOKS_DIR, SCRIPTS_DIR } = require('./paths');

// ── Hook 路徑 ──

const PRE_TASK_PATH   = join(HOOKS_DIR, 'tool', 'pre-task.js');
const ON_STOP_PATH    = join(HOOKS_DIR, 'agent', 'on-stop.js');
const SESSION_STOP_PATH = join(HOOKS_DIR, 'session', 'on-stop.js');
const ON_START_PATH   = join(HOOKS_DIR, 'session', 'on-start.js');
const INIT_WORKFLOW_PATH = join(SCRIPTS_DIR, 'init-workflow.js');

// ── 共用 env 設定 ──

/**
 * 建立 hook 執行的環境變數
 * @param {string|undefined} sessionId - 要設定的 sessionId；undefined 則刪除
 * @returns {object} 環境變數物件
 */
function buildEnv(sessionId) {
  const env = {
    ...process.env,
    OVERTONE_NO_DASHBOARD: '1', // 防止 on-start 啟動 Dashboard
  };
  // 移除可能干擾測試的 session 環境變數
  delete env.CLAUDE_SESSION_ID;

  if (sessionId !== undefined) {
    env.CLAUDE_SESSION_ID = sessionId;
  }

  return env;
}

// ── 輔助：解析 spawnSync 輸出 ──

function decodeOutput(buf) {
  return buf ? new TextDecoder().decode(buf) : '';
}

function parseJsonOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

// ── 同步執行函式（spawnSync）──

/**
 * 執行 pre-task.js hook（同步）
 * @param {string} sessionId
 * @param {object} toolInput - { description?, prompt? }
 * @returns {{ exitCode: number, stdout: string, stderr: string, parsed: object|null }}
 */
function runPreTask(sessionId, toolInput = {}) {
  const input = {
    session_id: sessionId,
    tool_name: 'Task',
    tool_input: toolInput,
  };
  const proc = Bun.spawnSync(['node', PRE_TASK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: buildEnv(sessionId),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = decodeOutput(proc.stdout);
  return {
    exitCode: proc.exitCode,
    stdout,
    stderr: decodeOutput(proc.stderr),
    parsed: parseJsonOutput(stdout),
  };
}

/**
 * 執行 on-stop.js（SubagentStop）hook（同步）
 * @param {string} sessionId
 * @param {string} agentType - agent 類型，如 'ot:developer'
 * @param {string} message - last_assistant_message
 * @param {object} [extra={}] - 額外的 input 欄位（如 cwd）
 * @returns {{ exitCode: number, stdout: string, stderr: string, parsed: object|null }}
 */
function runSubagentStop(sessionId, agentType, message, extra = {}) {
  const input = {
    session_id: sessionId,
    agent_type: agentType,
    last_assistant_message: message,
    cwd: process.cwd(),
    ...extra,
  };
  const proc = Bun.spawnSync(['node', ON_STOP_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: buildEnv(sessionId),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = decodeOutput(proc.stdout);
  return {
    exitCode: proc.exitCode,
    stdout,
    stderr: decodeOutput(proc.stderr),
    parsed: parseJsonOutput(stdout),
  };
}

/**
 * 執行 session/on-stop.js（Stop hook）（同步）
 * @param {string} sessionId
 * @param {string} [message=''] - last_assistant_message
 * @returns {{ exitCode: number, stdout: string, stderr: string, parsed: object|null }}
 */
function runSessionStop(sessionId, message = '') {
  const input = {
    session_id: sessionId,
    stop_hook_active: false,
    last_assistant_message: message,
  };
  const proc = Bun.spawnSync(['node', SESSION_STOP_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: {
      ...buildEnv(sessionId),
      CLAUDE_SESSION_ID: '',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = decodeOutput(proc.stdout);
  return {
    exitCode: proc.exitCode,
    stdout,
    stderr: decodeOutput(proc.stderr),
    parsed: parseJsonOutput(stdout),
  };
}

/**
 * 執行 on-start.js（SessionStart）hook（同步）
 * @param {string} sessionId
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runOnStart(sessionId) {
  const proc = Bun.spawnSync(['node', ON_START_PATH], {
    stdin: Buffer.from(JSON.stringify({ session_id: sessionId })),
    env: {
      ...buildEnv(sessionId),
      CLAUDE_SESSION_ID: '',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: proc.exitCode,
    stdout: decodeOutput(proc.stdout),
    stderr: decodeOutput(proc.stderr),
  };
}

/**
 * 執行 init-workflow.js 腳本（同步）
 * @param {string} workflowType - workflow 類型（如 'single', 'quick', 'standard'）
 * @param {string} sessionId
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runInitWorkflow(workflowType, sessionId) {
  const proc = Bun.spawnSync(['node', INIT_WORKFLOW_PATH, workflowType, sessionId], {
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: proc.exitCode,
    stdout: decodeOutput(proc.stdout),
    stderr: decodeOutput(proc.stderr),
  };
}

/**
 * 判斷 pre-task.js 的輸出是否為「允許放行」
 *
 * 允許放行有兩種合法格式：
 *   舊格式：{ result: '' }
 *   新格式（updatedInput 注入）：{ hookSpecificOutput: { permissionDecision: 'allow', updatedInput: { prompt: '...' } } }
 *
 * @param {object} parsed - parseJsonOutput 的輸出（parsed 欄位）
 * @returns {boolean}
 */
function isAllowed(parsed) {
  if (!parsed) return false;
  // 舊格式
  if (parsed.result === '') return true;
  // 新格式（updatedInput 注入）
  if (parsed.hookSpecificOutput?.permissionDecision === 'allow') return true;
  return false;
}

module.exports = {
  runPreTask,
  runSubagentStop,
  runSessionStop,
  runOnStart,
  runInitWorkflow,
  isAllowed,
};
