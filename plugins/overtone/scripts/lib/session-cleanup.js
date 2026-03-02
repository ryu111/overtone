#!/usr/bin/env node
'use strict';
/**
 * session-cleanup.js — Session 過期清理工具
 *
 * 提供三個函式：
 *   cleanupStaleSessions(options)   — 清理 ~/.overtone/sessions/ 下過期 session 目錄
 *   cleanupOrphanFiles(overtoneHome) — 清理 ~/.overtone/ 下過期暫存檔
 *   runCleanup(sessionId, overtoneHome) — 一鍵清理入口
 *
 * 設計原則：
 *   - 保守刪除策略：只刪確定過期的，有 try/catch 保護
 *   - 函式接受可選路徑參數，方便測試注入替代路徑
 *   - 使用 require('fs') 同步操作
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_OVERTONE_HOME = path.join(os.homedir(), '.overtone');
const DEFAULT_MAX_AGE_DAYS = 7;
const DEFAULT_ORPHAN_MAX_AGE_HOURS = 1;

/**
 * 取得目錄內所有檔案的最新 mtime（毫秒）。
 * 目錄本身不存在或讀取失敗時回傳 0。
 *
 * @param {string} dirPath - 目錄路徑
 * @returns {number} 最新 mtime（毫秒），或 0
 */
function getLatestMtime(dirPath) {
  try {
    let latest = 0;

    // 目錄本身的 mtime
    const dirStat = fs.statSync(dirPath);
    latest = dirStat.mtimeMs;

    // 掃描目錄下所有檔案
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      try {
        const entryPath = path.join(dirPath, entry);
        const stat = fs.statSync(entryPath);
        if (stat.mtimeMs > latest) {
          latest = stat.mtimeMs;
        }
      } catch {
        // 單一檔案讀取失敗不中斷整體掃描
      }
    }

    return latest;
  } catch {
    return 0;
  }
}

/**
 * 清理過期 session 目錄。
 *
 * 掃描 sessionsDir 下所有 session 目錄，刪除超過 maxAgeDays 天的目錄。
 * 保護當前 session（currentSessionId）不被刪除。
 *
 * @param {object} [options]
 * @param {number} [options.maxAgeDays=7] - 超過此天數視為過期
 * @param {string} [options.currentSessionId] - 當前 session ID，不刪除此目錄
 * @param {string} [options.sessionsDir] - sessions 目錄路徑（測試用，預設 ~/.overtone/sessions/）
 * @returns {{ cleaned: number, errors: string[], skipped: string[] }}
 */
function cleanupStaleSessions(options = {}) {
  const maxAgeDays = options.maxAgeDays != null ? options.maxAgeDays : DEFAULT_MAX_AGE_DAYS;
  const currentSessionId = options.currentSessionId || '';
  const sessionsDir = options.sessionsDir || path.join(DEFAULT_OVERTONE_HOME, 'sessions');

  const result = { cleaned: 0, errors: [], skipped: [] };

  // sessions 目錄不存在時直接回傳
  if (!fs.existsSync(sessionsDir)) {
    return result;
  }

  let entries;
  try {
    entries = fs.readdirSync(sessionsDir);
  } catch (err) {
    result.errors.push(`無法讀取 sessions 目錄：${err.message || String(err)}`);
    return result;
  }

  const nowMs = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    const sessionPath = path.join(sessionsDir, entry);

    // 確認是目錄
    try {
      const stat = fs.statSync(sessionPath);
      if (!stat.isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    // 保護當前 session
    if (currentSessionId && entry === currentSessionId) {
      result.skipped.push(entry);
      continue;
    }

    // 取得最後修改時間
    const latestMtime = getLatestMtime(sessionPath);
    const ageMs = nowMs - latestMtime;

    // 未超過最大存活時間 → 跳過
    if (ageMs <= maxAgeMs) {
      result.skipped.push(entry);
      continue;
    }

    // 刪除過期 session 目錄
    try {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      result.cleaned++;
    } catch (err) {
      result.errors.push(`刪除 session ${entry} 失敗：${err.message || String(err)}`);
    }
  }

  return result;
}

/**
 * 清理 overtoneHome 下過期的 orphan 暫存檔（.tmp、.bak、.lock）。
 *
 * 只清理超過 maxAgeHours 小時的暫存檔。
 * 不遞迴進入子目錄（只掃描頂層）。
 *
 * @param {string} [overtoneHome] - ~/.overtone 路徑（測試用可傳入替代路徑）
 * @param {object} [options]
 * @param {number} [options.maxAgeHours=1] - 超過此小時數視為過期
 * @returns {{ cleaned: number, errors: string[], skipped: string[] }}
 */
function cleanupOrphanFiles(overtoneHome, options = {}) {
  const homeDir = overtoneHome || DEFAULT_OVERTONE_HOME;
  const maxAgeHours = options.maxAgeHours != null ? options.maxAgeHours : DEFAULT_ORPHAN_MAX_AGE_HOURS;
  const orphanExtensions = ['.tmp', '.bak', '.lock'];

  const result = { cleaned: 0, errors: [], skipped: [] };

  if (!fs.existsSync(homeDir)) {
    return result;
  }

  let entries;
  try {
    entries = fs.readdirSync(homeDir);
  } catch (err) {
    result.errors.push(`無法讀取 overtone home 目錄：${err.message || String(err)}`);
    return result;
  }

  const nowMs = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!orphanExtensions.includes(ext)) {
      continue;
    }

    const filePath = path.join(homeDir, entry);

    // 確認是檔案（不處理目錄）
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        continue;
      }

      const ageMs = nowMs - stat.mtimeMs;
      if (ageMs <= maxAgeMs) {
        result.skipped.push(entry);
        continue;
      }
    } catch {
      continue;
    }

    // 刪除過期暫存檔
    try {
      fs.unlinkSync(filePath);
      result.cleaned++;
    } catch (err) {
      result.errors.push(`刪除暫存檔 ${entry} 失敗：${err.message || String(err)}`);
    }
  }

  return result;
}

/**
 * 一鍵清理入口。
 *
 * 呼叫 cleanupStaleSessions + cleanupOrphanFiles，回傳完整報告。
 *
 * @param {string} [currentSessionId] - 當前 session ID（不刪除此 session）
 * @param {string} [overtoneHome] - ~/.overtone 路徑（測試用可傳入替代路徑）
 * @param {object} [options]
 * @param {number} [options.maxAgeDays=7] - session 過期天數
 * @returns {{ sessions: object, orphanFiles: object }}
 */
function runCleanup(currentSessionId, overtoneHome, options = {}) {
  const homeDir = overtoneHome || DEFAULT_OVERTONE_HOME;
  const sessionsDir = path.join(homeDir, 'sessions');

  const sessionsResult = cleanupStaleSessions({
    maxAgeDays: options.maxAgeDays,
    currentSessionId: currentSessionId || '',
    sessionsDir,
  });

  const orphanResult = cleanupOrphanFiles(homeDir, {
    maxAgeHours: options.maxAgeHours,
  });

  return {
    sessions: sessionsResult,
    orphanFiles: orphanResult,
  };
}

module.exports = {
  cleanupStaleSessions,
  cleanupOrphanFiles,
  runCleanup,
};
