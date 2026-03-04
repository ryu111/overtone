'use strict';
/**
 * specs-archive-scanner — 掃描式歸檔共享模組
 *
 * 掃描 specs/features/in-progress/ 下所有子目錄，
 * 若 tasks.md checkbox 全勾選則呼叫 archiveFeature()。
 *
 * 消費者：session/on-start.js、session/on-stop.js
 */

const path = require('path');
const { readdirSync, statSync, existsSync } = require('fs');
const specs = require('./specs');
const timeline = require('./timeline');

/**
 * 掃描並歸檔已完成的 feature。
 *
 * @param {string} projectRoot - 專案根目錄
 * @param {string|null} sessionId - 當前 session ID（用於 emit timeline 事件）
 * @param {object} [options]
 * @param {string} [options.source] - timeline 事件來源標記（'on-start' | 'on-stop'）
 * @param {string} [options.skipFeature] - 要跳過的 feature name（on-stop 跳過當前 feature）
 * @returns {{ archived: string[], count: number }}
 */
function scanAndArchive(projectRoot, sessionId, options = {}) {
  const { source = 'unknown', skipFeature = null } = options;
  const ipDir = specs.inProgressDir(projectRoot);

  if (!projectRoot || !existsSync(ipDir)) {
    return { archived: [], count: 0 };
  }

  const dirs = readdirSync(ipDir).filter(name => {
    try { return statSync(path.join(ipDir, name)).isDirectory(); } catch { return false; }
  });

  const archived = [];
  for (const name of dirs) {
    if (skipFeature && name === skipFeature) continue;
    const tasksPath = path.join(ipDir, name, 'tasks.md');
    const status = specs.readTasksCheckboxes(tasksPath);
    if (status && status.total > 0 && status.allChecked) {
      try {
        specs.archiveFeature(projectRoot, name);
        archived.push(name);
      } catch { /* 單一 feature 歸檔失敗不影響其他 */ }
    }
  }

  if (archived.length > 0 && sessionId) {
    timeline.emit(sessionId, 'specs:archive-scan', {
      source,
      archived,
      count: archived.length,
    });
  }

  return { archived, count: archived.length };
}

module.exports = { scanAndArchive };
