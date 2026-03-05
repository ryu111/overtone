'use strict';
/**
 * project-orchestrator.js — Project Orchestrator（L3.5）
 *
 * 從 ProjectSpec 到填充佇列的端到端協調模組：
 *   1. parseSpecToText — 將 ProjectSpec 物件或 Markdown 字串轉為純文字
 *   2. extractFeatureList — 從 ProjectSpec 提取 feature 清單
 *   3. orchestrate — 主協調 API：gap 偵測 → skill forge → 佇列排程
 *
 * OrchestrateResult:
 *   {
 *     domainAudit: { present: string[], missing: string[], gaps: Gap[] },
 *     forgeResults: ForgeResult[],
 *     queueResult: object,
 *     summary: { totalDomains, presentCount, missingCount, forgedCount, featureCount, dryRun }
 *   }
 */

const path = require('path');
const fs = require('fs');
const { detectKnowledgeGaps } = require('./knowledge/knowledge-gap-detector');
const { queryIndex } = require('./knowledge/experience-index');
const { forgeSkill } = require('./skill-forge');
const { appendQueue, writeQueue } = require('./execution-queue');

// ── 路徑解析 ──

function resolvePluginRoot(override) {
  if (override) return override;
  // project-orchestrator.js 位於 scripts/lib/，往上兩層到 plugin root
  return path.resolve(__dirname, '..', '..');
}

// ── parseSpecToText ──

/**
 * 將 BDD 場景物件展平為可讀文字
 * @param {object} scenario - { title, given, when, then }
 * @returns {string}
 */
function flattenScenario(scenario) {
  if (typeof scenario === 'string') return scenario;
  if (!scenario || typeof scenario !== 'object') return '';
  const parts = [];
  if (scenario.title) parts.push(scenario.title);
  if (scenario.given) parts.push(`GIVEN ${scenario.given}`);
  if (scenario.when) parts.push(`WHEN ${scenario.when}`);
  if (scenario.then) parts.push(`THEN ${scenario.then}`);
  return parts.join(' ');
}

/**
 * 將 ProjectSpec 物件或 Markdown 字串轉換為純文字（供 detectKnowledgeGaps 消費）
 * @param {string|object} projectSpec
 * @returns {string}
 */
function parseSpecToText(projectSpec) {
  // null / undefined → 空字串
  if (projectSpec == null) return '';

  // 純字串 → 直接回傳
  if (typeof projectSpec === 'string') return projectSpec;

  // ProjectSpec 物件 → 合併 facets
  if (typeof projectSpec !== 'object') return '';

  const parts = [];

  // feature name
  if (projectSpec.feature) {
    parts.push(projectSpec.feature);
  }

  const facets = projectSpec.facets || {};

  // functional 陣列
  if (Array.isArray(facets.functional)) {
    for (const item of facets.functional) {
      if (item && typeof item === 'string') parts.push(item);
    }
  }

  // flow 陣列
  if (Array.isArray(facets.flow)) {
    for (const item of facets.flow) {
      if (item && typeof item === 'string') parts.push(item);
    }
  }

  // edgeCases 陣列
  if (Array.isArray(facets.edgeCases)) {
    for (const item of facets.edgeCases) {
      if (item && typeof item === 'string') parts.push(item);
    }
  }

  // acceptance BDD 場景陣列 → 展平
  if (Array.isArray(facets.acceptance)) {
    for (const scenario of facets.acceptance) {
      const text = flattenScenario(scenario);
      if (text) parts.push(text);
    }
  }

  return parts.join('\n');
}

// ── extractFeatureList ──

/**
 * 將字串截斷至指定長度（50 字）
 */
function truncate(str, maxLen = 50) {
  if (!str || typeof str !== 'string') return '';
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

/**
 * 從 Markdown 字串提取「## 功能定義」section 的列表項目
 * 使用行掃描方式，支援有無空行的格式差異，以及括弧後綴標題。
 * @param {string} markdown
 * @returns {string[]|null} 列表項目，或 null（找不到時）
 */
function extractFunctionalSection(markdown) {
  const lines = markdown.split('\n');
  let found = false;
  const items = [];

  for (const line of lines) {
    if (!found) {
      // 找「## 功能定義」開頭的標題（支援後綴如「（Functional）」）
      if (/^##\s+功能定義/.test(line)) {
        found = true;
      }
      continue;
    }
    // 遇到另一個標題就停止
    if (/^#/.test(line)) break;
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      const name = trimmed.slice(2).trim();
      if (name) items.push(name);
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * 從 Markdown 字串提取所有 ## 二級標題
 * @param {string} markdown
 * @returns {string[]}
 */
function extractH2Titles(markdown) {
  const matches = markdown.match(/^##\s+(.+)$/gm) || [];
  return matches.map(m => m.replace(/^##\s+/, '').trim()).filter(Boolean);
}

/**
 * 從 ProjectSpec 物件或 Markdown 提取 feature 清單
 * @param {string|object} projectSpec
 * @param {string} [workflowTemplate='standard']
 * @returns {Array<{name: string, workflow: string}>}
 */
function extractFeatureList(projectSpec, workflowTemplate = 'standard') {
  const workflow = workflowTemplate || 'standard';

  // null / undefined / 空物件 → []
  if (projectSpec == null) return [];
  if (typeof projectSpec === 'object' && !Array.isArray(projectSpec)) {
    // 空物件（無 facets）
    if (!projectSpec.facets && !projectSpec.feature) return [];

    // ProjectSpec 物件：從 facets.functional 提取
    const functional = (projectSpec.facets && projectSpec.facets.functional) || [];
    if (!Array.isArray(functional) || functional.length === 0) return [];

    return functional
      .filter(item => item && typeof item === 'string')
      .map(item => ({
        name: truncate(item, 50),
        workflow,
      }));
  }

  // 純字串：解析 Markdown
  if (typeof projectSpec === 'string') {
    if (!projectSpec.trim()) return [];

    // 先嘗試找「功能定義」section
    const sectionItems = extractFunctionalSection(projectSpec);
    if (sectionItems) {
      return sectionItems.map(name => ({ name: truncate(name, 50), workflow }));
    }

    // fallback：使用 ## 標題
    const titles = extractH2Titles(projectSpec);
    return titles.map(name => ({ name: truncate(name, 50), workflow }));
  }

  return [];
}

// ── orchestrate ──

/**
 * 主協調 API：從 ProjectSpec 到填充佇列
 * @param {string|object} projectSpec
 * @param {object} [options]
 * @param {boolean} [options.dryRun=true]
 * @param {boolean} [options.execute=false]
 * @param {string} [options.workflowTemplate='standard']
 * @param {boolean} [options.overwriteQueue=false]
 * @param {string} [options.pluginRoot]
 * @param {string} [options.projectRoot]
 * @param {number} [options.maxConsecutiveFailures=3]
 * @param {boolean} [options.enableWebResearch=false]
 * @param {string} [options.source]
 * @returns {OrchestrateResult}
 */
function orchestrate(projectSpec, options = {}) {
  const {
    dryRun = true,
    execute = false,
    workflowTemplate = 'standard',
    overwriteQueue = false,
    pluginRoot: pluginRootOverride,
    projectRoot,
    maxConsecutiveFailures = 3,
    enableWebResearch = false,
    source,
  } = options;

  // dryRun 語意：dryRun 預設 true，execute flag 可覆蓋
  const isExecute = execute || dryRun === false;
  const isDryRun = !isExecute;

  const pluginRoot = resolvePluginRoot(pluginRootOverride);

  // 1. 轉換規格為純文字
  const specText = parseSpecToText(projectSpec);

  // 1.5 查詢 experience-index（有 projectRoot 才查；失敗時靜默降級）
  let experienceHints = null;
  if (projectRoot) {
    try {
      experienceHints = queryIndex(projectRoot, specText);
    } catch (_err) {
      // 降級：不影響主流程
      experienceHints = null;
    }
  }

  // 2. 偵測知識缺口（傳空陣列給 agentSkills，讓 orchestrator 自行比對 skills/ 目錄）
  const gaps = specText
    ? detectKnowledgeGaps(specText, [], { minScore: 0.15, maxGaps: 10 })
    : [];

  // 3. 比對 skills/ 目錄，分類 present / missing
  const skillsDir = path.join(pluginRoot, 'skills');
  const present = [];
  const missing = [];

  for (const gap of gaps) {
    const skillMdPath = path.join(skillsDir, gap.domain, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      present.push(gap.domain);
    } else {
      missing.push(gap.domain);
    }
  }

  const domainAudit = { present, missing, gaps };

  // 4. Forge missing domains（傳遞連續失敗計數）
  const forgeResults = [];
  let consecutiveFailures = 0;
  let paused = false;

  for (const domain of missing) {
    // 若已達暫停門檻，停止後續 forge
    if (paused || consecutiveFailures >= maxConsecutiveFailures) {
      paused = true;
      break;
    }

    let result;
    try {
      result = forgeSkill(domain, {}, {
        dryRun: isDryRun,
        maxConsecutiveFailures,
        pluginRoot: pluginRootOverride,
        initialFailures: consecutiveFailures,
        enableWebResearch,
      });
    } catch (err) {
      result = {
        status: 'error',
        domainName: domain,
        error: err.message,
        consecutiveFailures: consecutiveFailures + 1,
      };
    }

    forgeResults.push(result);

    // 更新連續失敗計數（來自 forgeSkill 回傳值）
    consecutiveFailures = result.consecutiveFailures !== undefined
      ? result.consecutiveFailures
      : consecutiveFailures;

    // 遇到 paused 狀態，停止後續 domain
    if (result.status === 'paused') {
      paused = true;
    }
  }

  // 5. 提取 feature 清單
  const features = extractFeatureList(projectSpec, workflowTemplate);

  // 6. 寫入或預覽佇列
  const queueSource = source || `Project Orchestrator ${new Date().toISOString().slice(0, 10)}`;
  let queueResult;

  if (isDryRun) {
    // dry-run：不寫入 fs，回傳 preview 物件
    queueResult = {
      _preview: true,
      items: features.map(f => ({ name: f.name, workflow: f.workflow, status: 'pending' })),
    };
  } else {
    // execute：真實寫入佇列
    if (overwriteQueue) {
      queueResult = writeQueue(projectRoot, features, queueSource);
    } else {
      queueResult = appendQueue(projectRoot, features, queueSource);
    }
  }

  // 7. 組裝 summary
  const forgedCount = forgeResults.filter(r => r.status === 'success').length;
  const summary = {
    totalDomains: present.length + missing.length,
    presentCount: present.length,
    missingCount: missing.length,
    forgedCount,
    featureCount: features.length,
    dryRun: isDryRun,
  };

  const result = {
    domainAudit,
    forgeResults,
    queueResult,
    summary,
  };

  // experienceHints 只在有查詢時才加入（無 projectRoot 時不加）
  if (projectRoot !== undefined) {
    result.experienceHints = experienceHints;
  }

  return result;
}

module.exports = {
  orchestrate,
  parseSpecToText,
  extractFeatureList,
};
