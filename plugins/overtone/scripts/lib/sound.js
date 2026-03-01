'use strict';
/**
 * sound.js — macOS 音效通知
 *
 * 使用 afplay 播放系統音效，非阻塞（spawn + detach）。
 * 只在 macOS 上播放，其他平台靜默跳過。
 */

const { spawn } = require('child_process');
const { join } = require('path');
const { existsSync, writeFileSync, unlinkSync, readFileSync } = require('fs');
const { hookError } = require('./hook-utils');
const paths = require('./paths');

// macOS 系統音效路徑
const SOUNDS_DIR = '/System/Library/Sounds';

// 音效常數
const SOUNDS = {
  HERO:  'Hero.aiff',   // Pipeline 完成（特殊完成音）
  GLASS: 'Glass.aiff',  // 一般提示（等待輸入、AskUserQuestion、權限）
  BASSO: 'Basso.aiff',  // 錯誤（工具失敗、pipeline 異常）
  TINK:  'Tink.aiff',   // 錯誤恢復（抵消音）
};

/**
 * 播放 macOS 系統音效（非阻塞）
 * @param {string} soundFile - 音效檔名（如 'Glass.aiff'）
 */
function playSound(soundFile) {
  if (process.platform !== 'darwin') return;

  const soundPath = join(SOUNDS_DIR, soundFile);
  if (!existsSync(soundPath)) return;

  try {
    const child = spawn('afplay', [soundPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (err) {
    hookError('sound', `播放失敗：${err.message}`);
  }
}

// ── Error Flag 機制 ──

/**
 * 寫入 error flag（記錄最近一次錯誤的時間戳）
 * @param {string} sessionId
 */
function writeErrorFlag(sessionId) {
  try {
    const flagPath = join(paths.sessionDir(sessionId), 'error.flag');
    writeFileSync(flagPath, String(Date.now()));
  } catch {
    // 靜默失敗
  }
}

/**
 * 讀取並清除 error flag
 * @param {string} sessionId
 * @returns {{ exists: boolean, recentMs: number }} 是否存在 + 距今毫秒數
 */
function readAndClearErrorFlag(sessionId) {
  try {
    const flagPath = join(paths.sessionDir(sessionId), 'error.flag');
    if (!existsSync(flagPath)) return { exists: false, recentMs: Infinity };

    const ts = parseInt(readFileSync(flagPath, 'utf8'), 10);
    unlinkSync(flagPath);
    return { exists: true, recentMs: Date.now() - ts };
  } catch {
    return { exists: false, recentMs: Infinity };
  }
}

/**
 * 清除 error flag（不播放音效）
 * @param {string} sessionId
 */
function clearErrorFlag(sessionId) {
  try {
    const flagPath = join(paths.sessionDir(sessionId), 'error.flag');
    if (existsSync(flagPath)) unlinkSync(flagPath);
  } catch {
    // 靜默
  }
}

module.exports = { playSound, SOUNDS, writeErrorFlag, readAndClearErrorFlag, clearErrorFlag };
