#!/usr/bin/env node
'use strict';
/**
 * loop.js — Loop 狀態管理 + tasks.md Checkbox 解析
 *
 * 提供 Stop hook 所需的 loop 狀態 I/O，以及
 * openspec/changes/tasks.md 的 checkbox 完成度查詢。
 *
 * loop.json 結構：
 *   { iteration, stopped, consecutiveErrors, startedAt, stoppedAt?, stopReason? }
 *
 * readTasksStatus 語意：
 *   null    = tasks.md 不存在 / 無 checkbox → fallback 到純 stage 完成度判斷
 *   object  = { total, checked, allChecked }
 */

const { readFileSync } = require('fs');
const { join } = require('path');
const paths = require('./paths');
const timeline = require('./timeline');
const { atomicWrite } = require('./utils');

// ── Loop 狀態讀寫 ──

/**
 * 讀取 loop 狀態。不存在時初始化並寫回。
 * @param {string} sessionId
 * @returns {{ iteration: number, stopped: boolean, consecutiveErrors: number, startedAt: string }}
 */
function readLoop(sessionId) {
  const filePath = paths.session.loop(sessionId);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    const initial = {
      iteration: 0,
      stopped: false,
      consecutiveErrors: 0,
      startedAt: new Date().toISOString(),
    };
    writeLoop(sessionId, initial);
    return initial;
  }
}

/**
 * 寫入 loop 狀態。
 * @param {string} sessionId
 * @param {object} loopData
 */
function writeLoop(sessionId, loopData) {
  atomicWrite(paths.session.loop(sessionId), loopData);
}

/**
 * 結束 loop：設定 stopped + 寫回 + emit timeline。
 * @param {string} sessionId
 * @param {object} loopData
 * @param {string} reason - 停止原因
 */
function exitLoop(sessionId, loopData, reason) {
  loopData.stopped = true;
  loopData.stoppedAt = new Date().toISOString();
  loopData.stopReason = reason;
  writeLoop(sessionId, loopData);

  timeline.emit(sessionId, 'loop:complete', {
    iteration: loopData.iteration,
    reason,
  });

  // Dashboard 通知：SSE 透過 file watcher 自動偵測 timeline 變更並推送
  timeline.emit(sessionId, 'session:end', {
    iteration: loopData.iteration,
    reason,
  });
}

// ── tasks.md Checkbox 解析 ──

/**
 * 讀取 openspec/changes/tasks.md 的 checkbox 完成度。
 *
 * @param {string} projectRoot - 專案根目錄（來自 Stop hook 的 input.cwd）
 * @returns {{ total: number, checked: number, allChecked: boolean } | null}
 *   null = tasks.md 不存在、讀取失敗、或無任何 checkbox
 *          → 呼叫方應 fallback 到純 workflow stage 完成度判斷
 */
function readTasksStatus(projectRoot) {
  if (!projectRoot) return null;

  const tasksPath = join(paths.project.changes(projectRoot), 'tasks.md');

  let content;
  try {
    content = readFileSync(tasksPath, 'utf8');
  } catch {
    return null; // 檔案不存在或無讀取權限 → 靜默 fallback
  }

  // 偵測 checkbox 格式：- [ ] 或 - [x] / - [X]（行首允許縮排，支援巢狀列表）
  const uncheckedMatches = content.match(/^[\s]*-\s\[ \]/gm) || [];
  const checkedMatches   = content.match(/^[\s]*-\s\[x\]/gmi) || [];

  const checked = checkedMatches.length;
  const total   = uncheckedMatches.length + checked;

  // 無任何 checkbox → 視同不適用（pure-prose tasks.md）
  if (total === 0) return null;

  return { total, checked, allChecked: checked === total };
}

module.exports = { readLoop, writeLoop, exitLoop, readTasksStatus };
