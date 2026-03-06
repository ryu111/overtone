#!/usr/bin/env node
'use strict';
/**
 * Notification hook — 音效通知
 *
 * 觸發：Claude Code 發出通知時（AskUserQuestion 等）
 * 職責：
 *   ✅ elicitation_dialog → 播放 Glass（AskUserQuestion）
 *   ⬜ permission_prompt → 不播音（用戶在螢幕前不需提醒）
 */

const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');
const { playSound, SOUNDS } = require('../../../scripts/lib/sound');

// 需要播放音效的通知類型（permission_prompt 不播音 — 用戶在螢幕前不需要提醒）
const SOUND_TYPES = ['elicitation_dialog'];

// ── 入口守衛 ──
if (require.main === module) {
safeRun(() => {
  const input = safeReadStdin();
  // 通知類型可能在 type 或 notification_type 欄位
  const notificationType = input.type || input.notification_type || '';

  if (shouldPlaySound(notificationType, SOUND_TYPES)) {
    playSound(SOUNDS.GLASS);
    // TTS fire-and-forget — 不阻擋主流程
    try {
      const ttsStrategy = require('../../../scripts/lib/tts-strategy');
      const ttsConfig = ttsStrategy.readTtsConfig();
      if (ttsConfig.enabled && ttsStrategy.shouldSpeak('notification:ask', ttsConfig.level)) {
        const args = ttsStrategy.buildSpeakArgs('notification:ask', {}, ttsConfig);
        if (args) require('../../../scripts/os/tts').speakBackground(args.text, args.opts);
      }
    } catch { /* TTS 錯誤不影響主流程 */ }
  }

  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });
}

/**
 * 判斷是否應播放音效
 * @param {string} notificationType - 通知類型字串
 * @param {string[]} soundTypes - 需要播放音效的通知類型清單
 * @returns {boolean}
 */
function shouldPlaySound(notificationType, soundTypes) {
  if (!soundTypes || soundTypes.length === 0) return false;
  return soundTypes.includes(notificationType);
}

// ── 純函數匯出 ──
module.exports = { shouldPlaySound };
