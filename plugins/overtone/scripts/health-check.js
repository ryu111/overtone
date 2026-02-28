#!/usr/bin/env node
'use strict';
/**
 * health-check.js — Overtone 系統健康自動化偵測
 *
 * 執行 6 項確定性偵測：
 *   1. phantom-events   — registry 事件 vs 實際 emit 呼叫差異
 *   2. dead-exports     — scripts/lib 模組 export 但從未被 require 使用
 *   3. doc-code-drift   — docs 文件中的數量與程式碼實際值不符
 *   4. unused-paths     — paths.js export 但從未被使用
 *   5. duplicate-logic  — hooks/scripts 中已知的重複邏輯 pattern
 *   6. platform-drift   — config-api 驗證 + 棄用 tools 白名單偵測
 *
 * 輸出：JSON stdout（HealthCheckOutput schema）
 * Exit code：有 findings → 1；無 findings → 0
 */

const { readdirSync, readFileSync, statSync } = require('fs');
const path = require('path');

// ── 路徑常數 ──

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const SCRIPTS_LIB = path.join(PLUGIN_ROOT, 'scripts', 'lib');
const HOOKS_SCRIPTS = path.join(PLUGIN_ROOT, 'hooks', 'scripts');
const PLUGIN_JSON = path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const HOOKS_JSON = path.join(PLUGIN_ROOT, 'hooks', 'hooks.json');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const PROJECT_ROOT = findProjectRoot();
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');

// ── 工具函式 ──

/**
 * 從當前目錄往上找含 CLAUDE.md 的專案根目錄
 * @returns {string}
 */
function findProjectRoot() {
  let dir = path.resolve(__dirname, '..', '..', '..');
  // 安全上限：往上最多 5 層
  for (let i = 0; i < 5; i++) {
    try {
      readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
      return dir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  // fallback：使用 process.cwd()
  return process.cwd();
}

/**
 * 遞迴收集目錄下所有符合條件的 .js 檔案
 * @param {string} dir
 * @param {string[]} [result]
 * @returns {string[]}
 */
function collectJsFiles(dir, result = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, result);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      result.push(full);
    }
  }
  return result;
}

/**
 * 讀取檔案內容，失敗回傳空字串
 * @param {string} filePath
 * @returns {string}
 */
function safeRead(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * 轉成相對於 PLUGIN_ROOT 的相對路徑（用於 finding.file）
 * @param {string} absPath
 * @returns {string}
 */
function toRelative(absPath) {
  return path.relative(PLUGIN_ROOT, absPath);
}

// ── 1. Phantom Events 偵測 ──

/**
 * @returns {Finding[]}
 */
function checkPhantomEvents() {
  const { timelineEvents } = require('./lib/registry');
  const registryKeys = new Set(Object.keys(timelineEvents));

  // 收集 plugin 目錄下所有 .js，排除測試和 health-check.js 本身
  const allJs = collectJsFiles(PLUGIN_ROOT).filter((f) => {
    return (
      f !== __filename &&
      !f.includes('/node_modules/') &&
      !f.includes('health-check.js')
    );
  });

  // 掃描 emit 呼叫，支援三種模式：
  // 1. timeline.emit(sessionId, 'event:type', ...) — 方法呼叫，事件名在第二參數
  // 2. emit(sessionId, 'event:type', ...) — 函式呼叫，事件名在第二參數
  // 3. emit('event:type', ...) — 事件名在第一參數
  // 匹配含冒號的 event key（如 'workflow:start'）
  const emitMethodRe = /\.emit\s*\([^,]+,\s*['"]([a-z]+:[a-z]+)['"]/g;
  const emitFuncRe   = /\bemit\s*\([^'"]+,\s*['"]([a-z]+:[a-z]+)['"]/g;
  const emitDirectRe = /\bemit\s*\(\s*['"]([a-z]+:[a-z]+)['"]/g;

  const emittedEvents = new Map(); // event -> [files]

  for (const f of allJs) {
    const content = safeRead(f);
    const addEvent = (evt) => {
      if (!emittedEvents.has(evt)) emittedEvents.set(evt, []);
      emittedEvents.get(evt).push(f);
    };
    // 方法呼叫：someObj.emit(xxx, 'event:type')
    for (const m of content.matchAll(emitMethodRe)) addEvent(m[1]);
    // 函式呼叫（第二參數）：emit(xxx, 'event:type')
    for (const m of content.matchAll(emitFuncRe)) addEvent(m[1]);
    // 函式呼叫（第一參數）：emit('event:type')
    for (const m of content.matchAll(emitDirectRe)) addEvent(m[1]);
  }

  const findings = [];
  const registryFile = toRelative(path.join(SCRIPTS_LIB, 'registry.js'));

  // registry 有但沒有 emit → warning
  for (const evt of registryKeys) {
    if (!emittedEvents.has(evt)) {
      findings.push({
        check: 'phantom-events',
        severity: 'warning',
        file: registryFile,
        message: `registry 定義了事件 "${evt}" 但程式碼中無對應 emit 呼叫`,
        detail: '此事件可能已廢棄或尚未實作',
      });
    }
  }

  // emit 但 registry 沒有 → error
  for (const [evt, files] of emittedEvents) {
    if (!registryKeys.has(evt)) {
      for (const f of new Set(files)) {
        findings.push({
          check: 'phantom-events',
          severity: 'error',
          file: toRelative(f),
          message: `emit 了未在 registry 定義的事件 "${evt}"`,
          detail: `未定義事件：${evt}`,
        });
      }
    }
  }

  return findings;
}

// ── 2. Dead Exports 偵測 ──

/**
 * 解析 module.exports = { ... } 中的 key 名稱
 * 支援：module.exports = { a, b, c } 和 module.exports = { a: ..., b: ... }
 * @param {string} content
 * @returns {string[]}
 */
function parseModuleExportKeys(content) {
  // 找 module.exports = { ... } 區塊
  const exportMatch = content.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
  if (!exportMatch) return [];

  const body = exportMatch[1];
  const keys = [];

  // 匹配 export key，支援兩種格式：
  // 1. shorthand: { a, b, c } → a 在行首/逗號後，後跟 , 或行尾
  // 2. key:value: { key: val } → key 在逗號/行首後，後跟 :
  // (?:^|[,\n]) 確保只匹配每個 entry 的第一個 identifier（即 key）
  const keyRe = /(?:^|[,\n])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=:|,|\n|$|\s*\})/gm;
  for (const m of body.matchAll(keyRe)) {
    const k = m[1];
    // 排除保留字
    if (k && !['true', 'false', 'null', 'undefined'].includes(k)) {
      keys.push(k);
    }
  }

  return [...new Set(keys)];
}

/**
 * @returns {Finding[]}
 */
function checkDeadExports() {
  // 收集 scripts/lib 下所有 .js（含子目錄 dashboard/ remote/）
  const libFiles = collectJsFiles(SCRIPTS_LIB);

  // 收集 plugin 下所有 .js（排除 lib 自身、測試）
  const allPluginJs = collectJsFiles(PLUGIN_ROOT).filter((f) => {
    return (
      f !== __filename &&
      !f.includes('health-check.js') &&
      !f.includes('/node_modules/')
    );
  });

  const findings = [];

  for (const libFile of libFiles) {
    const content = safeRead(libFile);
    if (!content) continue;

    // 跳過 class instance exports（如 instinct.js）
    // instinct.js export 的是 class instance，不是一般物件 keys
    if (content.includes('module.exports = new ') || content.includes('module.exports=new ')) {
      continue;
    }

    const exportKeys = parseModuleExportKeys(content);
    if (exportKeys.length === 0) continue;

    // 計算相對模組名（用於 require 匹配）
    const libRelative = path.relative(path.join(PLUGIN_ROOT, 'scripts'), libFile);
    const libBasename = path.basename(libFile, '.js');

    // 掃描所有 plugin .js（排除自身）
    const otherFiles = allPluginJs.filter((f) => f !== libFile);

    for (const exportKey of exportKeys) {
      // 判斷是否被使用：
      // 1. const { exportKey } = require(...)  → 解構
      // 2. something.exportKey                 → 存取
      // 3. { exportKey }                       → 解構賦值
      // 4. exportKey(                          → 直接呼叫
      const usagePattern = new RegExp(
        `(?:const|let|var)\\s*\\{[^}]*\\b${exportKey}\\b[^}]*\\}\\s*=\\s*require|` +
        `\\.${exportKey}\\b|` +
        `\\b${exportKey}\\s*(?:\\(|,|\\n)`,
        'g'
      );

      let used = false;
      for (const other of otherFiles) {
        const otherContent = safeRead(other);
        // 首先確認這個檔案有 require 包含 libBasename 的路徑
        const requiresLib = otherContent.includes(libBasename) || otherContent.includes(libRelative);
        if (!requiresLib) continue;

        if (usagePattern.test(otherContent)) {
          used = true;
          // 重設 lastIndex（因為 regex 有 g flag）
          usagePattern.lastIndex = 0;
          break;
        }
        usagePattern.lastIndex = 0;
      }

      if (!used) {
        findings.push({
          check: 'dead-exports',
          severity: 'warning',
          file: toRelative(libFile),
          message: `${path.basename(libFile)} 的 export "${exportKey}" 未被任何其他模組使用`,
          detail: `export key: ${exportKey}`,
        });
      }
    }
  }

  return findings;
}

// ── 3. Doc-Code Drift 偵測 ──

/**
 * 從文件目錄收集需要掃描的 .md 檔案
 * 僅掃描維護中的文件，排除 archive/（歷史）和 reference/（研究參考）
 * @returns {string[]}
 */
function collectDocFiles() {
  const files = [];

  // 1. docs/spec/*.md（規格文件，最重要）
  const specDir = path.join(DOCS_DIR, 'spec');
  try {
    const specMds = readdirSync(specDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => path.join(specDir, e.name));
    files.push(...specMds);
  } catch { /* ignore */ }

  // 2. docs/status.md（現況快讀）
  const statusMd = path.join(DOCS_DIR, 'status.md');
  if (safeRead(statusMd)) files.push(statusMd);

  // 3. 專案 CLAUDE.md（排除全域 CLAUDE.md，內容不由本專案維護）
  const claudeMd = path.join(PROJECT_ROOT, 'CLAUDE.md');
  if (safeRead(claudeMd)) files.push(claudeMd);

  return files;
}

function collectMdFiles(dir, result = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMdFiles(full, result);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      result.push(full);
    }
  }
  return result;
}

/**
 * @returns {Finding[]}
 */
function checkDocCodeDrift() {
  const { stages, workflows, timelineEvents } = require('./lib/registry');

  // 計算程式碼真值
  const agentCount = Object.keys(stages).length;     // 16 個 stage（各對應 1 agent）
  const workflowCount = Object.keys(workflows).length;
  const eventCount = Object.keys(timelineEvents).length;
  const stageCount = Object.keys(stages).length;

  // 計算 hook 數量（hooks.json 陣列長度）
  let hookCount = 0;
  try {
    const hooksJson = JSON.parse(safeRead(HOOKS_JSON));
    hookCount = Array.isArray(hooksJson.hooks) ? hooksJson.hooks.length : 0;
  } catch { /* ignore */ }

  // 計算 skill 數量（skills/ 目錄數量）
  let skillCount = 0;
  try {
    skillCount = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .length;
  } catch { /* ignore */ }

  // 真值對照表
  const truths = {
    agent:    agentCount,
    stage:    stageCount,
    workflow: workflowCount,
    event:    eventCount,
    hook:     hookCount,
    skill:    skillCount,
  };

  const findings = [];
  const docFiles = collectDocFiles();

  // 掃描文件中的數量敘述
  // 匹配：「16 個 agent」「16個agent」「16 agents」「16 個 stage」等
  // 注意：\s*個?\s* 只允許空格（不含換行符 \n）避免跨行誤匹配
  // 例如：「exit 0\nhookError」不應被匹配為「0 個 hook」
  const driftRe = /(\d+)[^\S\n]*個?[^\S\n]*(agent|hook|skill|workflow|stage|event)s?/gi;

  for (const docFile of docFiles) {
    const content = safeRead(docFile);
    if (!content) continue;

    const relFile = path.relative(PROJECT_ROOT, docFile);

    for (const m of content.matchAll(driftRe)) {
      const docNum = parseInt(m[1], 10);
      const category = m[2].toLowerCase();

      const actual = truths[category];
      if (actual === undefined) continue;

      // 豁免：文件中提及 grader 時，agent 數可以是 actual+1（grader 不計入 stages，但計入「agents」說法）
      if (category === 'agent' && docNum === actual + 1) {
        // 文件整體有提到 grader → 整份文件豁免「actual+1」的 agent 數
        if (content.includes('grader')) {
          continue;
        }
      }

      if (docNum !== actual) {
        findings.push({
          check: 'doc-code-drift',
          severity: 'warning',
          file: relFile,
          message: `docs 記載 ${docNum} 個 ${category}，但程式碼實際有 ${actual} 個`,
          detail: `docs: ${docNum}, actual: ${actual}, match: "${m[0]}"`,
        });
      }
    }
  }

  return findings;
}

// ── 4. Unused Paths 偵測 ──

/**
 * 解析 paths.js 的所有 export 名稱（函式名和常數名）
 * @param {string} content
 * @returns {string[]}
 */
function parsePathsExports(content) {
  const keys = [];

  // module.exports = { ... }
  const exportMatch = content.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
  if (exportMatch) {
    const body = exportMatch[1];
    const keyRe = /^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?::|,|$)/gm;
    for (const m of body.matchAll(keyRe)) {
      if (m[1]) keys.push(m[1]);
    }
  }

  return [...new Set(keys)];
}

/**
 * @returns {Finding[]}
 */
function checkUnusedPaths() {
  const pathsFile = path.join(SCRIPTS_LIB, 'paths.js');
  const content = safeRead(pathsFile);
  if (!content) return [];

  const exportKeys = parsePathsExports(content);
  if (exportKeys.length === 0) return [];

  // 收集 plugin 下所有 .js（排除 paths.js 自身、測試）
  const allPluginJs = collectJsFiles(PLUGIN_ROOT).filter((f) => {
    return (
      f !== pathsFile &&
      f !== __filename &&
      !f.includes('health-check.js') &&
      !f.includes('/node_modules/')
    );
  });

  const findings = [];
  const pathsRel = toRelative(pathsFile);

  for (const key of exportKeys) {
    // 搜尋模式：解構取用或 .key 存取
    const usagePattern = new RegExp(
      `(?:const|let|var)\\s*\\{[^}]*\\b${key}\\b[^}]*\\}\\s*=\\s*require|` +
      `\\.${key}\\b|` +
      `\\b${key}\\s*\\(`,
      'g'
    );

    let used = false;
    for (const other of allPluginJs) {
      const otherContent = safeRead(other);
      // 確認此檔案有 require paths
      if (!otherContent.includes('paths')) continue;

      if (usagePattern.test(otherContent)) {
        used = true;
        usagePattern.lastIndex = 0;
        break;
      }
      usagePattern.lastIndex = 0;
    }

    if (!used) {
      findings.push({
        check: 'unused-paths',
        severity: 'info',
        file: pathsRel,
        message: `paths.js 的 export "${key}" 未被任何 plugin 模組使用`,
        detail: `export: ${key}`,
      });
    }
  }

  return findings;
}

// ── 5. Duplicate Logic 偵測 ──

/**
 * @returns {Finding[]}
 */
function checkDuplicateLogic() {
  // 已知的重複 pattern 定義
  const patterns = [
    {
      name: 'agentToStage',
      description: 'agent 到 stage 的映射建構',
      // 匹配 Object.entries(stages).find 或建構 agentToStage 映射
      regexes: [
        /Object\.entries\(stages\)\.find/,
        /agentToStage\s*=\s*\{/,
        /for\s*\(\s*const\s*\[[^\]]+\]\s*of\s*Object\.entries\(stages\)\)/,
      ],
    },
    {
      name: 'calcDuration',
      description: '時間差計算（Math.floor + 時間）',
      regexes: [
        /Math\.floor\s*\(\s*\([^)]*[Dd]ate[^)]*\)\s*\/\s*(?:1000|60)/,
        /Math\.floor\s*\(\s*\(\s*Date\.now\(\)\s*-/,
        /durationSec\s*=\s*Math\.floor/,
      ],
    },
    {
      name: 'findActualStageKey',
      description: '帶編號 stage key 查找',
      regexes: [
        /startsWith\(baseStage/,
        /startsWith\(stageKey/,
        /\.find\s*\(\s*\([^)]*\)\s*=>\s*[a-z]+\.startsWith\(/,
      ],
    },
  ];

  // 收集 hooks/scripts 下所有 .js
  const hookFiles = collectJsFiles(HOOKS_SCRIPTS);

  const findings = [];

  for (const pattern of patterns) {
    // 記錄每個 file 是否匹配到任何 pattern regex
    const matchedFiles = [];

    for (const hookFile of hookFiles) {
      const content = safeRead(hookFile);
      const matched = pattern.regexes.some((re) => re.test(content));
      if (matched) {
        matchedFiles.push(hookFile);
      }
    }

    if (matchedFiles.length >= 2) {
      const relFiles = matchedFiles.map(toRelative);
      findings.push({
        check: 'duplicate-logic',
        severity: 'info',
        file: relFiles[0],
        message: `Pattern "${pattern.name}"（${pattern.description}）在 ${matchedFiles.length} 個 hook 中重複出現`,
        detail: `出現於：${relFiles.join(', ')}`,
      });
    }
  }

  return findings;
}

// ── 6. Platform Drift 偵測 ──

/**
 * 整合 config-api.validateAll() 的驗證結果，並偵測棄用 tools 白名單。
 * - config-api errors → severity: 'error'
 * - config-api warnings → severity: 'warning'
 * - agent .md 使用 tools: 而非 disallowedTools: → severity: 'warning'（grader 例外）
 *
 * @param {string} [pluginRootOverride] - 覆蓋 PLUGIN_ROOT，供測試使用
 * @returns {Finding[]}
 */
function checkPlatformDrift(pluginRootOverride) {
  const configApi = require('./lib/config-api');
  const matter = require('gray-matter');

  // 允許測試傳入自訂 pluginRoot，正式執行使用全域 PLUGIN_ROOT
  const root = pluginRootOverride || PLUGIN_ROOT;

  /**
   * 將絕對路徑轉為相對於 root 的路徑（供 finding.file 使用）
   * @param {string} absPath
   * @returns {string}
   */
  const rel = (absPath) => path.relative(root, absPath);

  const findings = [];

  // ── 1. 執行 config-api 全面驗證 ──
  let validateResult;
  try {
    validateResult = configApi.validateAll(root);
  } catch (err) {
    findings.push({
      check: 'platform-drift',
      severity: 'error',
      file: 'hooks/hooks.json',
      message: `config-api.validateAll() 執行失敗：${err.message || String(err)}`,
    });
    return findings;
  }

  // 將 agents 的 errors/warnings 轉為 findings
  for (const [agentName, result] of Object.entries(validateResult.agents)) {
    const file = rel(path.join(root, 'agents', `${agentName}.md`));
    for (const msg of result.errors) {
      findings.push({ check: 'platform-drift', severity: 'error', file, message: msg });
    }
    for (const msg of result.warnings) {
      findings.push({ check: 'platform-drift', severity: 'warning', file, message: msg });
    }
  }

  // 將 hooks 的 errors/warnings 轉為 findings
  for (const [event, result] of Object.entries(validateResult.hooks)) {
    const file = rel(path.join(root, 'hooks', 'hooks.json'));
    for (const msg of result.errors) {
      findings.push({ check: 'platform-drift', severity: 'error', file, message: `[${event}] ${msg}` });
    }
    for (const msg of result.warnings) {
      findings.push({ check: 'platform-drift', severity: 'warning', file, message: `[${event}] ${msg}` });
    }
  }

  // 將 skills 的 errors/warnings 轉為 findings
  for (const [skillName, result] of Object.entries(validateResult.skills)) {
    const file = rel(path.join(root, 'skills', skillName, 'SKILL.md'));
    for (const msg of result.errors) {
      findings.push({ check: 'platform-drift', severity: 'error', file, message: msg });
    }
    for (const msg of result.warnings) {
      findings.push({ check: 'platform-drift', severity: 'warning', file, message: msg });
    }
  }

  // 將 cross 的 errors/warnings 轉為 findings
  const crossFile = rel(path.join(root, 'scripts', 'lib', 'registry-data.json'));
  for (const msg of validateResult.cross.errors) {
    findings.push({ check: 'platform-drift', severity: 'error', file: crossFile, message: msg });
  }
  for (const msg of validateResult.cross.warnings) {
    findings.push({ check: 'platform-drift', severity: 'warning', file: crossFile, message: msg });
  }

  // ── 2. 偵測棄用 tools 白名單（grader 例外）──
  const agentsDir = path.join(root, 'agents');
  let agentFiles = [];
  try {
    agentFiles = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  } catch { /* 若讀不到目錄就跳過 */ }

  for (const fileName of agentFiles) {
    // grader 有特殊限制，刻意只開放少數工具，允許使用 tools:
    if (fileName === 'grader.md') continue;

    const agentPath = path.join(agentsDir, fileName);
    const rawContent = safeRead(agentPath);
    if (!rawContent) continue;

    let frontmatter;
    try {
      frontmatter = matter(rawContent).data;
    } catch { continue; }

    // 使用了 tools: 欄位（白名單）而非 disallowedTools:（黑名單）
    if (frontmatter.tools && Array.isArray(frontmatter.tools) && frontmatter.tools.length > 0) {
      findings.push({
        check: 'platform-drift',
        severity: 'warning',
        file: rel(agentPath),
        message: `agent "${fileName.replace(/\.md$/, '')}" 使用棄用的 tools 白名單，建議遷移到 disallowedTools 黑名單`,
        detail: `tools: [${frontmatter.tools.join(', ')}]`,
      });
    }
  }

  return findings;
}

// ── 主程式 ──

/**
 * @typedef {Object} Finding
 * @property {string} check
 * @property {"error"|"warning"|"info"} severity
 * @property {string} file
 * @property {string} message
 * @property {string} [detail]
 */

/**
 * 執行所有健康檢查
 * @returns {{ checks: object[], findings: Finding[] }}
 */
function runAllChecks() {
  const checkDefs = [
    { name: 'phantom-events',   fn: checkPhantomEvents },
    { name: 'dead-exports',     fn: checkDeadExports },
    { name: 'doc-code-drift',   fn: checkDocCodeDrift },
    { name: 'unused-paths',     fn: checkUnusedPaths },
    { name: 'duplicate-logic',  fn: checkDuplicateLogic },
    { name: 'platform-drift',   fn: checkPlatformDrift },
  ];

  const allFindings = [];
  const checks = [];

  for (const { name, fn } of checkDefs) {
    let findings = [];
    try {
      findings = fn();
    } catch (err) {
      // 偵測函式例外 → 記錄為 error finding
      findings = [{
        check: name,
        severity: 'error',
        file: 'health-check.js',
        message: `偵測 "${name}" 時發生非預期錯誤：${err.message || String(err)}`,
      }];
    }

    checks.push({
      name,
      passed: findings.length === 0,
      findingsCount: findings.length,
    });

    allFindings.push(...findings);
  }

  return { checks, findings: allFindings };
}

// ── Entry Point ──

if (require.main === module) {
  let version = 'unknown';
  try {
    const pluginJson = JSON.parse(safeRead(PLUGIN_JSON));
    version = pluginJson.version || 'unknown';
  } catch { /* ignore */ }

  let result;
  try {
    result = runAllChecks();
  } catch (err) {
    // 全域例外
    process.stderr.write(`[health-check] 嚴重錯誤：${err.message || String(err)}\n`);
    process.exit(1);
  }

  const { checks, findings } = result;
  const errors   = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos    = findings.filter((f) => f.severity === 'info').length;
  const passed   = findings.length === 0;

  const output = {
    version,
    timestamp: new Date().toISOString(),
    checks,
    findings,
    summary: {
      total: findings.length,
      errors,
      warnings,
      infos,
      passed,
    },
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  process.exit(passed ? 0 : 1);
}

// ── 匯出供測試使用 ──
module.exports = {
  checkPhantomEvents,
  checkDeadExports,
  checkDocCodeDrift,
  checkUnusedPaths,
  checkDuplicateLogic,
  checkPlatformDrift,
  runAllChecks,
  // 工具函式
  collectJsFiles,
  parseModuleExportKeys,
  parsePathsExports,
  toRelative,
  PLUGIN_ROOT,
  SCRIPTS_LIB,
  HOOKS_SCRIPTS,
};
