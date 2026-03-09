'use strict';
/**
 * compact-recovery.test.js — compact recovery 閉環邏輯測試
 *
 * 測試 on-submit-handler.js 中的 _checkCompactRecovery 輔助函式，
 * 以及 handleOnSubmit 在 compact 後首次 submit 時的 recovery 注入行為。
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, writeFileSync, existsSync, mkdtempSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

// 動態 require 以確保每個測試可重新載入（模組快取）
const { _checkCompactRecovery, handleOnSubmit } = require(join(SCRIPTS_LIB, 'on-submit-handler'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

/**
 * 建立獨立的測試臨時目錄，並回傳 cleanup 函式
 */
function makeTempDirs() {
  // 建立完全隔離的臨時目錄結構
  const root = mkdtempSync(join(tmpdir(), 'compact-recovery-test-'));
  const sessionsDir = join(root, 'sessions');
  const globalDir = join(root, 'global', 'proj1234');

  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(globalDir, { recursive: true });

  return {
    root,
    sessionsDir,
    globalDir,
    cleanup: () => {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* 忽略 */ }
    },
  };
}

describe('_checkCompactRecovery', () => {
  let tempDirs;
  let sessionId;
  let sessionDir;
  let compactingPath;
  let recoveryPath;

  // 覆蓋 paths 模組回傳的路徑（使用真實 paths 模組但注入假路徑）
  beforeEach(() => {
    tempDirs = makeTempDirs();
    sessionId = 'test-session-compactrecovery-' + Date.now();
    sessionDir = join(tempDirs.sessionsDir, sessionId);
    mkdirSync(sessionDir, { recursive: true });

    compactingPath = join(sessionDir, 'compacting');
    recoveryPath = join(tempDirs.globalDir, 'compact-recovery.md');
  });

  afterEach(() => {
    tempDirs.cleanup();
  });

  it('Scenario 1: compacting 標記存在 + compact-recovery.md 存在 → 回傳 recovery 內容並清理檔案', () => {
    // 準備 compacting 標記
    writeFileSync(compactingPath, '', 'utf8');
    // 準備 compact-recovery.md
    const recoveryContent = '[Overtone 狀態恢復（compact 後）]\n工作流：quick\n進度：✅ (1/2)';
    writeFileSync(recoveryPath, recoveryContent, 'utf8');

    // 直接呼叫（使用真實路徑但透過 paths module 取路徑需 monkey-patch）
    // 由於 _checkCompactRecovery 使用 paths.session.compacting() 和 paths.global.dir()，
    // 我們需要用封裝方式呼叫，傳入可控制的 sessionId 和 projectRoot。
    // 以下使用實際路徑驗證邏輯一致性，依賴 paths 模組的真實行為。
    // 建立實際測試所需的真實 session 目錄結構
    const realSessionsDir = paths.SESSIONS_DIR;
    const realSessionDir = join(realSessionsDir, sessionId);
    const realCompactingPath = paths.session.compacting(sessionId);
    mkdirSync(realSessionDir, { recursive: true });
    writeFileSync(realCompactingPath, '', 'utf8');

    // 建立真實 projectRoot 對應的 global dir
    const projectRoot = tempDirs.root;
    const realGlobalDir = paths.global.dir(projectRoot);
    mkdirSync(realGlobalDir, { recursive: true });
    const realRecoveryPath = join(realGlobalDir, 'compact-recovery.md');
    writeFileSync(realRecoveryPath, recoveryContent, 'utf8');

    const result = _checkCompactRecovery(sessionId, projectRoot);

    expect(result).toBe(recoveryContent);
    // 確認 compacting 標記已清理
    expect(existsSync(realCompactingPath)).toBe(false);
    // 確認 compact-recovery.md 已清理
    expect(existsSync(realRecoveryPath)).toBe(false);

    // 清理真實 session 目錄（避免污染）
    try { rmSync(realSessionDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  });

  it('Scenario 2: compacting 標記不存在 → 回傳 null（正常流程）', () => {
    // 不建立 compacting 標記
    const projectRoot = tempDirs.root;

    const result = _checkCompactRecovery(sessionId, projectRoot);

    expect(result).toBeNull();
  });

  it('Scenario 3: compacting 標記存在但 compact-recovery.md 不存在 → 清理標記但回傳 null', () => {
    const realSessionDir = join(paths.SESSIONS_DIR, sessionId);
    const realCompactingPath = paths.session.compacting(sessionId);
    mkdirSync(realSessionDir, { recursive: true });
    writeFileSync(realCompactingPath, '', 'utf8');

    const projectRoot = tempDirs.root;
    // 不建立 compact-recovery.md

    const result = _checkCompactRecovery(sessionId, projectRoot);

    // 無 recovery 內容
    expect(result).toBeNull();
    // compacting 標記仍應被清理
    expect(existsSync(realCompactingPath)).toBe(false);

    // 清理真實 session 目錄
    try { rmSync(realSessionDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  });
});

describe('handleOnSubmit — compact recovery 注入', () => {
  let sessionId;

  beforeEach(() => {
    sessionId = 'test-submit-compact-' + Date.now();
    const realSessionDir = join(paths.SESSIONS_DIR, sessionId);
    mkdirSync(realSessionDir, { recursive: true });
  });

  afterEach(() => {
    // 清理真實 session 目錄
    const realSessionDir = join(paths.SESSIONS_DIR, sessionId);
    try { rmSync(realSessionDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  });

  it('Scenario 4: compact 後首次 submit WHEN compacting 標記存在 THEN additionalContext 包含 recovery 內容', () => {
    // 設置 compacting 標記
    const realCompactingPath = paths.session.compacting(sessionId);
    writeFileSync(realCompactingPath, '', 'utf8');

    // 設置 compact-recovery.md
    const projectRoot = process.cwd();
    const realGlobalDir = paths.global.dir(projectRoot);
    mkdirSync(realGlobalDir, { recursive: true });
    const realRecoveryPath = join(realGlobalDir, 'compact-recovery.md');
    const recoveryContent = '[Overtone 狀態恢復（compact 後）]\n工作流：quick\n進度：✅ (1/2)';
    writeFileSync(realRecoveryPath, recoveryContent, 'utf8');

    const input = {
      session_id: sessionId,
      prompt: '繼續執行',
      cwd: projectRoot,
    };

    const result = handleOnSubmit(input);

    expect(result.hookSpecificOutput?.additionalContext).toContain('[Overtone 狀態恢復（compact 後）]');
    expect(result.hookSpecificOutput?.additionalContext).toContain('工作流：quick');

    // 清理
    try { rmSync(realRecoveryPath); } catch { /* 忽略 */ }
  });

  it('Scenario 5: 無 compacting 標記 WHEN handleOnSubmit THEN 正常流程（不注入 recovery 內容）', () => {
    const projectRoot = process.cwd();

    const input = {
      session_id: sessionId,
      prompt: '繼續執行',
      cwd: projectRoot,
    };

    const result = handleOnSubmit(input);

    // 不應包含 recovery 標頭
    const ctx = result.hookSpecificOutput?.additionalContext || result.systemMessage || '';
    expect(ctx).not.toContain('[Overtone 狀態恢復（compact 後）]');
  });
});
