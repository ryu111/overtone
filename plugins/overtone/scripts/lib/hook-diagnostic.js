'use strict';
/**
 * hook-diagnostic.js — Hook 系統自我診斷模組
 *
 * 自動診斷 hook 系統的健康狀態，驗證：
 *
 * Check 1: script-exists — hooks.json 引用的所有 script 路徑都實際存在
 * Check 2: script-executable — 所有 hook script 都有 +x 執行權限
 * Check 3: dependency-check — 每個 hook script 的 require() 引用的模組都存在
 * Check 4: hooks-json-format — hooks.json 使用正確的三層嵌套格式
 * Check 5: event-coverage — registry.js hookEvents 中每個事件至少有一個 handler
 *
 * API：
 *   runDiagnostic(options?)  → { checks, summary: { total, pass, fail, warn } }
 */

const { existsSync, readFileSync, accessSync, constants } = require('fs');
const { join, resolve, dirname } = require('path');

// ── 預設路徑解析 ──────────────────────────────────────────────────────────

/**
 * 解析路徑，支援完整注入（測試用）
 * @param {object} [injected] - 注入的路徑覆蓋
 * @returns {object} 完整路徑集合
 */
function resolvePaths(injected = {}) {
  const pluginRoot = injected.pluginRoot || join(__dirname, '..', '..');
  return {
    pluginRoot,
    hooksJsonPath:  injected.hooksJsonPath  || join(pluginRoot, 'hooks', 'hooks.json'),
    hooksScriptsDir: injected.hooksScriptsDir || join(pluginRoot, 'hooks', 'scripts'),
    hookEventsRef:  injected.hookEventsRef  || null, // null → 從 registry.js 載入
  };
}

/**
 * 取得合法 hookEvents 清單
 * @param {object} paths
 * @returns {string[]}
 */
function getHookEvents(paths) {
  if (paths.hookEventsRef) return paths.hookEventsRef;
  try {
    const { hookEvents } = require('./registry');
    return hookEvents;
  } catch (_) {
    return [];
  }
}

// ── JSON 讀取工具 ──────────────────────────────────────────────────────────

/**
 * 讀取並解析 JSON 檔案，失敗回傳 null
 * @param {string} filePath
 * @returns {*|null}
 */
function safeReadJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

// ── Script 路徑提取 ──────────────────────────────────────────────────────

/**
 * 從 ${CLAUDE_PLUGIN_ROOT}/... 格式的命令路徑取得實際路徑
 * @param {string} command - hooks.json 中的 command 字串
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {string|null} 解析後的絕對路徑，失敗回傳 null
 */
function resolveCommandPath(command, pluginRoot) {
  if (!command || typeof command !== 'string') return null;
  // 替換 ${CLAUDE_PLUGIN_ROOT} 佔位符
  const resolved = command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot);
  return resolve(resolved);
}

/**
 * 從 hooks.json 資料中提取所有 script 路徑（相對於 pluginRoot）
 * @param {object} hooksData - 解析後的 hooks.json 物件
 * @param {string} pluginRoot - plugin 根目錄
 * @returns {Array<{event: string, scriptPath: string}>}
 */
function extractScriptPaths(hooksData, pluginRoot) {
  const results = [];
  if (!hooksData || typeof hooksData.hooks !== 'object') return results;

  for (const [eventName, handlers] of Object.entries(hooksData.hooks)) {
    if (!Array.isArray(handlers)) continue;
    for (const handler of handlers) {
      if (!handler.hooks || !Array.isArray(handler.hooks)) continue;
      for (const hookEntry of handler.hooks) {
        if (hookEntry.command) {
          const scriptPath = resolveCommandPath(hookEntry.command, pluginRoot);
          if (scriptPath) {
            results.push({ event: eventName, scriptPath });
          }
        }
      }
    }
  }
  return results;
}

// ── Check 1: script-exists ────────────────────────────────────────────────

/**
 * 檢查 hooks.json 引用的所有 script 是否實際存在
 * @param {object} hooksData
 * @param {string} pluginRoot
 * @returns {Array<{name, target, status, message?}>}
 */
function checkScriptExists(hooksData, pluginRoot) {
  const entries = extractScriptPaths(hooksData, pluginRoot);
  if (entries.length === 0) {
    return [{ name: 'script-exists', target: 'hooks.json', status: 'warn', message: '找不到任何 script 路徑' }];
  }

  const seen = new Set();
  const checks = [];

  for (const { scriptPath } of entries) {
    const shortName = scriptPath.replace(pluginRoot, '').replace(/^\//, '');
    if (seen.has(scriptPath)) continue;
    seen.add(scriptPath);

    const exists = existsSync(scriptPath);
    checks.push({
      name: 'script-exists',
      target: shortName,
      status: exists ? 'pass' : 'fail',
      ...(exists ? {} : { message: `找不到檔案：${scriptPath}` }),
    });
  }

  return checks;
}

// ── Check 2: script-executable ────────────────────────────────────────────

/**
 * 檢查所有 hook script 的執行權限
 * @param {object} hooksData
 * @param {string} pluginRoot
 * @returns {Array<{name, target, status, message?}>}
 */
function checkScriptExecutable(hooksData, pluginRoot) {
  const entries = extractScriptPaths(hooksData, pluginRoot);
  if (entries.length === 0) return [];

  const seen = new Set();
  const checks = [];

  for (const { scriptPath } of entries) {
    const shortName = scriptPath.replace(pluginRoot, '').replace(/^\//, '');
    if (seen.has(scriptPath)) continue;
    seen.add(scriptPath);

    // 若檔案不存在，跳過（由 script-exists 報告）
    if (!existsSync(scriptPath)) continue;

    let executable = false;
    try {
      accessSync(scriptPath, constants.X_OK);
      executable = true;
    } catch (_) {
      executable = false;
    }

    checks.push({
      name: 'script-executable',
      target: shortName,
      status: executable ? 'pass' : 'fail',
      ...(executable ? {} : { message: `缺少執行權限：${scriptPath}` }),
    });
  }

  return checks;
}

// ── Check 3: dependency-check ─────────────────────────────────────────────

/**
 * 從 JS 檔案內容中提取所有 require() 的路徑（只提取相對路徑）
 * @param {string} content - JS 檔案內容
 * @returns {string[]} 相對路徑清單
 */
function extractRequirePaths(content) {
  const paths = [];
  // 匹配 require('./...')、require('../...')
  const re = /require\(['"](\.[^'"]+)['"]\)/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

/**
 * 檢查所有 hook script 的 require() 依賴是否存在
 * @param {object} hooksData
 * @param {string} pluginRoot
 * @returns {Array<{name, target, status, message?}>}
 */
function checkDependencies(hooksData, pluginRoot) {
  const entries = extractScriptPaths(hooksData, pluginRoot);
  if (entries.length === 0) return [];

  const seen = new Set();
  const checks = [];

  for (const { scriptPath } of entries) {
    const shortName = scriptPath.replace(pluginRoot, '').replace(/^\//, '');
    if (seen.has(scriptPath)) continue;
    seen.add(scriptPath);

    if (!existsSync(scriptPath)) continue;

    let content;
    try {
      content = readFileSync(scriptPath, 'utf8');
    } catch (_) {
      continue;
    }

    const requirePaths = extractRequirePaths(content);
    const scriptDir = dirname(scriptPath);
    const missingDeps = [];

    for (const reqPath of requirePaths) {
      // 嘗試解析：先加 .js，再嘗試直接路徑，再嘗試 /index.js
      const absBase = resolve(scriptDir, reqPath);
      const candidates = [
        absBase,
        absBase + '.js',
        join(absBase, 'index.js'),
      ];
      const found = candidates.some(c => existsSync(c));
      if (!found) {
        missingDeps.push(reqPath);
      }
    }

    checks.push({
      name: 'dependency-check',
      target: shortName,
      status: missingDeps.length === 0 ? 'pass' : 'fail',
      ...(missingDeps.length === 0 ? {} : { message: `缺少依賴：${missingDeps.join(', ')}` }),
    });
  }

  return checks;
}

// ── Check 4: hooks-json-format ────────────────────────────────────────────

/**
 * 驗證 hooks.json 使用正確的三層嵌套格式：
 * { hooks: { EventName: [{ matcher?, hooks: [{ type, command }] }] } }
 * @param {object} hooksData
 * @returns {{name, target, status, message?}}
 */
function checkHooksJsonFormat(hooksData) {
  if (!hooksData) {
    return { name: 'hooks-json-format', target: 'hooks.json', status: 'fail', message: '無法解析 hooks.json' };
  }

  // 頂層必須有 hooks 物件
  if (typeof hooksData.hooks !== 'object' || Array.isArray(hooksData.hooks)) {
    return {
      name: 'hooks-json-format',
      target: 'hooks.json',
      status: 'fail',
      message: '頂層必須有 hooks 物件（非陣列）',
    };
  }

  // 每個事件的 handlers 必須是陣列
  for (const [eventName, handlers] of Object.entries(hooksData.hooks)) {
    if (!Array.isArray(handlers)) {
      return {
        name: 'hooks-json-format',
        target: 'hooks.json',
        status: 'fail',
        message: `事件 ${eventName} 的 handlers 必須是陣列`,
      };
    }

    // 每個 handler 必須有 hooks 陣列（第二層）
    for (let i = 0; i < handlers.length; i++) {
      const handler = handlers[i];
      if (typeof handler !== 'object' || handler === null) {
        return {
          name: 'hooks-json-format',
          target: 'hooks.json',
          status: 'fail',
          message: `事件 ${eventName}[${i}] 必須是物件`,
        };
      }

      if (!Array.isArray(handler.hooks)) {
        return {
          name: 'hooks-json-format',
          target: 'hooks.json',
          status: 'fail',
          message: `事件 ${eventName}[${i}].hooks 必須是陣列（三層嵌套格式）`,
        };
      }

      // 第三層：每個 hook entry 必須有 type 和 command
      for (let j = 0; j < handler.hooks.length; j++) {
        const entry = handler.hooks[j];
        if (!entry.type || !entry.command) {
          return {
            name: 'hooks-json-format',
            target: 'hooks.json',
            status: 'fail',
            message: `事件 ${eventName}[${i}].hooks[${j}] 必須有 type 和 command`,
          };
        }
      }
    }
  }

  return { name: 'hooks-json-format', target: 'hooks.json', status: 'pass' };
}

// ── Check 5: event-coverage ───────────────────────────────────────────────

/**
 * 驗證 registry.js hookEvents 中每個事件至少有一個 handler
 * @param {object} hooksData
 * @param {string[]} hookEvents
 * @returns {Array<{name, target, status, message?}>}
 */
function checkEventCoverage(hooksData, hookEvents) {
  if (!hookEvents || hookEvents.length === 0) {
    return [{ name: 'event-coverage', target: 'hookEvents', status: 'warn', message: '無法取得 hookEvents 清單' }];
  }

  const definedEvents = hooksData && typeof hooksData.hooks === 'object'
    ? new Set(Object.keys(hooksData.hooks))
    : new Set();

  return hookEvents.map(eventName => ({
    name: 'event-coverage',
    target: eventName,
    status: definedEvents.has(eventName) ? 'pass' : 'fail',
    ...(definedEvents.has(eventName) ? {} : { message: `事件 ${eventName} 未在 hooks.json 中定義 handler` }),
  }));
}

// ── 主診斷入口 ────────────────────────────────────────────────────────────

/**
 * 執行完整的 hook 系統診斷
 * @param {object} [options]
 * @param {object} [options.paths] - 路徑注入（測試用）
 * @returns {{ checks: Array, summary: { total, pass, fail, warn } }}
 */
function runDiagnostic(options = {}) {
  const paths = resolvePaths(options.paths || {});
  const hooksData = safeReadJson(paths.hooksJsonPath);
  const hookEvents = getHookEvents(paths);

  const allChecks = [
    ...checkScriptExists(hooksData, paths.pluginRoot),
    ...checkScriptExecutable(hooksData, paths.pluginRoot),
    ...checkDependencies(hooksData, paths.pluginRoot),
    checkHooksJsonFormat(hooksData),
    ...checkEventCoverage(hooksData, hookEvents),
  ];

  const summary = {
    total: allChecks.length,
    pass:  allChecks.filter(c => c.status === 'pass').length,
    fail:  allChecks.filter(c => c.status === 'fail').length,
    warn:  allChecks.filter(c => c.status === 'warn').length,
  };

  return { checks: allChecks, summary };
}

module.exports = {
  runDiagnostic,
  // 匯出子函式供單元測試使用
  extractScriptPaths,
  extractRequirePaths,
  checkScriptExists,
  checkScriptExecutable,
  checkDependencies,
  checkHooksJsonFormat,
  checkEventCoverage,
};
