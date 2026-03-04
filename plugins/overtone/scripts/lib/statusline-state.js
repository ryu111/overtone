'use strict';
/**
 * statusline-state.js — Statusline 集中式狀態管理
 *
 * 職責：管理 statusline 的顯示狀態（activeAgents、workflowType、idle）。
 * Hooks 呼叫 update() 寫入，statusline.js 呼叫 read() 讀取渲染。
 *
 * 狀態檔：~/.overtone/sessions/{sessionId}/statusline-state.json
 *
 * 事件：
 *   agent:start    — pre-task.js 委派 agent 時
 *   agent:stop     — SubagentStop 時
 *   turn:stop      — Stop hook 時
 *   workflow:init  — init-workflow.js 時
 */

const { readFileSync, writeFileSync, mkdirSync, statSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const SESSIONS_DIR = join(homedir(), '.overtone', 'sessions');
const TTL_MS = 10 * 60 * 1000; // 10 分鐘

function statePath(sessionId) {
  return join(SESSIONS_DIR, sessionId, 'statusline-state.json');
}

/**
 * 讀取 statusline 狀態
 * @param {string} sessionId
 * @returns {{ activeAgents: string[], workflowType: string|null, idle: boolean } | null}
 */
function read(sessionId) {
  if (!sessionId) return null;
  try {
    const p = statePath(sessionId);
    const state = JSON.parse(readFileSync(p, 'utf8'));
    // TTL 機制：idle 狀態且檔案已逾 10 分鐘未更新 → 視為過期，回傳 null
    if (state.idle === true) {
      const { mtimeMs } = statSync(p);
      if ((Date.now() - mtimeMs) >= TTL_MS) {
        return null;
      }
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * 寫入 statusline 狀態
 * @param {string} sessionId
 * @param {object} state
 */
function write(sessionId, state) {
  const dir = join(SESSIONS_DIR, sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(sessionId), JSON.stringify(state));
}

/**
 * 更新 statusline 狀態
 *
 * @param {string} sessionId
 * @param {string} event       — 'agent:start' | 'agent:stop' | 'turn:stop' | 'workflow:init'
 * @param {object} [payload]   — 事件資料
 * @param {string} [payload.stageKey]     — stage key（如 'DEV', 'DEV:2'）
 * @param {string} [payload.workflowType] — workflow 類型（如 'quick'）
 */
function update(sessionId, event, payload = {}) {
  if (!sessionId) return;

  const state = read(sessionId) || { activeAgents: [], workflowType: null, idle: false };

  switch (event) {
    case 'agent:start':
      if (payload.stageKey) {
        state.activeAgents.push(payload.stageKey);
      }
      state.idle = false;
      break;

    case 'agent:stop':
      if (payload.stageKey) {
        const idx = state.activeAgents.indexOf(payload.stageKey);
        if (idx >= 0) state.activeAgents.splice(idx, 1);
      }
      break;

    case 'turn:stop':
      state.idle = true;
      break;

    case 'workflow:init':
      state.workflowType = payload.workflowType || null;
      state.activeAgents = [];
      state.idle = false;
      break;
  }

  write(sessionId, state);
}

module.exports = { read, update };
