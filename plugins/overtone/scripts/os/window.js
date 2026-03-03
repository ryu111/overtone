'use strict';
/**
 * window.js — macOS 視窗 / 進程管理
 *
 * 提供進程列表、視窗列表、App 聚焦、前景 App 查詢、Accessibility 權限偵測。
 * 僅支援 macOS（darwin），其他平台回傳 UNSUPPORTED_PLATFORM。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 *
 * 依賴注入：最後一個參數 _deps = { execSync } 供測試替換。
 */

const { execSync: defaultExecSync } = require('child_process');

/**
 * 清理 appName，防止 AppleScript injection
 * 將反斜線和雙引號進行跳脫，確保嵌入 AppleScript 字串時安全
 *
 * @param {string} appName
 * @returns {string}
 */
function sanitizeAppName(appName) {
  return String(appName).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// 統一 response 建構工具
function ok(fields) {
  return { ok: true, ...fields };
}

function fail(error, message) {
  return { ok: false, error, message };
}

/**
 * 判斷 osascript 錯誤是否含 Accessibility 相關訊息
 */
function isAccessibilityError(err) {
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('not authorized') ||
    msg.includes('accessibility') ||
    msg.includes('assistive') ||
    msg.includes('is not allowed assistive') ||
    msg.includes('permission denied')
  );
}

// ── 視窗 / 進程函式 ──

/**
 * 列出所有運行中的進程
 * 使用 AppleScript 取得 System Events 進程列表
 *
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, processes: Array<{ pid: number, name: string, visible: boolean }> }
 *           |{ ok: false, error: string, message: string }}
 */
function listProcesses(_deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;

  // AppleScript：取得進程名稱、pid（Unix ID）和 visible 狀態
  const script = `
    set output to ""
    tell application "System Events"
      set procs to every application process
      repeat with p in procs
        try
          set pName to name of p
          set pPid to unix id of p
          set pVisible to visible of p
          if pVisible then
            set visStr to "true"
          else
            set visStr to "false"
          end if
          set output to output & pName & "\t" & pPid & "\t" & visStr & "\n"
        end try
      end repeat
    end tell
    return output
  `.trim();

  let raw;
  try {
    raw = execSync(`osascript -e '${script}'`, { stdio: 'pipe', encoding: 'utf8' });
  } catch (err) {
    return fail('COMMAND_FAILED', `osascript 失敗：${err.message}`);
  }

  if (typeof raw !== 'string') {
    raw = String(raw);
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return fail('OSASCRIPT_PARSE_ERROR', 'osascript 回傳空輸出，無法解析進程列表');
  }

  const processes = [];
  for (const line of trimmed.split('\n')) {
    const parts = line.trim().split('\t');
    if (parts.length < 2) continue;
    const [name, pidStr, visibleStr] = parts;
    const pid = parseInt(pidStr, 10);
    if (!name || isNaN(pid)) continue;
    processes.push({
      pid,
      name: name.trim(),
      visible: visibleStr === 'true',
    });
  }

  if (processes.length === 0) {
    return fail('OSASCRIPT_PARSE_ERROR', '無法從 osascript 輸出解析出任何進程');
  }

  return ok({ processes });
}

/**
 * 列出指定 App 的所有視窗
 * 需要 Accessibility 權限
 *
 * @param {string} appName - App 名稱（如 'Safari'）
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, windows: Array<{ app: string, title: string }> }
 *           |{ ok: false, error: string, message: string }}
 */
function listWindows(appName, _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;

  const safeAppName = sanitizeAppName(appName);
  const script = `
    set output to ""
    tell application "System Events"
      tell application process "${safeAppName}"
        set wins to every window
        repeat with w in wins
          try
            set wTitle to name of w
            set output to output & "${safeAppName}" & "\t" & wTitle & "\n"
          end try
        end repeat
      end tell
    end tell
    return output
  `.trim();

  let raw;
  try {
    raw = execSync(`osascript -e '${script}'`, { stdio: 'pipe', encoding: 'utf8' });
  } catch (err) {
    if (isAccessibilityError(err)) {
      return fail('PERMISSION_DENIED', `Accessibility 權限未授予：${err.message}`);
    }
    return fail('COMMAND_FAILED', `osascript 失敗：${err.message}`);
  }

  if (typeof raw !== 'string') {
    raw = String(raw);
  }

  const trimmed = raw.trim();

  // 空輸出視為成功（該 App 沒有視窗）
  if (!trimmed) {
    return ok({ windows: [] });
  }

  const windows = [];
  for (const line of trimmed.split('\n')) {
    const tabIdx = line.indexOf('\t');
    if (tabIdx === -1) {
      // 無 tab 分隔，無法解析
      return fail('OSASCRIPT_PARSE_ERROR', `無法解析視窗資訊格式：${line}`);
    }
    const app = line.slice(0, tabIdx).trim();
    const title = line.slice(tabIdx + 1).trim();
    windows.push({ app, title });
  }

  return ok({ windows });
}

/**
 * 將指定 App 帶到前景（activate）
 *
 * @param {string} appName - App 名稱（如 'Safari'）
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true }
 *           |{ ok: false, error: string, message: string }}
 */
function focusApp(appName, _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;

  const safeAppName = sanitizeAppName(appName);
  const script = `tell application "${safeAppName}" to activate`;

  try {
    execSync(`osascript -e '${script}'`, { stdio: 'pipe' });
    return ok({});
  } catch (err) {
    return fail('COMMAND_FAILED', `osascript 失敗：${err.message}`);
  }
}

/**
 * 取得當前前景應用程式名稱和視窗標題
 *
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, app: string, window: string|null }
 *           |{ ok: false, error: string, message: string }}
 */
function getFrontApp(_deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;

  // 取得前景 App 名稱和第一個視窗標題
  const script = `
    set frontApp to name of first application process whose frontmost is true of application "System Events"
    set winTitle to ""
    try
      tell application frontApp
        set winTitle to name of front window
      end tell
    end try
    return frontApp & "\t" & winTitle
  `.trim();

  let raw;
  try {
    raw = execSync(`osascript -e '${script}'`, { stdio: 'pipe', encoding: 'utf8' });
  } catch (err) {
    return fail('COMMAND_FAILED', `osascript 失敗：${err.message}`);
  }

  if (typeof raw !== 'string') {
    raw = String(raw);
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return fail('OSASCRIPT_PARSE_ERROR', 'osascript 回傳空輸出，無法取得前景 App');
  }

  const tabIdx = trimmed.indexOf('\t');
  if (tabIdx === -1) {
    // 只有 App 名稱，沒有視窗標題
    const appName = trimmed.trim();
    if (!appName) {
      return fail('OSASCRIPT_PARSE_ERROR', '無法解析 App 名稱');
    }
    return ok({ app: appName, window: null });
  }

  const appName = trimmed.slice(0, tabIdx).trim();
  const windowTitle = trimmed.slice(tabIdx + 1).trim();

  if (!appName) {
    return fail('OSASCRIPT_PARSE_ERROR', '無法解析 App 名稱');
  }

  return ok({
    app: appName,
    window: windowTitle || null,
  });
}

/**
 * 偵測 Accessibility 權限
 * 使用 osascript 嘗試讀取 System Events 進程，根據結果判斷權限狀態
 *
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, hasPermission: boolean }
 *           |{ ok: false, error: string, message: string }}
 */
function checkAccessibility(_deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;

  // 嘗試執行需要 Accessibility 的 osascript 操作
  const script = `
    tell application "System Events"
      set testResult to count of application processes
    end tell
    return testResult
  `.trim();

  try {
    execSync(`osascript -e '${script}'`, { stdio: 'pipe' });
    return ok({ hasPermission: true });
  } catch (err) {
    if (isAccessibilityError(err)) {
      return ok({ hasPermission: false });
    }
    // 其他錯誤也視為無權限（保守策略）
    return ok({ hasPermission: false });
  }
}

module.exports = {
  listProcesses,
  listWindows,
  focusApp,
  getFrontApp,
  checkAccessibility,
};
