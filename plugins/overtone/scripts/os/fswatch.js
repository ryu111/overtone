'use strict';
/**
 * fswatch.js — macOS 檔案系統監控能力
 *
 * 提供監控路徑（watchPath）、停止監控（stopWatch）、列出監控器（listWatchers）三種功能。
 * 僅 watchPath 需要 macOS（darwin），stopWatch/listWatchers 為純記憶體操作可跨平台。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 *
 * 依賴注入：watchPath 最後一個參數 _deps = { watch } 供測試替換。
 */

const { watch: defaultWatch } = require('fs');

// module-level 狀態：儲存所有活躍的 watcher
// key: watcherId (string)
// value: { watcher: FSWatcher, path: string, startedAt: string }
const _watchers = new Map();

// 統一 response 建構工具
function ok(fields) {
  return { ok: true, ...fields };
}

function fail(error, message) {
  return { ok: false, error, message };
}

/**
 * 開始監控指定路徑
 * @param {string} targetPath - 要監控的路徑
 * @param {Function} callback - 事件回呼（接收 WatchEvent）
 * @param {object} [_deps]
 * @param {Function} [_deps.watch] - fs.watch 的替換注入點（供測試使用）
 * @returns {{ ok: true, watcherId: string }
 *           |{ ok: false, error: string, message: string }}
 */
function watchPath(targetPath, callback, _deps = {}) {
  // platform guard：僅支援 macOS
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  // 參數驗證：targetPath 必須為非空字串
  if (targetPath === null || targetPath === undefined || typeof targetPath !== 'string' || targetPath === '') {
    return fail('INVALID_ARGUMENT', 'targetPath 必須為非空字串');
  }

  // 參數驗證：callback 必須為 function
  if (typeof callback !== 'function') {
    return fail('INVALID_ARGUMENT', 'callback 必須為 function 型別');
  }

  // 產生唯一 watcherId
  const watcherId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const watchFn = _deps.watch || defaultWatch;

  let watcher;
  try {
    watcher = watchFn(targetPath, (eventType, filename) => {
      callback({
        watcherId,
        path: targetPath,
        eventType,
        filename,
        timestamp: new Date().toISOString(),
      });
    });
  } catch (err) {
    return fail('COMMAND_FAILED', `fs.watch 啟動失敗：${err.message}`);
  }

  _watchers.set(watcherId, {
    watcher,
    path: targetPath,
    startedAt: new Date().toISOString(),
  });

  return ok({ watcherId });
}

/**
 * 停止指定 watcherId 的監控
 * @param {string} watcherId - 要停止的 watcher ID
 * @returns {{ ok: true }
 *           |{ ok: false, error: string, message: string }}
 */
function stopWatch(watcherId) {
  const entry = _watchers.get(watcherId);

  if (!entry) {
    return fail('WATCHER_NOT_FOUND', `找不到 watcherId: ${watcherId}`);
  }

  entry.watcher.close();
  _watchers.delete(watcherId);

  return ok({});
}

/**
 * 列出所有活躍的監控器
 * @returns {{ ok: true, watchers: WatcherEntry[] }}
 */
function listWatchers() {
  const watchers = Array.from(_watchers.entries()).map(([id, entry]) => ({
    id,
    path: entry.path,
    startedAt: entry.startedAt,
  }));

  return ok({ watchers });
}

/**
 * 重設模組狀態（僅供測試使用）
 * 關閉所有 watcher 並清空 Map
 */
function _resetForTest() {
  for (const [, entry] of _watchers) {
    try {
      entry.watcher.close();
    } catch {
      // 靜默忽略關閉失敗
    }
  }
  _watchers.clear();
}

module.exports = {
  watchPath,
  stopWatch,
  listWatchers,
  _resetForTest,
};
