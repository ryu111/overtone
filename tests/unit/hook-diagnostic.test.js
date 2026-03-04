'use strict';
/**
 * hook-diagnostic.test.js — Hook 系統自我診斷模組單元測試
 *
 * 覆蓋：
 *   Feature 1: extractScriptPaths — 從 hooks.json 提取 script 路徑
 *   Feature 2: extractRequirePaths — 從 JS 內容提取 require 路徑
 *   Feature 3: checkScriptExists — script 存在性檢查
 *   Feature 4: checkScriptExecutable — script 執行權限檢查
 *   Feature 5: checkDependencies — script 依賴檢查
 *   Feature 6: checkHooksJsonFormat — hooks.json 格式驗證
 *   Feature 7: checkEventCoverage — event 覆蓋率檢查
 *   Feature 8: runDiagnostic — 整合診斷入口
 *   Feature 9: 真實 codebase 健康驗證
 */

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const { join } = require('path');
const os = require('os');

const { PLUGIN_ROOT, SCRIPTS_LIB } = require('../helpers/paths');

const {
  runDiagnostic,
  extractScriptPaths,
  extractRequirePaths,
  checkScriptExists,
  checkScriptExecutable,
  checkDependencies,
  checkHooksJsonFormat,
  checkEventCoverage,
} = require(join(SCRIPTS_LIB, 'analyzers/hook-diagnostic'));

// ── 沙盒工具 ──────────────────────────────────────────────────────────────

let tmpDir;

function setupSandbox() {
  tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'hook-diagnostic-test-'));
  return tmpDir;
}

function teardownSandbox() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = null;
}

/**
 * 建立最小的 hook 沙盒結構
 * @param {object} opts
 * @param {string[]} opts.scriptNames - 要建立的 script 檔名（相對於 hooks/scripts/）
 * @param {boolean} [opts.executable=true] - 是否給予執行權限
 * @param {object} [opts.hooksJson] - 直接指定 hooks.json 內容（覆蓋自動生成）
 * @param {string[]} [opts.hookEvents] - hookEvents 清單
 * @param {object} [opts.scriptContents] - { scriptName: content } 指定各 script 的內容
 * @returns {object} 沙盒路徑集合
 */
function createSandbox(opts = {}) {
  const {
    scriptNames = [],
    executable = true,
    hooksJson = null,
    hookEvents = ['SessionStart', 'SessionEnd'],
    scriptContents = {},
  } = opts;

  const pluginRoot = join(tmpDir, 'plugin');
  const hooksDir = join(pluginRoot, 'hooks');
  const scriptsDir = join(hooksDir, 'scripts');

  fs.mkdirSync(scriptsDir, { recursive: true });

  // 建立 script 檔案
  for (const name of scriptNames) {
    const scriptPath = join(scriptsDir, name);
    // 確保子目錄存在
    fs.mkdirSync(join(scriptsDir, name).replace(/\/[^/]+$/, ''), { recursive: true });
    const content = scriptContents[name] || '#!/usr/bin/env node\n\'use strict\';\n';
    fs.writeFileSync(scriptPath, content, 'utf8');
    if (executable) {
      fs.chmodSync(scriptPath, 0o755);
    } else {
      fs.chmodSync(scriptPath, 0o644);
    }
  }

  // 建立 hooks.json
  let hooksData;
  if (hooksJson !== null) {
    hooksData = hooksJson;
  } else {
    // 自動生成：每個 scriptName 對應一個 event
    const hooksObj = {};
    scriptNames.forEach((name, i) => {
      const eventName = hookEvents[i] || `Event${i}`;
      hooksObj[eventName] = [{
        hooks: [{
          type: 'command',
          command: `\${CLAUDE_PLUGIN_ROOT}/hooks/scripts/${name}`,
        }],
      }];
    });
    hooksData = { hooks: hooksObj };
  }
  fs.writeFileSync(
    join(hooksDir, 'hooks.json'),
    JSON.stringify(hooksData, null, 2),
    'utf8'
  );

  return {
    pluginRoot,
    hooksJsonPath: join(hooksDir, 'hooks.json'),
    hooksScriptsDir: scriptsDir,
    hookEventsRef: hookEvents,
  };
}

// ══════════════════════════════════════════════════════════════════
// Feature 1: extractScriptPaths
// ══════════════════════════════════════════════════════════════════

describe('extractScriptPaths', () => {
  test('正確提取標準三層嵌套格式中的 script 路徑', () => {
    const hooksData = {
      hooks: {
        SessionStart: [{
          hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session/on-start.js' }],
        }],
        SessionEnd: [{
          hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session/on-session-end.js' }],
        }],
      },
    };
    const paths = extractScriptPaths(hooksData, '/plugin-root');
    expect(paths).toHaveLength(2);
    expect(paths[0].event).toBe('SessionStart');
    expect(paths[0].scriptPath).toContain('on-start.js');
    expect(paths[1].event).toBe('SessionEnd');
    expect(paths[1].scriptPath).toContain('on-session-end.js');
  });

  test('替換 ${CLAUDE_PLUGIN_ROOT} 佔位符', () => {
    const hooksData = {
      hooks: {
        Stop: [{
          hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session/on-stop.js' }],
        }],
      },
    };
    const paths = extractScriptPaths(hooksData, '/my/plugin');
    expect(paths[0].scriptPath).toContain('/my/plugin/hooks/scripts/session/on-stop.js');
    expect(paths[0].scriptPath).not.toContain('${CLAUDE_PLUGIN_ROOT}');
  });

  test('PreToolUse 多個 handler 都被提取', () => {
    const hooksData = {
      hooks: {
        PreToolUse: [
          { matcher: 'Task', hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/tool/pre-task.js' }] },
          { matcher: 'Write', hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/tool/pre-edit-guard.js' }] },
        ],
      },
    };
    const paths = extractScriptPaths(hooksData, '/plugin');
    expect(paths).toHaveLength(2);
  });

  test('hooks 物件為空時回傳空陣列', () => {
    expect(extractScriptPaths({ hooks: {} }, '/plugin')).toHaveLength(0);
    expect(extractScriptPaths(null, '/plugin')).toHaveLength(0);
    expect(extractScriptPaths({}, '/plugin')).toHaveLength(0);
  });

  test('handler 缺少 hooks 陣列時跳過', () => {
    const hooksData = {
      hooks: {
        SessionStart: [{ type: 'command', command: 'some-cmd' }], // 扁平格式
      },
    };
    const result = extractScriptPaths(hooksData, '/plugin');
    expect(result).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: extractRequirePaths
// ══════════════════════════════════════════════════════════════════

describe('extractRequirePaths', () => {
  test('提取相對路徑 require()', () => {
    const content = `
const fs = require('fs');
const path = require('path');
const state = require('../../../scripts/lib/state');
const utils = require('./utils');
`;
    const paths = extractRequirePaths(content);
    expect(paths).toContain('../../../scripts/lib/state');
    expect(paths).toContain('./utils');
    // 非相對路徑不應包含
    expect(paths).not.toContain('fs');
    expect(paths).not.toContain('path');
  });

  test('單引號和雙引號都能解析', () => {
    const content = `
const a = require("./module-a");
const b = require('./module-b');
`;
    const paths = extractRequirePaths(content);
    expect(paths).toContain('./module-a');
    expect(paths).toContain('./module-b');
  });

  test('空字串回傳空陣列', () => {
    expect(extractRequirePaths('')).toHaveLength(0);
  });

  test('無 require 語句回傳空陣列', () => {
    const content = 'const x = 1;\nmodule.exports = { x };';
    expect(extractRequirePaths(content)).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 3: checkScriptExists（正向/反向）
// ══════════════════════════════════════════════════════════════════

describe('checkScriptExists', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('script 存在時回傳 pass', () => {
    const sandbox = createSandbox({
      scriptNames: ['session/on-start.js'],
      hookEvents: ['SessionStart'],
    });
    const hooksData = JSON.parse(fs.readFileSync(sandbox.hooksJsonPath, 'utf8'));
    const checks = checkScriptExists(hooksData, sandbox.pluginRoot);

    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('pass');
    expect(checks[0].name).toBe('script-exists');
  });

  test('script 不存在時回傳 fail', () => {
    const pluginRoot = join(tmpDir, 'plugin');
    fs.mkdirSync(join(pluginRoot, 'hooks'), { recursive: true });

    const hooksData = {
      hooks: {
        SessionStart: [{
          hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session/ghost.js' }],
        }],
      },
    };
    fs.writeFileSync(
      join(pluginRoot, 'hooks', 'hooks.json'),
      JSON.stringify(hooksData, null, 2), 'utf8'
    );

    const checks = checkScriptExists(hooksData, pluginRoot);
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('fail');
    expect(checks[0].message).toContain('ghost.js');
  });

  test('同一 script 被多個 event 引用時去重，只檢查一次', () => {
    const pluginRoot = join(tmpDir, 'plugin');
    const scriptsDir = join(pluginRoot, 'hooks', 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(join(scriptsDir, 'shared.js'), '#!/usr/bin/env node\n', 'utf8');

    const hooksData = {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/shared.js' }] }],
        SessionEnd:   [{ hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/shared.js' }] }],
      },
    };
    const checks = checkScriptExists(hooksData, pluginRoot);
    expect(checks).toHaveLength(1); // 去重，只有一筆
  });

  test('hooks.json 為 null 時回傳 warn', () => {
    const checks = checkScriptExists(null, '/plugin');
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('warn');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 4: checkScriptExecutable（正向/反向）
// ══════════════════════════════════════════════════════════════════

describe('checkScriptExecutable', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('有執行權限時回傳 pass', () => {
    const sandbox = createSandbox({
      scriptNames: ['session/on-start.js'],
      executable: true,
      hookEvents: ['SessionStart'],
    });
    const hooksData = JSON.parse(fs.readFileSync(sandbox.hooksJsonPath, 'utf8'));
    const checks = checkScriptExecutable(hooksData, sandbox.pluginRoot);

    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('pass');
    expect(checks[0].name).toBe('script-executable');
  });

  test('缺少執行權限時回傳 fail', () => {
    const sandbox = createSandbox({
      scriptNames: ['session/no-exec.js'],
      executable: false,
      hookEvents: ['SessionStart'],
    });
    const hooksData = JSON.parse(fs.readFileSync(sandbox.hooksJsonPath, 'utf8'));
    const checks = checkScriptExecutable(hooksData, sandbox.pluginRoot);

    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('fail');
    expect(checks[0].message).toContain('執行權限');
  });

  test('script 不存在時跳過（由 script-exists 處理）', () => {
    const pluginRoot = join(tmpDir, 'plugin');
    fs.mkdirSync(join(pluginRoot, 'hooks'), { recursive: true });

    const hooksData = {
      hooks: {
        SessionStart: [{
          hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/ghost.js' }],
        }],
      },
    };
    const checks = checkScriptExecutable(hooksData, pluginRoot);
    expect(checks).toHaveLength(0); // 跳過不存在的 script
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 5: checkDependencies（正向/反向）
// ══════════════════════════════════════════════════════════════════

describe('checkDependencies', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('依賴都存在時回傳 pass', () => {
    const pluginRoot = join(tmpDir, 'plugin');
    const scriptsDir = join(pluginRoot, 'hooks', 'scripts', 'session');
    const libDir = join(pluginRoot, 'scripts', 'lib');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });

    // 建立依賴
    fs.writeFileSync(join(libDir, 'state.js'), 'module.exports = {};', 'utf8');

    // 建立 script（require 相對路徑指向依賴）
    const scriptContent = `#!/usr/bin/env node
const state = require('../../../scripts/lib/state');
module.exports = {};
`;
    const scriptPath = join(scriptsDir, 'on-start.js');
    fs.writeFileSync(scriptPath, scriptContent, 'utf8');
    fs.chmodSync(scriptPath, 0o755);

    const hooksData = {
      hooks: {
        SessionStart: [{
          hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session/on-start.js' }],
        }],
      },
    };
    fs.writeFileSync(
      join(pluginRoot, 'hooks', 'hooks.json'),
      JSON.stringify(hooksData, null, 2), 'utf8'
    );

    const checks = checkDependencies(hooksData, pluginRoot);
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('pass');
  });

  test('依賴不存在時回傳 fail', () => {
    const pluginRoot = join(tmpDir, 'plugin');
    const scriptsDir = join(pluginRoot, 'hooks', 'scripts', 'session');
    fs.mkdirSync(scriptsDir, { recursive: true });

    // script 引用不存在的依賴
    const scriptContent = `#!/usr/bin/env node
const missing = require('../../../scripts/lib/missing-module');
`;
    const scriptPath = join(scriptsDir, 'on-start.js');
    fs.writeFileSync(scriptPath, scriptContent, 'utf8');
    fs.chmodSync(scriptPath, 0o755);

    const hooksData = {
      hooks: {
        SessionStart: [{
          hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session/on-start.js' }],
        }],
      },
    };

    const checks = checkDependencies(hooksData, pluginRoot);
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('fail');
    expect(checks[0].message).toContain('missing-module');
  });

  test('無 require 的 script 回傳 pass', () => {
    const sandbox = createSandbox({
      scriptNames: ['session/simple.js'],
      executable: true,
      hookEvents: ['SessionStart'],
      scriptContents: {
        'session/simple.js': '#!/usr/bin/env node\nprocess.exit(0);\n',
      },
    });
    const hooksData = JSON.parse(fs.readFileSync(sandbox.hooksJsonPath, 'utf8'));
    const checks = checkDependencies(hooksData, sandbox.pluginRoot);

    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('pass');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 6: checkHooksJsonFormat
// ══════════════════════════════════════════════════════════════════

describe('checkHooksJsonFormat', () => {
  test('正確三層嵌套格式回傳 pass', () => {
    const hooksData = {
      hooks: {
        SessionStart: [{
          hooks: [{ type: 'command', command: 'echo ok' }],
        }],
      },
    };
    const result = checkHooksJsonFormat(hooksData);
    expect(result.status).toBe('pass');
    expect(result.name).toBe('hooks-json-format');
  });

  test('含 matcher 的格式也通過', () => {
    const hooksData = {
      hooks: {
        PreToolUse: [
          { matcher: 'Task', hooks: [{ type: 'command', command: 'pre-task.js' }] },
          { matcher: 'Write', hooks: [{ type: 'command', command: 'pre-edit.js' }] },
        ],
      },
    };
    const result = checkHooksJsonFormat(hooksData);
    expect(result.status).toBe('pass');
  });

  test('頂層缺少 hooks 物件時回傳 fail', () => {
    const result = checkHooksJsonFormat({ sessions: {} });
    expect(result.status).toBe('fail');
    expect(result.message).toContain('hooks 物件');
  });

  test('頂層 hooks 是陣列（扁平格式）時回傳 fail', () => {
    const result = checkHooksJsonFormat({ hooks: [{ event: 'SessionStart' }] });
    expect(result.status).toBe('fail');
  });

  test('event handlers 不是陣列時回傳 fail', () => {
    const result = checkHooksJsonFormat({
      hooks: { SessionStart: { hooks: [] } }, // 物件而非陣列
    });
    expect(result.status).toBe('fail');
    expect(result.message).toContain('SessionStart');
  });

  test('handler 缺少 hooks 陣列（二層而非三層）時回傳 fail', () => {
    const result = checkHooksJsonFormat({
      hooks: {
        SessionStart: [{ type: 'command', command: 'echo ok' }], // 二層：缺少 hooks 陣列
      },
    });
    expect(result.status).toBe('fail');
    expect(result.message).toContain('三層嵌套格式');
  });

  test('hook entry 缺少 type 時回傳 fail', () => {
    const result = checkHooksJsonFormat({
      hooks: {
        SessionStart: [{
          hooks: [{ command: 'echo ok' }], // 缺少 type
        }],
      },
    });
    expect(result.status).toBe('fail');
    expect(result.message).toContain('type');
  });

  test('hook entry 缺少 command 時回傳 fail', () => {
    const result = checkHooksJsonFormat({
      hooks: {
        SessionStart: [{
          hooks: [{ type: 'command' }], // 缺少 command
        }],
      },
    });
    expect(result.status).toBe('fail');
    expect(result.message).toContain('command');
  });

  test('null 輸入時回傳 fail', () => {
    const result = checkHooksJsonFormat(null);
    expect(result.status).toBe('fail');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 7: checkEventCoverage
// ══════════════════════════════════════════════════════════════════

describe('checkEventCoverage', () => {
  test('所有事件都有 handler 時全部 pass', () => {
    const hooksData = {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'a.js' }] }],
        SessionEnd:   [{ hooks: [{ type: 'command', command: 'b.js' }] }],
      },
    };
    const checks = checkEventCoverage(hooksData, ['SessionStart', 'SessionEnd']);
    expect(checks).toHaveLength(2);
    expect(checks.every(c => c.status === 'pass')).toBe(true);
  });

  test('缺少 handler 的事件回傳 fail', () => {
    const hooksData = {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'a.js' }] }],
      },
    };
    const checks = checkEventCoverage(hooksData, ['SessionStart', 'SessionEnd']);
    expect(checks).toHaveLength(2);

    const startCheck = checks.find(c => c.target === 'SessionStart');
    const endCheck = checks.find(c => c.target === 'SessionEnd');

    expect(startCheck.status).toBe('pass');
    expect(endCheck.status).toBe('fail');
    expect(endCheck.message).toContain('SessionEnd');
  });

  test('hookEvents 為空陣列時回傳 warn', () => {
    const checks = checkEventCoverage({}, []);
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('warn');
  });

  test('hookEvents 為 null 時回傳 warn', () => {
    const checks = checkEventCoverage({}, null);
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('warn');
  });

  test('target 欄位是事件名稱', () => {
    const hooksData = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x.js' }] }] } };
    const checks = checkEventCoverage(hooksData, ['Stop']);
    expect(checks[0].target).toBe('Stop');
    expect(checks[0].name).toBe('event-coverage');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 8: runDiagnostic — 整合診斷入口
// ══════════════════════════════════════════════════════════════════

describe('runDiagnostic', () => {
  beforeEach(setupSandbox);
  afterEach(teardownSandbox);

  test('所有項目通過時 summary.fail = 0', () => {
    const sandbox = createSandbox({
      scriptNames: ['session/on-start.js'],
      executable: true,
      hookEvents: ['SessionStart'],
    });

    const result = runDiagnostic({ paths: sandbox });

    expect(result).toHaveProperty('checks');
    expect(result).toHaveProperty('summary');
    expect(result.summary).toHaveProperty('total');
    expect(result.summary).toHaveProperty('pass');
    expect(result.summary).toHaveProperty('fail');
    expect(result.summary).toHaveProperty('warn');
    expect(result.summary.total).toBe(result.summary.pass + result.summary.fail + result.summary.warn);
  });

  test('script 不存在時 summary.fail > 0', () => {
    const pluginRoot = join(tmpDir, 'plugin');
    fs.mkdirSync(join(pluginRoot, 'hooks'), { recursive: true });

    const hooksData = {
      hooks: {
        SessionStart: [{
          hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/scripts/ghost.js' }],
        }],
      },
    };
    fs.writeFileSync(
      join(pluginRoot, 'hooks', 'hooks.json'),
      JSON.stringify(hooksData, null, 2), 'utf8'
    );

    const result = runDiagnostic({
      paths: {
        pluginRoot,
        hooksJsonPath: join(pluginRoot, 'hooks', 'hooks.json'),
        hookEventsRef: ['SessionStart'],
      },
    });

    expect(result.summary.fail).toBeGreaterThan(0);
  });

  test('回傳結構包含 checks 陣列，每個 check 有 name、target、status', () => {
    const sandbox = createSandbox({
      scriptNames: ['session/on-start.js'],
      executable: true,
      hookEvents: ['SessionStart'],
    });

    const result = runDiagnostic({ paths: sandbox });

    for (const check of result.checks) {
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('target');
      expect(check).toHaveProperty('status');
      expect(['pass', 'fail', 'warn']).toContain(check.status);
    }
  });

  test('hooks.json 不存在時 fail 大於 0', () => {
    const pluginRoot = join(tmpDir, 'plugin');
    fs.mkdirSync(join(pluginRoot, 'hooks'), { recursive: true });
    // 不建立 hooks.json

    const result = runDiagnostic({
      paths: {
        pluginRoot,
        hooksJsonPath: join(pluginRoot, 'hooks', 'hooks.json'),
        hookEventsRef: ['SessionStart'],
      },
    });

    expect(result.summary.fail).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 9: 真實 codebase 健康驗證
// ══════════════════════════════════════════════════════════════════

describe('真實 codebase 健康驗證', () => {
  test('所有 hook scripts 存在', () => {
    const result = runDiagnostic();
    const existsChecks = result.checks.filter(c => c.name === 'script-exists');

    expect(existsChecks.length).toBeGreaterThan(0);
    const failed = existsChecks.filter(c => c.status === 'fail');
    if (failed.length > 0) {
      const msgs = failed.map(c => c.message || c.target).join(', ');
      throw new Error(`部分 hook scripts 不存在：${msgs}`);
    }
  });

  test('所有 hook scripts 有執行權限', () => {
    const result = runDiagnostic();
    const execChecks = result.checks.filter(c => c.name === 'script-executable');

    expect(execChecks.length).toBeGreaterThan(0);
    const failed = execChecks.filter(c => c.status === 'fail');
    if (failed.length > 0) {
      const msgs = failed.map(c => c.message || c.target).join(', ');
      throw new Error(`部分 hook scripts 缺少執行權限：${msgs}`);
    }
  });

  test('所有 hook scripts 的依賴都存在', () => {
    const result = runDiagnostic();
    const depChecks = result.checks.filter(c => c.name === 'dependency-check');

    expect(depChecks.length).toBeGreaterThan(0);
    const failed = depChecks.filter(c => c.status === 'fail');
    if (failed.length > 0) {
      const msgs = failed.map(c => `${c.target}: ${c.message}`).join('; ');
      throw new Error(`部分 hook scripts 缺少依賴：${msgs}`);
    }
  });

  test('hooks.json 使用正確三層嵌套格式', () => {
    const result = runDiagnostic();
    const formatCheck = result.checks.find(c => c.name === 'hooks-json-format');

    expect(formatCheck).toBeDefined();
    expect(formatCheck.status).toBe('pass');
  });

  test('registry hookEvents 全部有 handler（event-coverage 100%）', () => {
    const result = runDiagnostic();
    const coverageChecks = result.checks.filter(c => c.name === 'event-coverage');

    expect(coverageChecks.length).toBeGreaterThan(0);
    const failed = coverageChecks.filter(c => c.status === 'fail');
    if (failed.length > 0) {
      const msgs = failed.map(c => c.target).join(', ');
      throw new Error(`以下 hook events 缺少 handler：${msgs}`);
    }
  });

  test('整體 summary.fail = 0（系統完全健康）', () => {
    const result = runDiagnostic();
    if (result.summary.fail > 0) {
      const failedChecks = result.checks.filter(c => c.status === 'fail');
      const detail = failedChecks.map(c => `[${c.name}] ${c.target}: ${c.message || ''}`).join('\n');
      throw new Error(`Hook 診斷發現 ${result.summary.fail} 個問題：\n${detail}`);
    }
    expect(result.summary.fail).toBe(0);
  });
});
