'use strict';
/**
 * component-repair.js — 元件自動修復模組
 *
 * 自動偵測和修復常見的元件不一致問題：
 *
 * Rule 1: plugin.json agents 陣列 vs 實際 agents/ 目錄（autoFixable）
 *   - 偵測：plugin.json 列出但不存在，或存在但未列出
 *   - 修復：將實際 agents/*.md 同步回 plugin.json agents 陣列
 *
 * Rule 2: registry-data.json agentModels vs 實際 agents/ 目錄（不自動修復）
 *   - 偵測：agentModels key 與實際 agents/ 不一致
 *   - 只報告
 *
 * Rule 3: agent frontmatter 必填欄位缺失（不自動修復）
 *   - 偵測：agents/*.md frontmatter 缺少 model / bypassPermissions
 *   - 只報告（需判斷應填什麼值）
 *
 * Rule 4: hooks.json 事件名稱 vs registry hookEvents（不自動修復）
 *   - 偵測：hooks.json 中出現不在 hookEvents 中的事件名稱
 *   - 只報告
 *
 * API：
 *   scanInconsistencies(paths?)  → { issues, summary }
 *   autoRepair(issues, paths?)   → { fixed, skipped, errors }
 *   runComponentRepair(paths?)   → { scan, repair, summary }
 */

const { existsSync, readFileSync, readdirSync } = require('fs');
const { join, basename } = require('path');
const { atomicWrite } = require('./utils');

// ── 預設路徑解析 ──────────────────────────────────────────────────────────

/**
 * 解析元件路徑，支援完整注入（測試用）
 * @param {object} [injected] - 注入的路徑覆蓋
 * @returns {object} 完整路徑集合
 */
function resolvePaths(injected = {}) {
  const pluginRoot = injected.pluginRoot || join(__dirname, '..', '..');
  return {
    pluginRoot,
    agentsDir:       injected.agentsDir       || join(pluginRoot, 'agents'),
    pluginJsonPath:  injected.pluginJsonPath   || join(pluginRoot, '.claude-plugin', 'plugin.json'),
    registryDataPath:injected.registryDataPath || join(__dirname, 'registry-data.json'),
    hooksJsonPath:   injected.hooksJsonPath    || join(pluginRoot, 'hooks', 'hooks.json'),
    hookEventsRef:   injected.hookEventsRef    || null, // null → 從 registry.js 載入
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

// ── 掃描輔助函式 ──────────────────────────────────────────────────────────

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

/**
 * 解析 Markdown frontmatter（輕量手工解析，不依賴 gray-matter）
 * @param {string} content
 * @returns {object}
 */
function parseFrontmatterContent(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};
  let currentKey = null;
  let inList = false;

  for (const line of yaml.split('\n')) {
    const listItemMatch = line.match(/^  - (.+)$/);
    const kvMatch = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);

    if (listItemMatch && inList && currentKey) {
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      result[currentKey].push(listItemMatch[1].trim());
    } else if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === '') {
        result[currentKey] = [];
        inList = true;
      } else if (value === 'true') {
        result[currentKey] = true;
        inList = false;
      } else if (value === 'false') {
        result[currentKey] = false;
        inList = false;
      } else if (!isNaN(Number(value)) && value !== '') {
        result[currentKey] = Number(value);
        inList = false;
      } else {
        result[currentKey] = value;
        inList = false;
      }
    }
  }

  return result;
}

/**
 * 讀取 agents/ 目錄下所有 .md 檔案名稱（不含路徑）
 * @param {string} agentsDir
 * @returns {string[]} 例如 ['developer.md', 'planner.md']
 */
function listAgentFiles(agentsDir) {
  if (!existsSync(agentsDir)) return [];
  try {
    return readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .sort();
  } catch (_) {
    return [];
  }
}

/**
 * 從 plugin.json agents 陣列中取出 agent 檔案名稱（不含路徑前綴）
 * @param {string[]} agentsArray  - 例如 ['./agents/developer.md']
 * @returns {string[]} 例如 ['developer.md']
 */
function extractAgentFilenames(agentsArray) {
  if (!Array.isArray(agentsArray)) return [];
  return agentsArray.map(p => basename(p)).sort();
}

// ── Rule 1：plugin.json agents vs 實際 agents/ ────────────────────────────

/**
 * @param {object} paths
 * @returns {import('./component-repair').Issue[]}
 */
function scanPluginJsonAgents(paths) {
  const issues = [];

  const pluginJson = safeReadJson(paths.pluginJsonPath);
  if (!pluginJson) {
    return [{
      type: 'plugin-json-parse-error',
      component: 'plugin.json',
      message: `無法讀取或解析 plugin.json：${paths.pluginJsonPath}`,
      autoFixable: false,
    }];
  }

  const listedNames = extractAgentFilenames(pluginJson.agents || []);
  const actualNames = listAgentFiles(paths.agentsDir);

  // plugin.json 列出但實際不存在
  for (const name of listedNames) {
    if (!actualNames.includes(name)) {
      issues.push({
        type: 'plugin-json-ghost-agent',
        component: `plugin.json → ${name}`,
        message: `plugin.json 列出 ${name} 但 agents/ 目錄下不存在`,
        autoFixable: true,
      });
    }
  }

  // 實際存在但 plugin.json 未列出
  for (const name of actualNames) {
    if (!listedNames.includes(name)) {
      issues.push({
        type: 'plugin-json-missing-agent',
        component: `plugin.json ← ${name}`,
        message: `agents/${name} 存在但 plugin.json 未列出`,
        autoFixable: true,
      });
    }
  }

  return issues;
}

// ── Rule 2：registry-data.json agentModels vs 實際 agents/ ───────────────

/**
 * @param {object} paths
 * @returns {import('./component-repair').Issue[]}
 */
function scanRegistryDataAgents(paths) {
  const issues = [];

  const registryData = safeReadJson(paths.registryDataPath);
  if (!registryData) {
    return [{
      type: 'registry-data-parse-error',
      component: 'registry-data.json',
      message: `無法讀取或解析 registry-data.json：${paths.registryDataPath}`,
      autoFixable: false,
    }];
  }

  const agentModels = registryData.agentModels || {};
  const registryAgents = Object.keys(agentModels).sort();
  const actualNames = listAgentFiles(paths.agentsDir).map(f => f.replace(/\.md$/, '')).sort();

  // registry 有但 agents/ 不存在
  for (const name of registryAgents) {
    // grader 是特例：registry-data 中無此 key，但如果有就要查
    if (!actualNames.includes(name)) {
      issues.push({
        type: 'registry-data-ghost-agent',
        component: `registry-data.json → ${name}`,
        message: `registry-data.json agentModels 有 ${name} 但 agents/ 目錄下不存在`,
        autoFixable: false,
      });
    }
  }

  // agents/ 存在但 registry 未列出（grader 是特例，不在 agentModels 中是預期行為）
  for (const name of actualNames) {
    if (name === 'grader') continue; // grader 不在 agentModels 是預期的
    if (!registryAgents.includes(name)) {
      issues.push({
        type: 'registry-data-missing-agent',
        component: `registry-data.json ← ${name}`,
        message: `agents/${name}.md 存在但 registry-data.json agentModels 未列出`,
        autoFixable: false,
      });
    }
  }

  return issues;
}

// ── Rule 3：agent frontmatter 必填欄位 ───────────────────────────────────

const REQUIRED_AGENT_FIELDS = ['model', 'bypassPermissions'];

/**
 * @param {object} paths
 * @returns {import('./component-repair').Issue[]}
 */
function scanAgentFrontmatter(paths) {
  const issues = [];
  const agentFiles = listAgentFiles(paths.agentsDir);

  for (const filename of agentFiles) {
    const filePath = join(paths.agentsDir, filename);
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch (_) {
      issues.push({
        type: 'agent-read-error',
        component: filename,
        message: `無法讀取 agents/${filename}`,
        autoFixable: false,
      });
      continue;
    }

    const fm = parseFrontmatterContent(content);

    // 檢查 bypassPermissions（以 permissionMode: bypassPermissions 或 bypassPermissions: true 形式存在）
    // Claude Code 實際使用 permissionMode: bypassPermissions 或直接 bypassPermissions
    const hasBypassPermissions =
      fm.bypassPermissions === true ||
      fm.permissionMode === 'bypassPermissions';

    for (const field of REQUIRED_AGENT_FIELDS) {
      let isMissing = false;
      if (field === 'bypassPermissions') {
        isMissing = !hasBypassPermissions;
      } else {
        isMissing = fm[field] === undefined || fm[field] === null || fm[field] === '';
      }

      if (isMissing) {
        issues.push({
          type: 'agent-missing-field',
          component: `${filename} → ${field}`,
          message: `agents/${filename} frontmatter 缺少必填欄位：${field}`,
          autoFixable: false,
        });
      }
    }
  }

  return issues;
}

// ── Rule 4：hooks.json 事件名稱 vs registry hookEvents ───────────────────

/**
 * @param {object} paths
 * @returns {import('./component-repair').Issue[]}
 */
function scanHooksJsonEvents(paths) {
  const issues = [];

  const hooksJson = safeReadJson(paths.hooksJsonPath);
  if (!hooksJson) {
    return [{
      type: 'hooks-json-parse-error',
      component: 'hooks.json',
      message: `無法讀取或解析 hooks.json：${paths.hooksJsonPath}`,
      autoFixable: false,
    }];
  }

  const allowedEvents = new Set(getHookEvents(paths));
  const hooks = hooksJson.hooks || {};

  for (const eventName of Object.keys(hooks)) {
    if (!allowedEvents.has(eventName)) {
      issues.push({
        type: 'hooks-json-unknown-event',
        component: `hooks.json → ${eventName}`,
        message: `hooks.json 使用了不在 registry hookEvents 中的事件：${eventName}`,
        autoFixable: false,
      });
    }
  }

  return issues;
}

// ── 主要 API ─────────────────────────────────────────────────────────────

/**
 * 掃描所有元件不一致問題
 *
 * @param {object} [injectedPaths] - 路徑注入（測試用）
 * @returns {{ issues: Issue[], summary: ScanSummary }}
 */
function scanInconsistencies(injectedPaths = {}) {
  const paths = resolvePaths(injectedPaths);

  const issues = [
    ...scanPluginJsonAgents(paths),
    ...scanRegistryDataAgents(paths),
    ...scanAgentFrontmatter(paths),
    ...scanHooksJsonEvents(paths),
  ];

  const autoFixableCount = issues.filter(i => i.autoFixable).length;

  const summary = {
    total: issues.length,
    autoFixable: autoFixableCount,
    manualOnly: issues.length - autoFixableCount,
    byType: {},
  };

  for (const issue of issues) {
    summary.byType[issue.type] = (summary.byType[issue.type] || 0) + 1;
  }

  return { issues, summary };
}

/**
 * 自動修復可修復的問題
 *
 * 目前只有 Rule 1（plugin.json agents 同步）支援自動修復。
 * 修復策略：取實際 agents/ 目錄檔案為準，重建 plugin.json agents 陣列。
 *
 * @param {Issue[]} issues       - scanInconsistencies 回傳的 issues
 * @param {object} [injectedPaths] - 路徑注入
 * @returns {{ fixed: FixResult[], skipped: SkipResult[], errors: ErrorResult[] }}
 */
function autoRepair(issues, injectedPaths = {}) {
  const paths = resolvePaths(injectedPaths);

  const fixed = [];
  const skipped = [];
  const errors = [];

  // 篩出可修復的問題
  const fixableIssues = issues.filter(i => i.autoFixable);
  const notFixable = issues.filter(i => !i.autoFixable);

  for (const issue of notFixable) {
    skipped.push({ issue, reason: '此問題類型不支援自動修復' });
  }

  if (fixableIssues.length === 0) {
    return { fixed, skipped, errors };
  }

  // Rule 1 修復：所有 plugin-json-ghost-agent / plugin-json-missing-agent
  // 策略：重讀實際 agents/ 目錄，重建 plugin.json agents 陣列
  const rule1Issues = fixableIssues.filter(i =>
    i.type === 'plugin-json-ghost-agent' || i.type === 'plugin-json-missing-agent'
  );

  if (rule1Issues.length > 0) {
    try {
      const pluginJson = safeReadJson(paths.pluginJsonPath);
      if (!pluginJson) {
        throw new Error(`無法讀取 plugin.json：${paths.pluginJsonPath}`);
      }

      const actualFiles = listAgentFiles(paths.agentsDir);
      if (actualFiles.length === 0) {
        throw new Error(`agents/ 目錄不存在或為空：${paths.agentsDir}`);
      }

      // 重建 agents 陣列（相對路徑格式 ./agents/<name>）
      const newAgents = actualFiles.map(f => `./agents/${f}`);

      const updated = { ...pluginJson, agents: newAgents };
      atomicWrite(paths.pluginJsonPath, updated);

      for (const issue of rule1Issues) {
        fixed.push({
          issue,
          action: `已同步 plugin.json agents 陣列（${actualFiles.length} 個 agent）`,
        });
      }
    } catch (err) {
      for (const issue of rule1Issues) {
        errors.push({
          issue,
          error: err.message || String(err),
        });
      }
    }
  }

  return { fixed, skipped, errors };
}

/**
 * 一鍵掃描 + 修復
 *
 * @param {object} [injectedPaths] - 路徑注入（測試用）
 * @returns {{ scan: ScanResult, repair: RepairResult, summary: string }}
 */
function runComponentRepair(injectedPaths = {}) {
  const scan = scanInconsistencies(injectedPaths);
  const repair = autoRepair(scan.issues, injectedPaths);

  const lines = [];
  lines.push(`掃描完成：發現 ${scan.summary.total} 個問題`);
  lines.push(`  可自動修復：${scan.summary.autoFixable} 個`);
  lines.push(`  需手動處理：${scan.summary.manualOnly} 個`);

  if (repair.fixed.length > 0) {
    lines.push(`\n已自動修復 ${repair.fixed.length} 個問題：`);
    for (const f of repair.fixed) {
      lines.push(`  [FIXED] ${f.issue.component}：${f.action}`);
    }
  }

  if (repair.errors.length > 0) {
    lines.push(`\n修復失敗 ${repair.errors.length} 個：`);
    for (const e of repair.errors) {
      lines.push(`  [ERROR] ${e.issue.component}：${e.error}`);
    }
  }

  if (scan.summary.manualOnly > 0) {
    lines.push(`\n需手動處理的問題：`);
    for (const issue of scan.issues.filter(i => !i.autoFixable)) {
      lines.push(`  [MANUAL] ${issue.component}：${issue.message}`);
    }
  }

  const summary = lines.join('\n');
  return { scan, repair, summary };
}

// ── 匯出 ─────────────────────────────────────────────────────────────────

module.exports = {
  scanInconsistencies,
  autoRepair,
  runComponentRepair,
  // 內部函式也匯出供測試
  scanPluginJsonAgents,
  scanRegistryDataAgents,
  scanAgentFrontmatter,
  scanHooksJsonEvents,
  listAgentFiles,
  extractAgentFilenames,
  parseFrontmatterContent,
};
