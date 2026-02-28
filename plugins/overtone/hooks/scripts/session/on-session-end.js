#!/usr/bin/env node
'use strict';
/**
 * SessionEnd hook — Session 結束清理
 *
 * 觸發：session 結束時（clear、logout、prompt_input_exit、other）
 * 職責：
 *   ✅ 若 Stop hook 尚未處理（loop.json stopped=false），emit session:end timeline 事件
 *   ✅ 重置 loop.json 為 stopped: true
 *   ✅ 清理 ~/.overtone/.current-session-id
 *
 * 注意：若 Stop hook 已處理正常退出（stopped=true），跳過 session:end emit，避免重複。
 */

const { unlinkSync, writeFileSync, existsSync } = require('fs');
const paths = require('../../../scripts/lib/paths');
const timeline = require('../../../scripts/lib/timeline');
const { safeReadStdin, safeRun, getSessionId, hookError } = require('../../../scripts/lib/hook-utils');

safeRun(() => {
  const input = safeReadStdin();
  const sessionId = getSessionId(input);

  // 無 sessionId → 靜默退出
  if (!sessionId) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  const reason = input.reason || 'other';

  // ── 讀取 loop.json 狀態 ──

  const loopPath = paths.session.loop(sessionId);
  let loopStopped = false;

  try {
    if (existsSync(loopPath)) {
      const loopData = JSON.parse(require('fs').readFileSync(loopPath, 'utf8'));
      loopStopped = loopData.stopped === true;
    }
  } catch {
    // 讀取失敗視為未 stopped
    loopStopped = false;
  }

  // ── 1. 若 Stop hook 尚未處理，emit session:end ──

  if (!loopStopped) {
    try {
      timeline.emit(sessionId, 'session:end', { reason });
    } catch (err) {
      hookError('on-session-end', `emit session:end 失敗：${err.message || String(err)}`);
    }
  }

  // ── 2. 重置 loop.json（簡單寫入 stopped: true，保留其他欄位）──

  try {
    if (existsSync(loopPath)) {
      let loopData = {};
      try {
        loopData = JSON.parse(require('fs').readFileSync(loopPath, 'utf8'));
      } catch {
        // 讀取失敗用空物件
      }
      loopData.stopped = true;
      writeFileSync(loopPath, JSON.stringify(loopData, null, 2), 'utf8');
    }
  } catch (err) {
    hookError('on-session-end', `重置 loop.json 失敗：${err.message || String(err)}`);
  }

  // ── 3. 清理 .current-session-id ──

  try {
    if (existsSync(paths.CURRENT_SESSION_FILE)) {
      unlinkSync(paths.CURRENT_SESSION_FILE);
    }
  } catch (err) {
    hookError('on-session-end', `清理 .current-session-id 失敗：${err.message || String(err)}`);
  }

  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });
