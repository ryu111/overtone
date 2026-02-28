#!/usr/bin/env node
'use strict';
/**
 * loop.js — Loop 狀態管理 + tasks.md Checkbox 解析
 *
 * 提供 Stop hook 所需的 loop 狀態 I/O，以及
 * specs/features/in-progress/{feature}/tasks.md 的 checkbox 完成度查詢。
 *
 * loop.json 結構：
 *   { iteration, stopped, consecutiveErrors, startedAt, stoppedAt?, stopReason? }
 *
 * readTasksStatus 語意：
 *   null    = tasks.md 不存在 / 無 checkbox → fallback 到純 stage 完成度判斷
 *   object  = { total, checked, allChecked }
 */

const { readFileSync } = require('fs');
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
 * 讀取指定（或活躍）feature 的 tasks.md checkbox 完成度。
 *
 * 優先使用 featureName 直接定位 tasks.md，避免多 feature 並行時
 * getActiveFeature() 取到錯誤 feature 的問題。
 * featureName 未提供時 fallback 到 getActiveFeature()（向後相容）。
 *
 * @param {string} projectRoot - 專案根目錄（來自 Stop hook 的 input.cwd）
 * @param {string} [featureName] - workflow state 中的 featureName（優先使用）
 * @returns {{ total: number, checked: number, allChecked: boolean } | null}
 *   null = 無活躍 feature、tasks.md 不存在、或無任何 checkbox
 *          → 呼叫方應 fallback 到純 workflow stage 完成度判斷
 */
function readTasksStatus(projectRoot, featureName) {
  if (!projectRoot) return null;

  try {
    const specsLib = require('./specs');

    // 優先用 caller 提供的 featureName 直接定位
    const targetName = featureName || (() => {
      const active = specsLib.getActiveFeature(projectRoot);
      return active ? active.name : null;
    })();
    if (!targetName) return null;

    const tasksPath = paths.project.featureTasks(projectRoot, targetName);
    const result = specsLib.readTasksCheckboxes(tasksPath);

    // 無任何 checkbox → 視同不適用
    if (!result || result.total === 0) return null;

    return result;
  } catch {
    return null; // 任何錯誤均靜默 fallback
  }
}

module.exports = { readLoop, writeLoop, exitLoop, readTasksStatus };
