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

// ── project root（per-project API）──

const PROJECT_ROOT = process.cwd();

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

  beforeEach(() => {
    tempDirs = makeTempDirs();
    sessionId = 'test-session-compactrecovery-' + Date.now();
    sessionDir = join(tempDirs.sessionsDir, sessionId);
    mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    tempDirs.cleanup();
  });

  it('Scenario 1: compact-recovery.md 存在（不依賴 compacting 標記）→ 回傳 recovery 內容並清理', () => {
    // 注意：不需要建立 compacting 標記，compact-recovery.md 是主要偵測依據
    const recoveryContent = '[Overtone 狀態恢復（compact 後）]\n工作流：quick\n進度：✅ (1/2)';

    // 建立真實 session 目錄（paths 模組讀取）
    const realSessionDir = paths.sessionDir(PROJECT_ROOT, sessionId);
    const realCompactingPath = paths.session.compacting(PROJECT_ROOT, sessionId);
    mkdirSync(realSessionDir, { recursive: true });

    // 建立真實 projectRoot 對應的 global dir + compact-recovery.md
    const projectRoot = tempDirs.root;
    const realGlobalDir = paths.global.dir(projectRoot);
    mkdirSync(realGlobalDir, { recursive: true });
    const realRecoveryPath = join(realGlobalDir, 'compact-recovery.md');
    writeFileSync(realRecoveryPath, recoveryContent, 'utf8');

    const result = _checkCompactRecovery(sessionId, projectRoot);

    expect(result).toBe(recoveryContent);
    // compacting 標記本來就不存在，確認沒有因此報錯（call 仍正常完成）
    expect(existsSync(realCompactingPath)).toBe(false);
    // 確認 compact-recovery.md 已清理
    expect(existsSync(realRecoveryPath)).toBe(false);

    // 清理真實 session 目錄（避免污染）
    try { rmSync(realSessionDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  });

  it('Scenario 2: compacting 標記和 compact-recovery.md 都不存在 → 回傳 null（正常流程）', () => {
    // 不建立任何標記或 recovery 檔案
    const projectRoot = tempDirs.root;

    const result = _checkCompactRecovery(sessionId, projectRoot);

    expect(result).toBeNull();
  });

  it('Scenario 3: 只有 compacting 標記存在但 compact-recovery.md 不存在 → 清理標記並回傳 null', () => {
    const projectRoot = tempDirs.root;
    const testSessionDir = paths.sessionDir(projectRoot, sessionId);
    const compactingPath = paths.session.compacting(projectRoot, sessionId);
    mkdirSync(testSessionDir, { recursive: true });
    // 建立 compacting 標記（但無 compact-recovery.md）
    writeFileSync(compactingPath, '', 'utf8');

    const result = _checkCompactRecovery(sessionId, projectRoot);

    // 無 recovery 內容
    expect(result).toBeNull();
    // compacting 殘留標記應被清理
    expect(existsSync(compactingPath)).toBe(false);
  });

  it('Scenario 4（競態修復）: compacting 標記已被 statusline 搶先刪除，但 compact-recovery.md 仍存在 → 仍能 recovery', () => {
    // 模擬競態：statusline 先執行並刪除了 compacting 標記，但 compact-recovery.md 還在
    // compacting 標記刻意不建立（代表已被 statusline 刪除）
    const recoveryContent = '[Overtone 狀態恢復（compact 後）]\n工作流：standard\n進度：✅✅ (2/3)';

    const realSessionDir = join(paths.SESSIONS_DIR, sessionId);
    mkdirSync(realSessionDir, { recursive: true });

    const projectRoot = tempDirs.root;
    const realGlobalDir = paths.global.dir(projectRoot);
    mkdirSync(realGlobalDir, { recursive: true });
    const realRecoveryPath = join(realGlobalDir, 'compact-recovery.md');
    writeFileSync(realRecoveryPath, recoveryContent, 'utf8');

    const result = _checkCompactRecovery(sessionId, projectRoot);

    // 競態下仍能正確 recovery
    expect(result).toBe(recoveryContent);
    // compact-recovery.md 應已清理
    expect(existsSync(realRecoveryPath)).toBe(false);

    // 清理真實 session 目錄
    try { rmSync(realSessionDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  });
});

describe('handleOnSubmit — compact recovery 注入', () => {
  let sessionId;

  beforeEach(() => {
    sessionId = 'test-submit-compact-' + Date.now();
    const realSessionDir = paths.sessionDir(PROJECT_ROOT, sessionId);
    mkdirSync(realSessionDir, { recursive: true });
  });

  afterEach(() => {
    // 清理真實 session 目錄
    const realSessionDir = paths.sessionDir(PROJECT_ROOT, sessionId);
    try { rmSync(realSessionDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  });

  it('Scenario 5: compact 後首次 submit WHEN compact-recovery.md 存在 THEN additionalContext 包含 recovery 內容', () => {
    // 設置 compact-recovery.md（不需要 compacting 標記）
    const projectRoot = PROJECT_ROOT;
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

  it('Scenario 6: 無 compact-recovery.md WHEN handleOnSubmit THEN 正常流程（不注入 recovery 內容）', () => {
    const projectRoot = PROJECT_ROOT;

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
