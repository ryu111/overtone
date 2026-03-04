#!/usr/bin/env node
'use strict';
/**
 * paths.js — 統一路徑解析
 *
 * 所有 Overtone 檔案路徑從此處取得。
 * Session 路徑：~/.overtone/sessions/{sessionId}/
 * 專案路徑：{projectRoot}/specs/features/
 */

const { join } = require('path');
const { homedir } = require('os');
const crypto = require('crypto');

// ── 基本路徑 ──

const OVERTONE_HOME = join(homedir(), '.overtone');
const SESSIONS_DIR = join(OVERTONE_HOME, 'sessions');
const GLOBAL_DIR = join(OVERTONE_HOME, 'global');

// Bash 工具環境沒有 CLAUDE_SESSION_ID 環境變數，
// UserPromptSubmit hook 會將當前 session ID 寫入此檔，
// 讓 Skill 中的 Bash 工具呼叫（如 init-workflow.js）能讀到正確的 session ID
const CURRENT_SESSION_FILE = join(OVERTONE_HOME, '.current-session-id');

// ── Session 路徑解析 ──

/**
 * 取得 session 根目錄
 * @param {string} sessionId
 * @returns {string}
 */
function sessionDir(sessionId) {
  return join(SESSIONS_DIR, sessionId);
}

/**
 * 取得 session 內特定檔案路徑
 * @param {string} sessionId
 * @param {string} filename
 * @returns {string}
 */
function sessionFile(sessionId, filename) {
  return join(SESSIONS_DIR, sessionId, filename);
}

/**
 * 取得各 session 檔案路徑
 */
const session = {
  workflow:     (id) => sessionFile(id, 'workflow.json'),
  timeline:     (id) => sessionFile(id, 'timeline.jsonl'),
  loop:         (id) => sessionFile(id, 'loop.json'),
  observations: (id) => sessionFile(id, 'observations.jsonl'),
  compactCount: (id) => sessionFile(id, 'compact-count.json'),
};

// ── 全域路徑（依專案隔離）──

/**
 * 從 projectRoot 計算穩定的 8 字元 hex hash（SHA-256 前 8 字元）
 * 用途：不同專案的全域 store 互相隔離
 * @param {string} projectRoot - 專案根目錄絕對路徑
 * @returns {string} 8 字元 hex 字串
 */
function projectHash(projectRoot) {
  return crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
}

/**
 * 全域路徑物件（所有函式都需要 projectRoot 參數）
 */
const global = {
  dir:          (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot)),
  observations: (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot), 'observations.jsonl'),
  baselines:    (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot), 'baselines.jsonl'),
  scores:       (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot), 'scores.jsonl'),
  failures:     (projectRoot) => join(GLOBAL_DIR, projectHash(projectRoot), 'failures.jsonl'),
};

// ── Heartbeat 路徑 ──

const HEARTBEAT_PID_FILE = join(OVERTONE_HOME, 'heartbeat.pid');
const HEARTBEAT_STATE_FILE = join(OVERTONE_HOME, 'heartbeat-state.json');

// ── 全域設定 ──

const CONFIG_FILE = join(OVERTONE_HOME, 'config.json');
const DASHBOARD_FILE = join(OVERTONE_HOME, 'dashboard.json');

// ── 專案路徑（相對於專案根目錄）──

const project = {
  specsRoot:      (root) => join(root, 'specs'),
  feature:        (root, name) => join(root, 'specs', 'features', 'in-progress', name),
  featureTasks:   (root, name) => join(root, 'specs', 'features', 'in-progress', name, 'tasks.md'),
  backlog:        (root) => join(root, 'specs', 'features', 'backlog'),
  backlogFeature: (root, name) => join(root, 'specs', 'features', 'backlog', name),
  archive:        (root) => join(root, 'specs', 'features', 'archive'),
};

module.exports = {
  OVERTONE_HOME,
  SESSIONS_DIR,
  CURRENT_SESSION_FILE,
  HEARTBEAT_PID_FILE,
  HEARTBEAT_STATE_FILE,
  DASHBOARD_FILE,
  projectHash,
  sessionDir,
  session,
  global,
  project,
};
