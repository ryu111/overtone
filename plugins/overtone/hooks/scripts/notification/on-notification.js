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

safeRun(() => {
  const input = safeReadStdin();
  // 通知類型可能在 type 或 notification_type 欄位
  const notificationType = input.type || input.notification_type || '';

  if (SOUND_TYPES.includes(notificationType)) {
    playSound(SOUNDS.GLASS);
  }

  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });
