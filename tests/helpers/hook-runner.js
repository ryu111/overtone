'use strict';
/**
 * hook-runner.js — E2E/integration 測試共用的 hook 執行 helper
 *
 * 提供統一的 hook 執行介面，處理：
 *   - Bun.spawn / spawnSync 的 stdin pipe
 *   - 共用環境變數（NOVA_NO_DASHBOARD、CLAUDE_SESSION_ID）
 *   - JSON 解析輸出
 */

const { join } = require('path');
const { readFileSync } = require('fs');
const { HOOKS_DIR, SCRIPTS_DIR, SCRIPTS_LIB } = require('./paths');

// ── Hook 路徑 ──

const PRE_TASK_PATH   = join(HOOKS_DIR, 'tool', 'pre-task.js');
const PRE_EDIT_GUARD_PATH = join(HOOKS_DIR, 'tool', 'pre-edit-guard.js');
const PRE_BASH_GUARD_PATH = join(HOOKS_DIR, 'tool', 'pre-bash-guard.js');
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
    NOVA_NO_DASHBOARD: '1', // 防止 on-start 啟動 Dashboard
    NOVA_TEST: '1',          // 防止 failure-tracker 寫入真實 failures.jsonl
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
    cwd: process.cwd(),
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
 * @param {string} agentType - agent 類型，如 'developer'
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
    cwd: require('os').tmpdir(), // 隔離佇列：避免命中真實專案的執行佇列
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
    stdin: Buffer.from(JSON.stringify({ session_id: sessionId, cwd: process.cwd() })),
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
 * @param {string} [featureName] - 可選的 feature 名稱（kebab-case）
 * @param {string} [projectRoot] - 可選的 project 根目錄（用於佇列回寫測試）
 * @returns {{ exitCode: number, stdout: string, stderr: string, workflowId: string|null }}
 */
function runInitWorkflow(workflowType, sessionId, featureName, projectRoot) {
  const args = ['node', INIT_WORKFLOW_PATH, workflowType, sessionId];
  if (featureName) args.push(featureName);
  const proc = Bun.spawnSync(args, {
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
    // 若提供 projectRoot，以該目錄為 cwd（讓 init-workflow.js 的 process.cwd() 指向正確位置）
    cwd: projectRoot || process.cwd(),
  });
  const stdout = decodeOutput(proc.stdout);
  // 從 stdout 解析 workflowId（格式：Workflow ID：{workflowId}）
  const match = stdout.match(/Workflow ID[：:]\s*(\S+)/);
  return {
    exitCode: proc.exitCode,
    stdout,
    stderr: decodeOutput(proc.stderr),
    workflowId: match ? match[1] : null,
  };
}

/**
 * 讀取 session 的 active-workflow-id
 * @param {string} sessionId
 * @param {string} [projectRoot=process.cwd()]
 * @returns {string|null}
 */
function getActiveWorkflowId(sessionId, projectRoot = process.cwd()) {
  const paths = require(join(SCRIPTS_LIB, 'paths'));
  try {
    return readFileSync(paths.session.activeWorkflowId(projectRoot, sessionId), 'utf8').trim();
  } catch {
    return null;
  }
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
  // 空物件 → 放行（無 deny、無 context 注入）
  if (Object.keys(parsed).length === 0) return true;
  // 有 additionalContext 但無 deny → 放行（帶提示的放行）
  if (parsed.hookSpecificOutput && !parsed.hookSpecificOutput.permissionDecision) return true;
  // 明確 allow
  if (parsed.hookSpecificOutput?.permissionDecision === 'allow') return true;
  return false;
}

/**
 * 執行 pre-edit-guard.js hook（同步）
 * @param {string} toolName - 工具名稱（'Write' 或 'Edit'）
 * @param {object} toolInput - { file_path, ... }
 * @returns {{ exitCode: number, stdout: string, stderr: string, parsed: object|null }}
 */
function runPreEditGuard(toolName, toolInput = {}) {
  const input = {
    tool_name: toolName,
    tool_input: toolInput,
  };
  const proc = Bun.spawnSync(['node', PRE_EDIT_GUARD_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: buildEnv(undefined),
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
 * 執行 pre-bash-guard.js hook（同步）
 * @param {object} toolInput - { command?, ... }
 * @returns {{ exitCode: number, stdout: string, stderr: string, parsed: object|null }}
 */
function runPreBashGuard(toolInput = {}) {
  const input = {
    tool_name: 'Bash',
    tool_input: toolInput,
  };
  const proc = Bun.spawnSync(['node', PRE_BASH_GUARD_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: buildEnv(undefined),
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
 * 讀取 workflow state（自動偵測 workflowId）
 * 先嘗試 active-workflow-id，再 fallback 到 session-level
 * @param {string} sessionId
 * @returns {object|null}
 */
function readWorkflowState(sessionId, projectRoot = process.cwd()) {
  const stateLib = require(join(SCRIPTS_LIB, 'state'));
  const workflowId = getActiveWorkflowId(sessionId, projectRoot);
  return stateLib.readState(projectRoot, sessionId, workflowId);
}

/**
 * 原子更新 workflow state（自動偵測 workflowId）
 * @param {string} sessionId
 * @param {function} modifier
 * @returns {object}
 */
function updateWorkflowState(sessionId, modifier, projectRoot = process.cwd()) {
  const stateLib = require(join(SCRIPTS_LIB, 'state'));
  const workflowId = getActiveWorkflowId(sessionId, projectRoot);
  return stateLib.updateStateAtomic(projectRoot, sessionId, workflowId, modifier);
}

/**
 * 查詢 workflow timeline（自動偵測 workflowId）
 * @param {string} sessionId
 * @param {object} filter
 * @returns {Array}
 */
function queryWorkflowTimeline(sessionId, filter = {}, projectRoot = process.cwd()) {
  const timelineLib = require(join(SCRIPTS_LIB, 'timeline'));
  const workflowId = getActiveWorkflowId(sessionId, projectRoot);
  return timelineLib.query(projectRoot, sessionId, workflowId, filter);
}

/**
 * 取得 workflow state 檔案路徑（自動偵測 workflowId）
 * @param {string} sessionId
 * @returns {string}
 */
function getWorkflowFilePath(sessionId, projectRoot = process.cwd()) {
  const pathsLib = require(join(SCRIPTS_LIB, 'paths'));
  const workflowId = getActiveWorkflowId(sessionId, projectRoot);
  if (workflowId) {
    return pathsLib.session.workflowFile(projectRoot, sessionId, workflowId);
  }
  return pathsLib.session.workflow(projectRoot, sessionId);
}

module.exports = {
  runPreTask,
  runPreEditGuard,
  runPreBashGuard,
  runSubagentStop,
  runSessionStop,
  runOnStart,
  runInitWorkflow,
  getActiveWorkflowId,
  readWorkflowState,
  updateWorkflowState,
  queryWorkflowTimeline,
  getWorkflowFilePath,
  isAllowed,
};
