#!/usr/bin/env node
'use strict';
/**
 * health-check.js — Overtone 系統健康自動化偵測
 *
 * 執行 19 項確定性偵測：
 *   1. phantom-events              — registry 事件 vs 實際 emit 呼叫差異
 *   2. dead-exports                — scripts/lib 模組 export 但從未被 require 使用
 *   3. doc-code-drift              — docs 文件中的數量與程式碼實際值不符
 *   4. unused-paths                — paths.js export 但從未被使用
 *   5. duplicate-logic             — hooks/scripts 中已知的重複邏輯 pattern
 *   6. platform-drift              — config-api 驗證 + 棄用 tools 白名單偵測
 *   7. doc-staleness               — docs/reference 無引用且超過 90 天未更新的過時文件
 *   8. os-tools                    — P3.3/P3.6 系統層依賴的 macOS 工具可用性（pbcopy/pbpaste/osascript/screencapture）+ heartbeat daemon 狀態
 *   9. component-chain             — Skill → Agent → Hook 依賴鏈斷裂偵測
 *  10. data-quality                — 全域學習資料（JSONL）格式與欄位正確性審計
 *  11. quality-trends              — 失敗模式 / 分數趨勢 / 低分連續警告
 *  12. test-growth                 — 測試套件增長率監控（超過基線 20% 時警告）
 *  13. closed-loop                 — 有 emit 但無 consumer 的孤立 timeline 事件偵測（製作原則 1）
 *  14. recovery-strategy           — handler 模組 + agent 是否定義失敗恢復行為（製作原則 2）
 *  15. completion-gap              — skill 是否缺少 references/ 子目錄（製作原則 3）
 *  16. dependency-sync             — SKILL.md 消費者表 vs agent frontmatter skills 一致性偵測
 *  17. internalization-index       — experience-index.json 格式、域完整性與時效性偵測
 *  18. test-file-alignment         — scripts/lib 模組是否有對應 tests/unit/ 測試檔案
 *  19. skill-reference-integrity   — SKILL.md 引用的 references/ 檔案是否實際存在
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
const AGENTS_DIR = path.join(PLUGIN_ROOT, 'agents');
const PROJECT_ROOT = findProjectRoot();
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');
const TESTS_DIR = path.join(PROJECT_ROOT, 'tests');

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

  // 掃描 emit 呼叫，支援四種模式：
  // 1. timeline.emit(sessionId, 'event:type', ...) — 方法呼叫，事件名在第二參數
  // 2. emit(sessionId, 'event:type', ...) — 函式呼叫，事件名在第二參數
  // 3. emit('event:type', ...) — 事件名在第一參數
  // 4. { type: 'event:type', ... } — 物件字面量（stop-message-builder 回傳的 timelineEvents）
  // 匹配含冒號的 event key（如 'workflow:start'、'session:compact-suggestion'）
  // [a-z][a-z-]* 允許第二部分含 hyphen（如 compact-suggestion、tasks-missing）
  const emitMethodRe  = /\.emit\s*\([^,]+,\s*['"]([a-z]+:[a-z][a-z-]*)['"]/g;
  const emitFuncRe    = /\bemit\s*\([^'"]+,\s*['"]([a-z]+:[a-z][a-z-]*)['"]/g;
  const emitDirectRe  = /\bemit\s*\(\s*['"]([a-z]+:[a-z][a-z-]*)['"]/g;
  const typeLiteralRe = /\btype:\s*['"]([a-z]+:[a-z][a-z-]*)['"]/g;

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
    // 物件字面量：{ type: 'event:type', ... }（stop-message-builder 等）
    for (const m of content.matchAll(typeLiteralRe)) addEvent(m[1]);
  }

  // 額外掃描 agents/*.md — bash printf 寫入 timeline 的事件（如 grader:score）
  const agentsDir = path.join(PLUGIN_ROOT, 'agents');
  const agentMdPattern = /"type":"([a-z]+:[a-z][a-z-]*)"/g;
  let agentFiles;
  try {
    agentFiles = readdirSync(agentsDir).filter((n) => n.endsWith('.md'));
  } catch {
    agentFiles = [];
  }
  for (const mdFile of agentFiles) {
    const fullPath = path.join(agentsDir, mdFile);
    const content = safeRead(fullPath);
    const addEvent = (evt) => {
      if (!emittedEvents.has(evt)) emittedEvents.set(evt, []);
      emittedEvents.get(evt).push(fullPath);
    };
    for (const m of content.matchAll(agentMdPattern)) addEvent(m[1]);
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

  // 收集 plugin 下所有 .js（排除 lib 自身、health-check 自身、node_modules）
  // 加入 tests/ 目錄，避免只在測試中使用的 exports 被誤報為 dead
  const allPluginJs = [
    ...collectJsFiles(PLUGIN_ROOT),
    ...collectJsFiles(TESTS_DIR),
  ].filter((f) => {
    return !f.includes('/node_modules/');
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
      // 1. const { exportKey } = require(...)  → 直接從 require 解構
      // 2. const { exportKey } = someVar       → 從已賦值變數解構（先 require 再解構）
      // 3. something.exportKey                 → 屬性存取
      // 4. { exportKey }                       → 解構賦值
      // 5. exportKey(                          → 直接呼叫
      const usagePattern = new RegExp(
        `(?:const|let|var)\\s*\\{[^}]*\\b${exportKey}\\b[^}]*\\}\\s*=|` +
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
  // agentCount 用 agents/ 目錄的 .md 檔案數（含非 workflow stage 的 agent，如 grader、claude-developer）
  let agentCount = 0;
  try {
    agentCount = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')).length;
  } catch { /* ignore */ }
  const workflowCount = Object.keys(workflows).length;
  const eventCount = Object.keys(timelineEvents).length;
  const stageCount = Object.keys(stages).length;

  // 計算 hook 數量（hooks.json 事件數）
  let hookCount = 0;
  try {
    const hooksJson = JSON.parse(safeRead(HOOKS_JSON));
    hookCount = (hooksJson.hooks && typeof hooksJson.hooks === 'object' && !Array.isArray(hooksJson.hooks))
      ? Object.keys(hooksJson.hooks).length
      : 0;
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

      // 排除複合短語：若 category 後面緊跟另一個詞（英文字母、中文字或連字符 -），
      // 則視為描述性片語（如「8 個 agent 消費」「14 stage shortcut」「L3.3 Skill Forge」），而非計數聲明。
      // 計數聲明後通常跟標點、空白、換行或句尾。
      const matchEnd = m.index + m[0].length;
      const afterText = content.slice(matchEnd, matchEnd + 20);
      if (/^[^\S\n]*[-a-zA-Z\u4e00-\u9fff]/.test(afterText)) {
        continue;
      }

      // 豁免：agent 數可以是 actual+1（grader.md 存在但不計入 registry stages，
      // 所以「17 個 agents」= 16 stage agents + grader，是正確的 all-agents 描述）
      if (category === 'agent' && docNum === actual + 1) {
        continue;
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

  // 收集 plugin 下所有 .js（排除 paths.js 自身、node_modules）
  // 加入 tests/ 目錄，避免只在測試中使用的 exports 被誤報為 dead
  const allPluginJs = [
    ...collectJsFiles(PLUGIN_ROOT),
    ...collectJsFiles(TESTS_DIR),
  ].filter((f) => {
    return (
      f !== pathsFile &&
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

  // ── 2. 偵測 in-progress tasks.md 幽靈 checkbox（workflow 模板已變更但 checkbox 殘留）──
  const { workflows } = require('./lib/registry');
  const specsLib = require('./lib/specs');
  const inProgressDir = path.join(PROJECT_ROOT, 'specs', 'features', 'in-progress');
  try {
    const featureDirs = readdirSync(inProgressDir);
    for (const dir of featureDirs) {
      const tasksPath = path.join(inProgressDir, dir, 'tasks.md');
      if (!safeRead(tasksPath)) continue;

      const fm = specsLib.readTasksFrontmatter(tasksPath);
      if (!fm || !fm.workflow) continue;

      const wf = workflows[fm.workflow];
      if (!wf) continue;

      const currentStages = new Set(wf.stages);
      const checkboxes = specsLib.readTasksCheckboxes(tasksPath);
      if (!checkboxes || checkboxes.total === 0) continue;

      // unchecked 陣列中找出不在當前 workflow stages 的幽靈 checkbox
      for (const label of checkboxes.unchecked) {
        if (!currentStages.has(label)) {
          findings.push({
            check: 'platform-drift',
            severity: 'warning',
            file: `specs/features/in-progress/${dir}/tasks.md`,
            message: `幽靈 checkbox「${label}」：workflow "${fm.workflow}" 已不含此 stage，tasks.md 需同步`,
          });
        }
      }
    }
  } catch { /* in-progress 目錄不存在時跳過 */ }

  // ── 3. 偵測棄用 tools 白名單（grader 例外）──
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

// ── 7. Doc Staleness 偵測 ──

/**
 * 掃描 docs/reference/ 下的 .md 檔案，偵測無引用且超過 90 天未更新的過時文件。
 * @returns {Finding[]}
 */
function checkDocStaleness() {
  const refDir = path.join(DOCS_DIR, 'reference');
  let refFiles;
  try {
    refFiles = readdirSync(refDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(refDir, f));
  } catch {
    return [];
  }

  if (refFiles.length === 0) return [];

  const findings = [];
  const now = Date.now();
  const STALE_DAYS = 90;
  const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

  // 收集所有可能引用 reference 的檔案
  // 掃描：plugin js + docs md + 專案根 md + CLAUDE.md
  const searchFiles = [];

  // plugin 下所有 .js
  searchFiles.push(...collectJsFiles(PLUGIN_ROOT).filter(f =>
    !f.includes('/node_modules/') && !f.includes('health-check.js')
  ));

  // docs/ 下所有 .md（排除 archive/ 和 reference/ 自身）
  const docsFiles = collectMdFiles(DOCS_DIR).filter(f =>
    !f.includes('/archive/') && !f.startsWith(refDir + path.sep)
  );
  searchFiles.push(...docsFiles);

  // 專案根 CLAUDE.md
  const claudeMd = path.join(PROJECT_ROOT, 'CLAUDE.md');
  if (safeRead(claudeMd)) searchFiles.push(claudeMd);

  // tests/ 下所有 .js
  const testsDir = path.join(PROJECT_ROOT, 'tests');
  searchFiles.push(...collectJsFiles(testsDir));

  for (const refFile of refFiles) {
    const fileName = path.basename(refFile);
    const fileNameNoExt = path.basename(refFile, '.md');

    // 檢查修改時間
    let mtime;
    try {
      mtime = statSync(refFile).mtimeMs;
    } catch {
      continue;
    }

    const daysSinceUpdate = Math.floor((now - mtime) / (24 * 60 * 60 * 1000));
    const isStale = (now - mtime) > STALE_MS;

    // 搜尋引用
    let referenced = false;
    for (const searchFile of searchFiles) {
      if (searchFile === refFile) continue;
      const content = safeRead(searchFile);
      // 搜尋檔名（含或不含副檔名）
      if (content.includes(fileName) || content.includes(fileNameNoExt)) {
        referenced = true;
        break;
      }
    }

    if (!referenced && isStale) {
      findings.push({
        check: 'doc-staleness',
        severity: 'warning',
        file: path.relative(PROJECT_ROOT, refFile),
        message: `docs/reference/${fileName} 無專案引用且 ${daysSinceUpdate} 天未更新，建議歸檔或刪除`,
        detail: `最後更新：${new Date(mtime).toISOString().split('T')[0]}，無引用`,
      });
    }
  }

  return findings;
}

// ── 8. OS Tools 可用性偵測 ──

/**
 * 偵測 P3.3 系統層所需的 macOS 工具是否可用。
 * 檢查 pbcopy、pbpaste、osascript 三個工具。
 * @returns {Finding[]}
 */
function checkOsTools() {
  if (process.platform !== 'darwin') {
    return [{
      check: 'os-tools',
      severity: 'info',
      file: 'scripts/os/',
      message: '非 macOS 平台，P3.3 系統層工具不可用',
    }];
  }

  const { execSync } = require('child_process');
  const { existsSync, readFileSync } = require('fs');
  const { HEARTBEAT_PID_FILE } = require('./lib/paths');

  const tools = ['pbcopy', 'pbpaste', 'osascript', 'screencapture'];
  const findings = [];

  for (const tool of tools) {
    try {
      execSync(`which ${tool}`, { stdio: 'pipe' });
    } catch {
      findings.push({
        check: 'os-tools',
        severity: 'warning',
        file: 'scripts/os/',
        message: `macOS 工具 "${tool}" 不可用，P3.3/P3.6 部分功能將無法正常運作`,
        detail: `which ${tool} 失敗`,
      });
    }
  }

  // heartbeat daemon 狀態偵測
  if (!existsSync(HEARTBEAT_PID_FILE)) {
    findings.push({
      check: 'os-tools',
      severity: 'info',
      file: 'scripts/heartbeat.js',
      message: 'heartbeat daemon 未在執行（PID 檔案不存在），自主控制功能不可用',
    });
  } else {
    let pidStr;
    try {
      pidStr = readFileSync(HEARTBEAT_PID_FILE, 'utf8').trim();
      const pid = parseInt(pidStr, 10);
      if (isNaN(pid)) {
        findings.push({
          check: 'os-tools',
          severity: 'warning',
          file: 'scripts/heartbeat.js',
          message: `heartbeat PID 檔案格式無效（內容：${pidStr}）`,
          detail: pidStr,
        });
      } else {
        // 確認 process 是否仍在執行
        try {
          process.kill(pid, 0);
          // process.kill(pid, 0) 不拋錯 → process 存活，無需記錄 finding
        } catch (killErr) {
          if (killErr.code === 'ESRCH') {
            findings.push({
              check: 'os-tools',
              severity: 'warning',
              file: 'scripts/heartbeat.js',
              message: `heartbeat daemon stale PID：process ${pid} 不存在`,
              detail: String(pid),
            });
          }
          // EPERM 代表 process 存在但無權限發訊號，視為存活
        }
      }
    } catch (readErr) {
      findings.push({
        check: 'os-tools',
        severity: 'warning',
        file: 'scripts/heartbeat.js',
        message: `heartbeat PID 檔案讀取失敗：${readErr.message}`,
      });
    }
  }

  return findings;
}

// ── 9. Component Chain 偵測 ──

/**
 * 偵測 Skill → Agent → Hook 依賴鏈的斷裂。
 *
 * 1. Agent → Stage 對齊：registry stages 每個 agent 的 .md 檔案是否存在
 * 2. Agent → Skill 引用：每個 agent frontmatter 的 skills 陣列中的 skill 是否存在
 *
 * @param {string} [pluginRootOverride] - 供測試使用的 pluginRoot 覆蓋
 * @returns {Finding[]}
 */
function checkComponentChain(pluginRootOverride) {
  const matter = require('gray-matter');
  const { existsSync } = require('fs');
  const { stages } = require('./lib/registry');

  const root = pluginRootOverride || PLUGIN_ROOT;
  const agentsDir = path.join(root, 'agents');
  const skillsDir = path.join(root, 'skills');

  const findings = [];

  // ── 1. Agent .md 存在性偵測 ──
  for (const [stageKey, stageDef] of Object.entries(stages)) {
    const agentName = stageDef.agent;
    if (!agentName) continue;

    const agentFile = path.join(agentsDir, `${agentName}.md`);
    if (!existsSync(agentFile)) {
      findings.push({
        check: 'component-chain',
        severity: 'error',
        file: path.relative(root, agentFile),
        message: `Stage "${stageKey}" 的 agent "${agentName}.md" 不存在`,
        detail: `預期路徑：${path.relative(root, agentFile)}`,
      });
      continue; // agent 不存在，跳過 skill 檢查
    }

    // ── 2. Agent → Skill 引用偵測 ──
    const rawContent = safeRead(agentFile);
    if (!rawContent) continue;

    let frontmatter;
    try {
      frontmatter = matter(rawContent).data;
    } catch {
      continue;
    }

    const skills = frontmatter.skills;
    if (!Array.isArray(skills) || skills.length === 0) continue;

    for (const skillName of skills) {
      const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
      if (!existsSync(skillFile)) {
        findings.push({
          check: 'component-chain',
          severity: 'warning',
          file: path.relative(root, agentFile),
          message: `agent "${agentName}" 引用的 skill "${skillName}" 不存在（SKILL.md 缺失）`,
          detail: `預期路徑：${path.relative(root, skillFile)}`,
        });
      }
    }
  }

  return findings;
}

// ── 10. Data Quality 學習資料品質審計 ──

/**
 * 掃描全域學習資料檔案，驗證格式正確性。
 *
 * 掃描路徑：~/.overtone/global/ 下所有專案目錄的 scores.jsonl、failures.jsonl、
 *           observations.jsonl、baselines.jsonl
 *
 * @returns {Finding[]}
 */
function checkDataQuality(globalDirOverride) {
  const { existsSync, readdirSync: readdir } = require('fs');
  const { GLOBAL_DIR } = require('./lib/paths');
  const targetDir = globalDirOverride || GLOBAL_DIR;

  // 各 JSONL 類型的驗證規則
  const fileRules = {
    'scores.jsonl': {
      required: ['ts', 'stage', 'agent', 'scores', 'overall'],
      validate: (record) => {
        const msgs = [];
        if (typeof record.overall !== 'number' || record.overall < 0 || record.overall > 5) {
          msgs.push(`overall 超出範圍：${record.overall}`);
        }
        if (record.scores && typeof record.scores === 'object') {
          for (const dim of ['clarity', 'completeness', 'actionability']) {
            const v = record.scores[dim];
            if (typeof v !== 'number' || v < 1 || v > 5) {
              msgs.push(`scores.${dim} 超出範圍：${v}`);
            }
          }
        }
        return msgs;
      },
    },
    'failures.jsonl': {
      required: ['ts', 'stage', 'agent', 'verdict'],
      validate: (record) => {
        const msgs = [];
        if (!['fail', 'reject'].includes(record.verdict)) {
          msgs.push(`verdict 非法值：${record.verdict}`);
        }
        return msgs;
      },
    },
    'observations.jsonl': {
      required: ['id', 'type', 'confidence'],
      validate: (record) => {
        const msgs = [];
        if (typeof record.confidence !== 'number' || record.confidence < 0 || record.confidence > 1) {
          msgs.push(`confidence 超出範圍：${record.confidence}`);
        }
        return msgs;
      },
    },
    'baselines.jsonl': {
      required: ['ts', 'workflowType'],
      validate: () => [],
    },
  };

  const findings = [];

  // 確認目錄存在
  if (!existsSync(targetDir)) {
    return [{
      check: 'data-quality',
      severity: 'info',
      file: '~/.overtone/global/',
      message: '全域學習資料目錄不存在（~/.overtone/global/），尚無學習資料',
    }];
  }

  // 列出所有專案 hash 子目錄
  let projectDirs = [];
  try {
    projectDirs = readdir(targetDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(targetDir, e.name));
  } catch {
    return [];
  }

  if (projectDirs.length === 0) {
    return [{
      check: 'data-quality',
      severity: 'info',
      file: '~/.overtone/global/',
      message: '全域學習資料目錄為空，尚無學習資料',
    }];
  }

  // 聚合統計（每種檔案類型一個 finding，避免大量 project hash 產生爆炸性 findings）
  const stats = {}; // { fileName: { totalFiles, corruptFiles, totalLines, corruptLines } }

  for (const projectDir of projectDirs) {
    for (const [fileName, rules] of Object.entries(fileRules)) {
      const filePath = path.join(projectDir, fileName);
      if (!existsSync(filePath)) continue;

      const content = safeRead(filePath).trim();
      if (!content) continue;

      if (!stats[fileName]) stats[fileName] = { totalFiles: 0, corruptFiles: 0, totalLines: 0, corruptLines: 0 };
      const s = stats[fileName];

      const lines = content.split('\n');
      let corruptedCount = 0;
      let totalCount = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        totalCount++;

        let record;
        try {
          record = JSON.parse(line);
        } catch {
          corruptedCount++;
          continue;
        }

        // 必要欄位檢查
        const missingFields = rules.required.filter((f) => record[f] === undefined || record[f] === null);
        if (missingFields.length > 0) {
          corruptedCount++;
          continue;
        }

        // 值域驗證
        const validationErrors = rules.validate(record);
        if (validationErrors.length > 0) {
          corruptedCount++;
        }
      }

      if (totalCount === 0) continue;

      s.totalFiles++;
      s.totalLines += totalCount;
      s.corruptLines += corruptedCount;
      if (corruptedCount / totalCount > 0.1) s.corruptFiles++;
    }
  }

  // 產生聚合 findings
  for (const [fileName, s] of Object.entries(stats)) {
    if (s.corruptFiles > 0) {
      const overallRate = Math.round(s.corruptLines / s.totalLines * 100);
      findings.push({
        check: 'data-quality',
        severity: 'warning',
        file: `~/.overtone/global/*/${fileName}`,
        message: `${fileName} 在 ${s.corruptFiles}/${s.totalFiles} 個專案目錄中損壞比例 > 10%（全域：${s.corruptLines}/${s.totalLines} 行，${overallRate}%）`,
        detail: `損壞檔案數：${s.corruptFiles}，總檔案數：${s.totalFiles}，損壞行數：${s.corruptLines}，總行數：${s.totalLines}`,
      });
    } else if (s.corruptLines > 0) {
      findings.push({
        check: 'data-quality',
        severity: 'info',
        file: `~/.overtone/global/*/${fileName}`,
        message: `${fileName} 全域有 ${s.corruptLines} 行損壞（${s.totalLines} 行中，${s.totalFiles} 個檔案）`,
        detail: `損壞行數：${s.corruptLines}，總行數：${s.totalLines}`,
      });
    }
  }

  return findings;
}

// ── 11. Quality Trends 品質趨勢警告 ──

/**
 * 分析學習資料中的異常模式。
 *
 * 1. 失敗模式偵測：某 stage 失敗 >= 3 次 → warning
 * 2. 分數趨勢偵測：direction === 'degrading' → warning
 * 3. 低分連續偵測：avgOverall < lowScoreThreshold 且 sessionCount >= 3 → warning
 *
 * @param {string} [projectRootOverride] - 供測試使用的 projectRoot 覆蓋
 * @returns {Finding[]}
 */
function checkQualityTrends(projectRootOverride) {
  const projectRoot = projectRootOverride || process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  const { scoringConfig } = require('./lib/registry');
  const { getFailurePatterns } = require('./lib/failure-tracker');
  const { computeScoreTrend, getScoreSummary } = require('./lib/score-engine');

  const findings = [];
  const FAILURE_THRESHOLD = 10;

  // ── 1. 失敗模式偵測 ──
  try {
    const patterns = getFailurePatterns(projectRoot);
    for (const [stage, data] of Object.entries(patterns.byStage)) {
      if (data.count >= FAILURE_THRESHOLD) {
        findings.push({
          check: 'quality-trends',
          severity: 'warning',
          file: '~/.overtone/global/',
          message: `Stage "${stage}" 最近失敗 ${data.count} 次，存在重複失敗模式`,
          detail: `stage: ${stage}，失敗次數：${data.count}`,
        });
      }
    }
  } catch {
    // 失敗模式偵測失敗，靜默跳過
  }

  // ── 2. 分數趨勢偵測 ──
  for (const stageKey of scoringConfig.gradedStages) {
    try {
      const trend = computeScoreTrend(projectRoot, stageKey);
      if (trend && trend.direction === 'degrading') {
        findings.push({
          check: 'quality-trends',
          severity: 'warning',
          file: '~/.overtone/global/',
          message: `Stage "${stageKey}" 品質評分呈下降趨勢（${trend.firstHalfAvg} → ${trend.secondHalfAvg}）`,
          detail: `direction: degrading，分析 ${trend.sessionCount} 筆記錄`,
        });
      }
    } catch {
      // 個別 stage 趨勢分析失敗，靜默跳過
    }
  }

  // ── 3. 低分連續偵測 ──
  for (const stageKey of scoringConfig.gradedStages) {
    try {
      const summary = getScoreSummary(projectRoot, stageKey);
      if (
        summary.sessionCount >= 3 &&
        summary.avgOverall !== null &&
        summary.avgOverall < scoringConfig.lowScoreThreshold
      ) {
        findings.push({
          check: 'quality-trends',
          severity: 'warning',
          file: '~/.overtone/global/',
          message: `Stage "${stageKey}" 近期平均分 ${summary.avgOverall}/5.0 低於門檻（${scoringConfig.lowScoreThreshold}），共 ${summary.sessionCount} 筆`,
          detail: `avgOverall: ${summary.avgOverall}，threshold: ${scoringConfig.lowScoreThreshold}，sessionCount: ${summary.sessionCount}`,
        });
      }
    } catch {
      // 個別 stage 摘要查詢失敗，靜默跳過
    }
  }

  return findings;
}

// ── 12. Test Growth 測試增長率偵測 ──

/**
 * 測試增長基線快照（硬編碼常數）。
 * 當測試數量或檔案數量相對基線增長超過 THRESHOLD 時，回報 warning。
 */
const TEST_BASELINE = { tests: 3023, files: 188, date: '2026-03-06' };
const TEST_GROWTH_THRESHOLD = 0.20; // 20%

/**
 * 取得當前測試計數（預設實作：用 find 和 grep 快速計數，不執行 bun test）
 * @returns {{ tests: number, files: number }}
 */
function _getTestCounts() {
  const { execSync } = require('child_process');

  // 計算 .test.js 檔案數量
  let files = 0;
  try {
    const result = execSync(`find "${TESTS_DIR}" -name "*.test.js" | wc -l`, {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    files = parseInt(result.trim(), 10) || 0;
  } catch { /* 失敗時保持 0 */ }

  // 計算 test( 呼叫次數（估算測試數量）
  let tests = 0;
  try {
    const result = execSync(`grep -r --include="*.test.js" -c "^[[:space:]]*test(" "${TESTS_DIR}" | awk -F: '{sum+=$2} END{print sum}'`, {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    tests = parseInt(result.trim(), 10) || 0;
  } catch { /* 失敗時保持 0 */ }

  return { tests, files };
}

/**
 * 偵測測試套件增長率是否超過基線閾值（20%）。
 *
 * 使用 DI pattern：測試可注入假的計數函式，無需實際執行 bun test。
 *
 * @param {function(): {tests: number, files: number}} [getDepsOverride] - 供測試注入假計數
 * @returns {Finding[]}
 */
function checkTestGrowth(getDepsOverride) {
  const getCounts = getDepsOverride || _getTestCounts;

  let current;
  try {
    current = getCounts();
  } catch (err) {
    return [{
      check: 'test-growth',
      severity: 'warning',
      file: 'tests/',
      message: `取得測試計數時發生錯誤：${err.message || String(err)}`,
    }];
  }

  const findings = [];

  // 計算測試數量增長率
  if (current.tests > 0 && TEST_BASELINE.tests > 0) {
    const growthRate = (current.tests - TEST_BASELINE.tests) / TEST_BASELINE.tests;
    const growthPct = Math.round(growthRate * 100);
    const thresholdPct = Math.round(TEST_GROWTH_THRESHOLD * 100);

    if (growthRate > TEST_GROWTH_THRESHOLD) {
      findings.push({
        check: 'test-growth',
        severity: 'warning',
        file: 'tests/',
        message: `tests: ${current.tests} (+${growthPct}%, threshold: ${thresholdPct}%)`,
        detail: `baseline: ${TEST_BASELINE.tests} (${TEST_BASELINE.date})，current: ${current.tests}，growth: +${growthPct}%`,
      });
    } else {
      // pass — 附加 detail 供參考（不加進 findings，不算 finding）
      // 注意：pass 不會產生 finding，runAllChecks 會把 findingsCount = 0 標記 passed = true
    }
  }

  // 計算檔案數量增長率
  if (current.files > 0 && TEST_BASELINE.files > 0) {
    const growthRate = (current.files - TEST_BASELINE.files) / TEST_BASELINE.files;
    const growthPct = Math.round(growthRate * 100);
    const thresholdPct = Math.round(TEST_GROWTH_THRESHOLD * 100);

    if (growthRate > TEST_GROWTH_THRESHOLD) {
      findings.push({
        check: 'test-growth',
        severity: 'warning',
        file: 'tests/',
        message: `files: ${current.files} (+${growthPct}%, threshold: ${thresholdPct}%)`,
        detail: `baseline: ${TEST_BASELINE.files} (${TEST_BASELINE.date})，current: ${current.files}，growth: +${growthPct}%`,
      });
    }
  }

  return findings;
}

// ── 13. Closed Loop 孤立事件流偵測（製作原則 1）──

/**
 * 偵測有 emit 但無任何 consumer 的孤立 timeline 事件。
 *
 * Consumer 定義：codebase 中有 timeline.query(sid, { type: 'event:name' })、
 * timeline.latest(sid, 'event:name') 或 .type === 'event:name' 呼叫。
 *
 * 三類排除：
 *   A. fire-and-forget — session:compact-suggestion、hook:timing、queue:auto-write
 *   B. 全量消費者覆蓋（Dashboard SSE + session-digest 全量讀取 / score-engine）——
 *      這些事件由全量 timeline 讀取消費，不需要專屬 type 過濾呼叫
 *   C. 主動回應事件（error:fatal, tool:failure, system:warning）——
 *      保留 warning，這些事件發生時應有主動處理邏輯
 *
 * @returns {Finding[]}
 */
function checkClosedLoop() {
  const { timelineEvents } = require('./lib/registry');
  const { existsSync } = require('fs');

  // 從 registry 讀取 consumeMode，只檢查 targeted 事件（需專屬 consumer）
  // broadcast（全量消費者覆蓋）和 fire-and-forget（純記錄）不需要專屬 consumer

  // 收集 plugin 目錄下所有 .js，排除 health-check.js 本身 + node_modules
  const allJs = collectJsFiles(PLUGIN_ROOT).filter((f) => {
    return (
      f !== __filename &&
      !f.includes('/node_modules/') &&
      !f.includes('health-check.js')
    );
  });

  // Consumer regex（精確匹配 type 字串）
  // timeline.query(sid, { type: 'event:name' }) 或含 type: 的物件字面量位置
  const queryTypeRe  = /timeline\.query\s*\([^,]+,\s*\{[^}]*type\s*:\s*['"]([a-z]+:[a-z][a-z-]*)['"][^}]*\}/g;
  // timeline.latest(sid, 'event:name')
  const latestTypeRe = /timeline\.latest\s*\([^,]+,\s*['"]([a-z]+:[a-z][a-z-]*)['"]/g;
  // filter.type === 'event:name' 或 .type === 'event:name'（timeline.js 內部）
  const filterTypeRe = /\.type\s*[=!]=\s*['"]([a-z]+:[a-z][a-z-]*)['"]/g;

  const consumedEvents = new Set();

  for (const f of allJs) {
    const content = safeRead(f);
    for (const m of content.matchAll(queryTypeRe))  consumedEvents.add(m[1]);
    for (const m of content.matchAll(latestTypeRe)) consumedEvents.add(m[1]);
    for (const m of content.matchAll(filterTypeRe)) consumedEvents.add(m[1]);
  }

  const findings = [];
  const registryFile = toRelative(require('path').join(SCRIPTS_LIB, 'registry.js'));

  for (const eventKey of Object.keys(timelineEvents)) {
    const mode = timelineEvents[eventKey].consumeMode || 'targeted';
    if (mode !== 'targeted') continue;  // broadcast / fire-and-forget 不需要專屬 consumer
    if (!consumedEvents.has(eventKey)) {
      findings.push({
        check: 'closed-loop',
        severity: 'warning',
        file: registryFile,
        message: `timeline 事件 "${eventKey}" 有 emit 但無 consumer（製作原則 1：完全閉環）`,
        detail: `事件未被 timeline.query 或 timeline.latest 消費，可能缺少回饋路徑`,
      });
    }
  }

  return findings;
}

// ── 14. Recovery Strategy 失敗恢復策略偵測（製作原則 2）──

/**
 * 偵測 handler 模組和 agent prompt 是否定義失敗恢復行為。
 *
 * 子項 1：掃描 scripts/lib/*-handler.js，主入口函式（handle* 或 run）是否含 try {
 * 子項 2：掃描 agents/*.md，body 是否含停止條件相關關鍵詞
 *
 * @param {string} [pluginRootOverride] — 供測試覆蓋 plugin 根目錄
 * @returns {Finding[]}
 */
function checkRecoveryStrategy(pluginRootOverride) {
  const { existsSync } = require('fs');
  const matter = require('gray-matter');

  const root = pluginRootOverride || PLUGIN_ROOT;
  const scriptsLib = require('path').join(root, 'scripts', 'lib');
  const agentsDir = require('path').join(root, 'agents');
  const findings = [];

  // ── 子項 1：Handler 模組 try-catch 掃描 ──
  let handlerFiles = [];
  try {
    handlerFiles = readdirSync(scriptsLib).filter((f) => f.endsWith('-handler.js'));
  } catch { /* 目錄不存在時跳過 */ }

  for (const handlerFile of handlerFiles) {
    const filePath = require('path').join(scriptsLib, handlerFile);
    const content = safeRead(filePath);
    if (!content) continue;

    // 找主入口函式：function handle* 或 function run
    const mainFnRe = /^function\s+(handle\w+|run)\s*\(/m;
    const fallbackFnRe = /^function\s+\w+\s*\(/m;

    let fnName = null;
    let fnMatch = content.match(mainFnRe);
    if (!fnMatch) {
      fnMatch = content.match(fallbackFnRe);
    }
    if (fnMatch) {
      fnName = fnMatch[1] || fnMatch[0];
    }

    // 取得函式 body（從函式名開始到檔案末尾，尋找 try {）
    // 策略：若主入口函式存在，取其後的內容；否則掃描整個檔案
    let bodyToCheck = content;
    if (fnMatch && fnMatch.index !== undefined) {
      bodyToCheck = content.slice(fnMatch.index);
    }

    const hasTryCatch = /\btry\s*\{/.test(bodyToCheck);
    if (!hasTryCatch) {
      const relPath = require('path').relative(root, filePath);
      findings.push({
        check: 'recovery-strategy',
        severity: 'warning',
        file: relPath,
        message: `${handlerFile} 主入口函式缺少頂層 try-catch 保護（製作原則 2：自動修復）`,
        detail: `建議在主入口函式 body 頂層加入 try { ... } catch(err) { ... } 保護`,
      });
    }
  }

  // ── 子項 2：Agent prompt 停止條件掃描 ──
  const RECOVERY_KEYWORDS = ['停止條件', 'STOP', '誤判防護', '失敗恢復', 'error recovery', '停止點'];

  let agentFiles = [];
  try {
    agentFiles = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  } catch { /* 目錄不存在時跳過 */ }

  for (const agentFile of agentFiles) {
    const filePath = require('path').join(agentsDir, agentFile);
    const rawContent = safeRead(filePath);
    if (!rawContent) continue;

    let parsed;
    try {
      parsed = matter(rawContent);
    } catch { continue; }

    const body = parsed.content || '';
    const agentName = (parsed.data && parsed.data.name) || agentFile.replace(/\.md$/, '');

    const hasKeyword = RECOVERY_KEYWORDS.some((kw) => body.includes(kw));
    if (!hasKeyword) {
      const relPath = require('path').relative(root, filePath);
      findings.push({
        check: 'recovery-strategy',
        severity: 'warning',
        file: relPath,
        message: `agent "${agentName}" 缺少停止條件或誤判防護描述（製作原則 2：自動修復）`,
        detail: `建議在 agent prompt 中加入停止條件、誤判防護或失敗恢復策略描述`,
      });
    }
  }

  return findings;
}

// ── 15. Completion Gap 補全能力缺口偵測（製作原則 3）──

/**
 * 偵測 skill 目錄是否缺少 references/ 子目錄。
 *
 * Orchestrator 類型 skill（auto、workflow-core）本質是工作流選擇器/指揮器，
 * 不需要知識型 references 目錄，故排除在外。
 *
 * @param {string} [skillsDirOverride] — 供測試覆蓋 skills 目錄
 * @returns {Finding[]}
 */
function checkCompletionGap(skillsDirOverride) {
  const { existsSync } = require('fs');
  const skillsDir = skillsDirOverride || SKILLS_DIR;
  const findings = [];

  // Orchestrator 類型 skill：工作流選擇器/指揮器，不需要 references 子目錄
  const ORCHESTRATOR_SKILLS = new Set(['auto', 'workflow-core']);

  let skillDirs = [];
  try {
    skillDirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  for (const skillName of skillDirs) {
    if (ORCHESTRATOR_SKILLS.has(skillName)) continue;  // orchestrator skill 無需 references
    const refsDir = require('path').join(skillsDir, skillName, 'references');
    if (!existsSync(refsDir)) {
      findings.push({
        check: 'completion-gap',
        severity: 'warning',
        file: `skills/${skillName}/`,
        message: `skill "${skillName}" 缺少 references/ 目錄，可能影響補全能力偵測（製作原則 3：補全能力）`,
        detail: `建議在 skills/${skillName}/references/ 下加入 .md 參考文件`,
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

// ── 16. Dependency Sync 依賴一致性偵測 ──

// 用 dependency-graph 掃描 SKILL.md 消費者表 vs agent frontmatter 的 skills 欄位，
// 偵測兩端不一致（agent 宣告了 skill 但 SKILL.md 消費者表沒列、或反之）。
function checkDependencySync(pluginRootOverride) {
  const findings = [];
  const root = pluginRootOverride || PLUGIN_ROOT;

  let buildGraph;
  try {
    buildGraph = require('./lib/dependency-graph').buildGraph;
  } catch {
    return findings; // dependency-graph 不可用時靜默跳過
  }

  let graph;
  try {
    graph = buildGraph(root);
  } catch {
    return findings;
  }

  const matter = require('gray-matter');
  const { existsSync } = require('fs');
  const agentsDir = path.join(root, 'agents');
  const skillsDir = path.join(root, 'skills');

  // 收集 agent → skills 映射（from frontmatter）
  const agentSkillMap = new Map(); // agentName → Set<skillName>
  let agentFiles;
  try {
    agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  } catch {
    return findings;
  }

  for (const file of agentFiles) {
    const agentName = file.replace(/\.md$/, '');
    const content = safeRead(path.join(agentsDir, file));
    if (!content) continue;
    try {
      const fm = matter(content).data;
      const skills = fm.skills;
      if (Array.isArray(skills) && skills.length > 0) {
        agentSkillMap.set(agentName, new Set(skills));
      }
    } catch { /* 靜默跳過 */ }
  }

  // 收集 SKILL.md 消費者表（from SKILL.md content）
  const skillConsumerMap = new Map(); // skillName → Set<agentName>
  let skillDirs;
  try {
    skillDirs = readdirSync(skillsDir).filter(d => {
      try { return statSync(path.join(skillsDir, d)).isDirectory(); } catch { return false; }
    });
  } catch {
    return findings;
  }

  for (const skillName of skillDirs) {
    const skillMd = path.join(skillsDir, skillName, 'SKILL.md');
    const content = safeRead(skillMd);
    if (!content) continue;

    // 解析消費者表：| Agent | 用途 | 格式
    const consumers = new Set();
    const tableRe = /\|\s*(\w[\w-]*)\s*\|/g;
    // 找消費者區段
    const consumerSection = content.match(/##\s*消費者[\s\S]*?(?=\n##|\n---|\n$)/);
    if (consumerSection) {
      let m;
      while ((m = tableRe.exec(consumerSection[0])) !== null) {
        const name = m[1];
        // 排除表頭
        if (name !== 'Agent' && name !== 'agent' && name !== '---') {
          consumers.add(name);
        }
      }
    }
    if (consumers.size > 0) {
      skillConsumerMap.set(skillName, consumers);
    }
  }

  // 比對 1：agent frontmatter 宣告 skill，但 SKILL.md 消費者表未列此 agent
  for (const [agentName, skills] of agentSkillMap) {
    for (const skillName of skills) {
      const consumers = skillConsumerMap.get(skillName);
      if (consumers && !consumers.has(agentName)) {
        findings.push({
          check: 'dependency-sync',
          severity: 'warning',
          file: `agents/${agentName}.md`,
          message: `agent "${agentName}" 的 frontmatter 引用 skill "${skillName}"，但 ${skillName}/SKILL.md 消費者表未列出此 agent`,
          detail: `SKILL.md 消費者表列出：${[...consumers].join(', ')}`,
        });
      }
    }
  }

  // 比對 2：SKILL.md 消費者表列了 agent，但該 agent frontmatter 沒有此 skill
  for (const [skillName, consumers] of skillConsumerMap) {
    for (const agentName of consumers) {
      const agentSkills = agentSkillMap.get(agentName);
      if (agentSkills && !agentSkills.has(skillName)) {
        findings.push({
          check: 'dependency-sync',
          severity: 'warning',
          file: `skills/${skillName}/SKILL.md`,
          message: `${skillName}/SKILL.md 消費者表列出 agent "${agentName}"，但該 agent frontmatter 未引用此 skill`,
          detail: `agent frontmatter skills：${[...agentSkills].join(', ')}`,
        });
      }
    }
  }

  return findings;
}

// ── 17. Internalization Index 內化索引健康偵測 ──

/**
 * 偵測 ~/.overtone/global/ 下所有 experience-index.json 的健康狀態。
 *
 * 偵測項目：
 *   - 索引不存在（任何 global 子目錄下均無 experience-index.json）→ info
 *   - 索引存在但 JSON 格式損壞 → warning
 *   - 索引中有 domains 為空陣列的條目 → warning
 *   - 索引中所有條目的 lastUpdated 均超過 30 天 → info
 *   - 索引健康 → 無 finding
 *
 * @param {string} [globalDirOverride] — 供測試覆蓋 global 目錄（預設 ~/.overtone/global）
 * @returns {Finding[]}
 */
function checkInternalizationIndex(globalDirOverride) {
  const os = require('os');
  const { existsSync } = require('fs');
  const findings = [];

  const globalDir = globalDirOverride || require('path').join(os.homedir(), '.overtone', 'global');

  // 收集所有 experience-index.json 路徑
  const indexFiles = [];
  try {
    const subdirs = readdirSync(globalDir, { withFileTypes: true });
    for (const entry of subdirs) {
      if (entry.isDirectory()) {
        const candidatePath = path.join(globalDir, entry.name, 'experience-index.json');
        if (existsSync(candidatePath)) {
          indexFiles.push(candidatePath);
        }
      }
    }
  } catch {
    // globalDir 不存在或無法讀取 → 視同索引尚未建立
  }

  // 索引不存在
  if (indexFiles.length === 0) {
    findings.push({
      check: 'internalization-index',
      severity: 'info',
      file: 'global/experience-index.json',
      message: 'experience-index.json 尚未建立（Skill Internalization 尚未啟用）',
      detail: '執行 `bun evolution.js internalize --execute` 後索引將自動建立',
    });
    return findings;
  }

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const indexPath of indexFiles) {
    const raw = safeRead(indexPath);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      findings.push({
        check: 'internalization-index',
        severity: 'warning',
        file: path.relative(path.join(globalDir, '..'), indexPath),
        message: `experience-index.json JSON 格式損壞，無法解析`,
        detail: `檔案路徑：${indexPath}`,
      });
      continue;
    }

    if (!data || !Array.isArray(data.entries)) {
      findings.push({
        check: 'internalization-index',
        severity: 'warning',
        file: path.relative(path.join(globalDir, '..'), indexPath),
        message: `experience-index.json 格式不符合預期（缺少 entries 陣列）`,
        detail: `檔案路徑：${indexPath}`,
      });
      continue;
    }

    // 偵測 domains 為空的條目
    const emptyDomainEntries = data.entries.filter(
      (e) => !Array.isArray(e.domains) || e.domains.length === 0,
    );
    if (emptyDomainEntries.length > 0) {
      findings.push({
        check: 'internalization-index',
        severity: 'warning',
        file: path.relative(path.join(globalDir, '..'), indexPath),
        message: `experience-index.json 中有 ${emptyDomainEntries.length} 筆條目的 domains 為空陣列`,
        detail: `無效條目 projectHash：${emptyDomainEntries.map((e) => e.projectHash).join(', ')}`,
      });
    }

    // 偵測所有條目均超過 30 天未更新
    if (data.entries.length > 0) {
      const allStale = data.entries.every((e) => {
        if (!e.lastUpdated) return true;
        const ts = new Date(e.lastUpdated).getTime();
        return isNaN(ts) || (now - ts) > THIRTY_DAYS_MS;
      });
      if (allStale) {
        findings.push({
          check: 'internalization-index',
          severity: 'info',
          file: path.relative(path.join(globalDir, '..'), indexPath),
          message: `experience-index.json 所有條目均超過 30 天未更新，索引可能過時`,
          detail: '建議重新執行 `bun evolution.js internalize --execute` 更新索引',
        });
      }
    }
  }

  return findings;
}

// ── 18. Test File Alignment 測試覆蓋對齊偵測 ──

/**
 * 確認每個 scripts/lib/*.js 模組都有對應的 tests/unit/ 測試檔案。
 *
 * 對應規則（寬鬆）：tests/unit/ 下存在任何以 {moduleName} 為前綴的 .test.js 即視為有覆蓋。
 * 例如 state.js → state.test.js 或 state-invariants.test.js 皆視為有覆蓋。
 *
 * 子目錄（dashboard/、remote/）不在偵測範圍（通常由 integration 測試覆蓋）。
 *
 * @param {string} [scriptsLibOverride] — 供測試覆蓋 scripts/lib 目錄
 * @param {string} [unitTestsDirOverride] — 供測試覆蓋 tests/unit 目錄
 * @returns {Finding[]}
 */
function checkTestFileAlignment(scriptsLibOverride, unitTestsDirOverride) {
  const { existsSync } = require('fs');
  const libDir = scriptsLibOverride || SCRIPTS_LIB;
  const unitDir = unitTestsDirOverride || path.join(PROJECT_ROOT, 'tests', 'unit');
  const findings = [];

  // 收集 tests/unit/ 下所有 .test.js 的前綴名稱（去掉 .test.js）
  let testFileNames = [];
  try {
    testFileNames = readdirSync(unitDir)
      .filter((f) => f.endsWith('.test.js'))
      .map((f) => f.replace(/\.test\.js$/, ''));
  } catch {
    return []; // 測試目錄不存在時跳過
  }

  // 收集 scripts/lib/*.js（只掃頂層，不含子目錄）
  let libFiles = [];
  try {
    libFiles = readdirSync(libDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => e.name);
  } catch {
    return [];
  }

  for (const libFile of libFiles) {
    const moduleName = libFile.replace(/\.js$/, '');

    // 寬鬆比對：任何以 moduleName 為前綴的測試檔案均視為有覆蓋
    // 例如 state.js → state.test.js / state-invariants.test.js / state-helpers.test.js
    const hasTest = testFileNames.some(
      (t) => t === moduleName || t.startsWith(moduleName + '-')
    );

    if (!hasTest) {
      findings.push({
        check: 'test-file-alignment',
        severity: 'warning',
        file: `plugins/overtone/scripts/lib/${libFile}`,
        message: `scripts/lib/${libFile} 缺少對應的 tests/unit/ 測試檔案`,
        detail: `建議新增 tests/unit/${moduleName}.test.js 或含前綴的測試檔案`,
      });
    }
  }

  return findings;
}

// ── 19. Skill Reference Integrity SKILL.md 引用完整性偵測 ──

/**
 * 確認 SKILL.md 中引用的 references/ 和 examples/ 檔案實際存在。
 *
 * 掃描兩種引用格式：
 *   1. 表格中的相對路徑：`references/some-file.md` 或 `examples/some-file.md`
 *   2. 按需讀取行：`${CLAUDE_PLUGIN_ROOT}/skills/{skill}/references/{file}.md`（取 references/ 後的部分）
 *
 * @param {string} [skillsDirOverride] — 供測試覆蓋 skills 目錄
 * @returns {Finding[]}
 */
function checkSkillReferenceIntegrity(skillsDirOverride) {
  const { existsSync } = require('fs');
  const skillsDir = skillsDirOverride || SKILLS_DIR;
  const findings = [];

  let skillDirs = [];
  try {
    skillDirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  for (const skillName of skillDirs) {
    const skillMdPath = path.join(skillsDir, skillName, 'SKILL.md');
    const content = safeRead(skillMdPath);
    if (!content) continue;

    // 格式 1：表格欄位中的相對路徑 `references/xxx.md` 或 `examples/xxx.md`
    // 這類路徑相對於當前 skill 目錄
    // 只在不含 ${CLAUDE_PLUGIN_ROOT} 的行中匹配，避免與格式 2 重疊
    const relativePathRe = /\b(references|examples)\/([^\s|`'"]+\.md)\b/g;
    const selfRefs = new Set();
    for (const line of content.split('\n')) {
      if (line.includes('${CLAUDE_PLUGIN_ROOT}')) continue; // 由格式 2 處理
      for (const m of line.matchAll(relativePathRe)) {
        selfRefs.add(`${m[1]}/${m[2]}`);
      }
    }

    for (const refRelPath of selfRefs) {
      const fullPath = path.join(skillsDir, skillName, refRelPath);
      if (!existsSync(fullPath)) {
        findings.push({
          check: 'skill-reference-integrity',
          severity: 'error',
          file: `plugins/overtone/skills/${skillName}/SKILL.md`,
          message: `skill "${skillName}" 的 SKILL.md 引用了不存在的檔案：${refRelPath}`,
          detail: `預期路徑：skills/${skillName}/${refRelPath}`,
        });
      }
    }

    // 格式 2：${CLAUDE_PLUGIN_ROOT}/skills/{targetSkill}/{type}/{file}.md
    // 這類路徑跨 skill 引用，需要驗證目標 skill 目錄中的檔案
    const pluginRootRe = /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/([^/\s`'"]+)\/(references|examples)\/([^\s`'"]+\.md)/g;
    const crossRefKeys = new Set(); // 用字串 key 去重
    const crossRefs = [];
    for (const m of content.matchAll(pluginRootRe)) {
      const key = `${m[1]}/${m[2]}/${m[3]}`;
      if (!crossRefKeys.has(key)) {
        crossRefKeys.add(key);
        crossRefs.push({ targetSkill: m[1], type: m[2], file: m[3] });
      }
    }

    for (const ref of crossRefs) {
      const fullPath = path.join(skillsDir, ref.targetSkill, ref.type, ref.file);
      if (!existsSync(fullPath)) {
        findings.push({
          check: 'skill-reference-integrity',
          severity: 'error',
          file: `plugins/overtone/skills/${skillName}/SKILL.md`,
          message: `skill "${skillName}" 的 SKILL.md 引用了不存在的檔案：${ref.targetSkill}/${ref.type}/${ref.file}`,
          detail: `預期路徑：skills/${ref.targetSkill}/${ref.type}/${ref.file}`,
        });
      }
    }
  }

  return findings;
}

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
    { name: 'doc-staleness',    fn: checkDocStaleness },
    { name: 'os-tools',         fn: checkOsTools },
    { name: 'component-chain',   fn: checkComponentChain },
    { name: 'data-quality',      fn: checkDataQuality },
    { name: 'quality-trends',    fn: checkQualityTrends },
    { name: 'test-growth',       fn: checkTestGrowth },
    { name: 'closed-loop',       fn: checkClosedLoop },
    { name: 'recovery-strategy', fn: checkRecoveryStrategy },
    { name: 'completion-gap',         fn: checkCompletionGap },
    { name: 'dependency-sync',        fn: checkDependencySync },
    { name: 'internalization-index',  fn: checkInternalizationIndex },
    { name: 'test-file-alignment',    fn: checkTestFileAlignment },
    { name: 'skill-reference-integrity', fn: checkSkillReferenceIntegrity },
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
  const passed   = errors === 0;

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
  checkDocStaleness,
  checkOsTools,
  checkComponentChain,
  checkDataQuality,
  checkQualityTrends,
  checkTestGrowth,
  checkClosedLoop,
  checkRecoveryStrategy,
  checkCompletionGap,
  checkDependencySync,
  checkInternalizationIndex,
  checkTestFileAlignment,
  checkSkillReferenceIntegrity,
  runAllChecks,
  // 測試 DI 支援
  TEST_BASELINE,
  TEST_GROWTH_THRESHOLD,
  // 工具函式
  collectJsFiles,
  collectMdFiles,
  parseModuleExportKeys,
  parsePathsExports,
  toRelative,
  PLUGIN_ROOT,
  SCRIPTS_LIB,
  HOOKS_SCRIPTS,
  DOCS_DIR,
  PROJECT_ROOT,
};
