#!/usr/bin/env node
'use strict';
/**
 * Notification hook — 音效通知
 *
 * 觸發：Claude Code 發出通知時（AskUserQuestion、權限要求等）
 * 職責：
 *   ✅ elicitation_dialog → 播放 Glass（AskUserQuestion）
 *   ✅ permission_prompt → 播放 Glass（權限要求）
 */

const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');
const { playSound, SOUNDS } = require('../../../scripts/lib/sound');

// 需要播放音效的通知類型
const SOUND_TYPES = ['elicitation_dialog', 'permission_prompt'];

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
