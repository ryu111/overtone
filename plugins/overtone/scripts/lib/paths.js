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

// ── 基本路徑 ──

const OVERTONE_HOME = join(homedir(), '.overtone');
const SESSIONS_DIR = join(OVERTONE_HOME, 'sessions');

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
  activeAgent:  (id) => sessionFile(id, 'active-agent.json'),
};

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
  CONFIG_FILE,
  DASHBOARD_FILE,
  sessionDir,
  sessionFile,
  session,
  project,
};
