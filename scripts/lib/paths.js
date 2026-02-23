#!/usr/bin/env node
'use strict';
/**
 * paths.js — 統一路徑解析
 *
 * 所有 Overtone 檔案路徑從此處取得。
 * Session 路徑：~/.overtone/sessions/{sessionId}/
 * 專案路徑：{projectRoot}/openspec/
 */

const { join } = require('path');
const { homedir } = require('os');

// ── 基本路徑 ──

const OVERTONE_HOME = join(homedir(), '.overtone');
const SESSIONS_DIR = join(OVERTONE_HOME, 'sessions');

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
  handoffsDir:  (id) => join(sessionDir(id), 'handoffs'),
  handoff:      (id, from, to) => join(sessionDir(id), 'handoffs', `${from}-to-${to}.md`),
};

// ── 全域設定 ──

const CONFIG_FILE = join(OVERTONE_HOME, 'config.json');

// ── 專案路徑（相對於專案根目錄）──

const project = {
  openspec:    (root) => join(root, 'openspec'),
  specs:       (root) => join(root, 'openspec', 'specs'),
  changes:     (root) => join(root, 'openspec', 'changes'),
};

module.exports = {
  OVERTONE_HOME,
  SESSIONS_DIR,
  CONFIG_FILE,
  sessionDir,
  sessionFile,
  session,
  project,
};
