'use strict';
/**
 * sound.js — macOS 音效通知
 *
 * 使用 afplay 播放系統音效，非阻塞（spawn + detach）。
 * 只在 macOS 上播放，其他平台靜默跳過。
 */

const { spawn } = require('child_process');
const { join } = require('path');
const { existsSync } = require('fs');
const { hookError } = require('./hook-utils');

// macOS 系統音效路徑
const SOUNDS_DIR = '/System/Library/Sounds';

// 音效常數
const SOUNDS = {
  HERO:  'Hero.aiff',   // Pipeline 完成（特殊完成音）
  GLASS: 'Glass.aiff',  // 一般提示（AskUserQuestion、Loop 停止）
  BASSO: 'Basso.aiff',  // 錯誤（workflow 異常中斷）
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

module.exports = { playSound, SOUNDS };
