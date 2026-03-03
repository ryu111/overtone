'use strict';
/**
 * screenshot.js — macOS 截圖能力
 *
 * 提供全螢幕截圖、區域截圖、視窗截圖三種模式，以及 Screen Recording 權限偵測。
 * 僅支援 macOS（darwin），其他平台回傳 UNSUPPORTED_PLATFORM。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 *
 * 依賴注入：最後一個參數 _deps = { execSync } 供測試替換。
 */

const { execSync: defaultExecSync } = require('child_process');
const { mkdirSync, existsSync, unlinkSync, statSync } = require('fs');
const path = require('path');

// 截圖暫存目錄
const SCREENSHOT_DIR = '/tmp/overtone-screenshots';

// 統一 response 建構工具
function ok(fields) {
  return { ok: true, ...fields };
}

function fail(error, message) {
  return { ok: false, error, message };
}

/**
 * 產生截圖路徑
 * @param {string} type - 'full' | 'region' | 'window'
 * @param {string} [outputPath] - 自訂路徑（覆蓋預設）
 * @returns {string}
 */
function buildPath(type, outputPath) {
  if (outputPath) return outputPath;
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const timestamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-` +
    `${pad(now.getMilliseconds(), 3)}`;
  return path.join(SCREENSHOT_DIR, `screenshot-${type}-${timestamp}.png`);
}

/**
 * 確保截圖目錄存在
 */
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 判斷 screencapture 錯誤是否為 PERMISSION_DENIED
 * 只有明確含有 Screen Recording 相關拒絕訊息時才判定為 PERMISSION_DENIED；
 * 其餘 execSync 錯誤（exit code 非 0、一般指令失敗）歸為 COMMAND_FAILED。
 */
function isPermissionError(err) {
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('could not create image') ||
    msg.includes('authorization denied') ||
    msg.includes('screen recording') ||
    msg.includes('not authorized to capture screen')
  );
}

// ── 截圖函式 ──

/**
 * 全螢幕截圖
 * @param {object} [opts]
 * @param {string} [opts.outputPath] - 自訂輸出路徑
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, path: string, type: string, timestamp: string }
 *           |{ ok: false, error: string, message: string }}
 */
function captureFullScreen(opts = {}, _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;
  const outputPath = buildPath('full', opts.outputPath);

  try {
    ensureDir(path.dirname(outputPath));
    execSync(`screencapture -x "${outputPath}"`, { stdio: 'pipe' });
    return ok({ path: outputPath, type: 'full', timestamp: new Date().toISOString() });
  } catch (err) {
    if (isPermissionError(err)) {
      return fail('PERMISSION_DENIED', `Screen Recording 權限未授予：${err.message}`);
    }
    return fail('COMMAND_FAILED', `screencapture 失敗：${err.message}`);
  }
}

/**
 * 區域截圖
 * @param {{ x: number, y: number, width: number, height: number }} region
 * @param {object} [opts]
 * @param {string} [opts.outputPath]
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {OsResult}
 */
function captureRegion(region, opts = {}, _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  if (
    !region ||
    region.x === undefined || region.x === null ||
    region.y === undefined || region.y === null ||
    region.width === undefined || region.width === null ||
    region.height === undefined || region.height === null
  ) {
    return fail('INVALID_ARGUMENT', 'region 必須包含 x、y、width、height 欄位');
  }

  const execSync = _deps.execSync || defaultExecSync;
  const outputPath = buildPath('region', opts.outputPath);

  try {
    ensureDir(path.dirname(outputPath));
    const { x, y, width, height } = region;
    execSync(`screencapture -x -R ${x},${y},${width},${height} "${outputPath}"`, { stdio: 'pipe' });
    return ok({ path: outputPath, type: 'region', timestamp: new Date().toISOString() });
  } catch (err) {
    if (isPermissionError(err)) {
      return fail('PERMISSION_DENIED', `Screen Recording 權限未授予：${err.message}`);
    }
    return fail('COMMAND_FAILED', `screencapture 失敗：${err.message}`);
  }
}

/**
 * 視窗截圖（依 CGWindowID）
 * @param {number|null} windowId - CGWindowID（整數）
 * @param {object} [opts]
 * @param {string} [opts.outputPath]
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {OsResult}
 */
function captureWindow(windowId, opts = {}, _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  if (windowId === null || windowId === undefined) {
    return fail('INVALID_ARGUMENT', 'windowId 不可為 null 或 undefined');
  }

  const execSync = _deps.execSync || defaultExecSync;
  const outputPath = buildPath('window', opts.outputPath);

  try {
    ensureDir(path.dirname(outputPath));
    execSync(`screencapture -x -l ${windowId} "${outputPath}"`, { stdio: 'pipe' });
    return ok({ path: outputPath, type: 'window', timestamp: new Date().toISOString() });
  } catch (err) {
    if (isPermissionError(err)) {
      return fail('PERMISSION_DENIED', `Screen Recording 權限未授予：${err.message}`);
    }
    return fail('COMMAND_FAILED', `screencapture 失敗：${err.message}`);
  }
}

/**
 * 偵測 Screen Recording 權限
 * 嘗試截圖到 /tmp/overtone-perm-test.png，成功→ hasPermission: true
 * 失敗（exit code != 0 或檔案極小）→ hasPermission: false
 *
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, hasPermission: boolean }
 *           |{ ok: false, error: string, message: string }}
 */
function checkPermission(_deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;
  const testPath = '/tmp/overtone-perm-test.png';

  try {
    execSync(`screencapture -x "${testPath}"`, { stdio: 'pipe' });

    // 確認檔案存在且有合理大小（> 100 bytes）
    let hasPermission = false;
    try {
      const stat = statSync(testPath);
      hasPermission = stat.size > 100;
    } catch {
      hasPermission = false;
    }

    // 清理測試檔
    try { unlinkSync(testPath); } catch { /* 忽略 */ }

    return ok({ hasPermission });
  } catch (err) {
    // 清理測試檔（若存在）
    try { unlinkSync(testPath); } catch { /* 忽略 */ }
    return ok({ hasPermission: false });
  }
}

module.exports = {
  captureFullScreen,
  captureRegion,
  captureWindow,
  checkPermission,
};
