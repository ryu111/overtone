'use strict';
/**
 * skill-forge.js — Skill Forge Engine（L3.3）
 *
 * API：
 *   forgeSkill(domainName, context, options) → ForgeResult
 *
 * options:
 *   dryRun?: boolean              — true 時不執行任何 fs 操作（預設 true）
 *   maxConsecutiveFailures?: number — 連續失敗暫停門檻（預設 3）
 *   pluginRoot?: string           — 覆寫 plugin 根目錄（供測試注入）
 *   initialFailures?: number      — 注入初始計數（供 Phase 2 多 domain 場景隔離狀態）
 *
 * ForgeResult:
 *   { status: 'success'|'conflict'|'paused'|'error',
 *     domainName, skillPath?, preview?, conflictPath?,
 *     consecutiveFailures, error? }
 *   注意：consecutiveFailures 在所有 status 下都存在（方便呼叫端跨 domain 追蹤）
 *
 * ForgePreview:
 *   { domainName, description, body, sourcesScanned }
 */

const path = require('path');
const fs = require('fs');

// ── 模組層級計數器（記憶體內，不持久化）──

let consecutiveFailures = 0;

/**
 * 供測試重置計數器
 */
function _resetConsecutiveFailures() {
  consecutiveFailures = 0;
}

// ── 路徑解析 ──

function resolvePluginRoot(override) {
  if (override) return override;
  // skill-forge.js 位於 scripts/lib/，往上兩層到 plugin root
  return path.resolve(__dirname, '..', '..');
}

function resolveManageComponentPath(pluginRoot) {
  return path.join(pluginRoot, 'scripts', 'manage-component.js');
}

function resolveValidateAgentsPath(pluginRoot) {
  return path.join(pluginRoot, 'scripts', 'validate-agents.js');
}

// ── 知識萃取 ──

/**
 * 萃取 codebase 中與 domainName 相關的知識
 * @param {string} domainName
 * @param {string} pluginRoot
 * @returns {{ skillPatterns: string[], autoDiscovered: string, claudeMdRelevant: string, sourcesScanned: string[] }}
 */
function extractKnowledgeFromCodebase(domainName, pluginRoot) {
  const sourcesScanned = [];
  const skillPatterns = [];
  let autoDiscovered = '';
  let claudeMdRelevant = '';

  // 1. 掃描所有 skills/*/SKILL.md 取得結構模板
  const skillsDir = path.join(pluginRoot, 'skills');
  try {
    const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of skillDirs) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        sourcesScanned.push(skillMdPath);
        try {
          const content = fs.readFileSync(skillMdPath, 'utf8');
          // 提取 section 標題作為結構模板
          const sections = content.match(/^##\s+.+$/gm) || [];
          if (sections.length > 0) {
            skillPatterns.push(...sections);
          }
        } catch {
          // 靜默跳過讀取失敗的檔案
        }
      }
    }
  } catch {
    // 若 skills 目錄不存在，靜默跳過
  }

  // 2. 掃描 skills/instinct/auto-discovered.md
  const autoDiscoveredPath = path.join(pluginRoot, 'skills', 'instinct', 'auto-discovered.md');
  if (fs.existsSync(autoDiscoveredPath)) {
    try {
      const content = fs.readFileSync(autoDiscoveredPath, 'utf8');
      sourcesScanned.push(autoDiscoveredPath);
      // 找含 domainName 的段落
      const paragraphs = content.split(/\n\n+/);
      const relevant = paragraphs.filter(p => p.toLowerCase().includes(domainName.toLowerCase()));
      autoDiscovered = relevant.join('\n\n');
    } catch {
      // 靜默跳過
    }
  }

  // 3. 掃描 CLAUDE.md（專案根目錄，pluginRoot 往上兩層）
  const projectRoot = path.resolve(pluginRoot, '..', '..');
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    try {
      const content = fs.readFileSync(claudeMdPath, 'utf8');
      sourcesScanned.push(claudeMdPath);
      // 找含 domainName 的段落
      const paragraphs = content.split(/\n\n+/);
      const relevant = paragraphs.filter(p => p.toLowerCase().includes(domainName.toLowerCase()));
      claudeMdRelevant = relevant.join('\n\n');
    } catch {
      // 靜默跳過
    }
  }

  return { skillPatterns, autoDiscovered, claudeMdRelevant, sourcesScanned };
}

// ── Web 研究 ──

/** Web 研究結果長度上限（字元） */
const WEB_RESEARCH_MAX_LENGTH = 5000;

/** Web 研究 timeout（毫秒） */
const WEB_RESEARCH_TIMEOUT_MS = 30000;

/**
 * 使用 claude -p headless 模式研究外部知識
 * @param {string} domainName
 * @param {object} context - forge 上下文
 * @returns {string} 研究結果文字（失敗時回傳空字串）
 */
function extractWebKnowledge(domainName, context) {
  const contextStr = typeof context === 'string' ? context : (context ? JSON.stringify(context) : '');
  const contextHint = contextStr ? `\n觸發語境：${contextStr.slice(0, 200)}` : '';
  const prompt = `研究 ${domainName} 領域的最佳實踐、常見模式、關鍵概念，產出結構化知識摘要（繁體中文，使用 Markdown 格式，含小標題和要點）${contextHint}`;

  try {
    const result = Bun.spawnSync(
      ['claude', '-p', '--output-format', 'text', prompt],
      {
        timeout: WEB_RESEARCH_TIMEOUT_MS,
        stderr: 'pipe',
        stdout: 'pipe',
        env: {
          ...process.env,
          OVERTONE_SPAWNED: '1',
          OVERTONE_NO_DASHBOARD: '1',
        },
      }
    );

    if (result.exitCode !== 0) {
      return '';
    }

    const output = result.stdout ? Buffer.from(result.stdout).toString().trim() : '';
    if (!output) return '';

    // 截斷到長度上限
    return output.length > WEB_RESEARCH_MAX_LENGTH
      ? output.slice(0, WEB_RESEARCH_MAX_LENGTH) + '\n...(截斷)'
      : output;
  } catch {
    // 任何錯誤（timeout、spawn 失敗等）靜默回傳空字串
    return '';
  }
}

// ── SKILL.md 組裝 ──

/**
 * 組裝 SKILL.md 的 body（不含 frontmatter）
 * @param {string} domainName
 * @param {{ skillPatterns: string[], autoDiscovered: string, claudeMdRelevant: string, webResearch?: string }} extracts
 * @returns {string}
 */
function assembleSkillBody(domainName, extracts) {
  const { autoDiscovered, claudeMdRelevant } = extracts;

  // 建立描述段落（從 CLAUDE.md 或 auto-discovered 萃取 context）
  let contextNote = '';
  if (claudeMdRelevant) {
    contextNote = `\n> 相關 context（來自 CLAUDE.md）：\n>\n> ${claudeMdRelevant.replace(/\n/g, '\n> ').trim()}\n`;
  } else if (autoDiscovered) {
    contextNote = `\n> 相關內容（來自 auto-discovered.md）：\n>\n> ${autoDiscovered.replace(/\n/g, '\n> ').trim()}\n`;
  }

  // web 研究 section（若有）
  const webResearch = extracts.webResearch || '';
  const webResearchSection = webResearch
    ? `\n## 領域知識\n\n> 來源：外部研究（WebSearch）\n\n${webResearch}\n`
    : '';

  const body = `# ${domainName} 知識域
${contextNote}
## 消費者

| Agent | 用途 |
|-------|------|
| developer | （待填寫） |

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 \`\${CLAUDE_PLUGIN_ROOT}/skills/${domainName}/references/README.md\` | （待補充）${domainName} 參考資料 |

## 按需讀取

此 skill 提供 ${domainName} 領域的知識。需要該領域知識時查閱 references/ 目錄中的對應參考文件。
${webResearchSection}`;

  return body;
}

/**
 * 組裝完整的 SKILL.md 文字（含 frontmatter）
 * @param {string} domainName
 * @param {{ skillPatterns: string[], autoDiscovered: string, claudeMdRelevant: string, webResearch?: string }} extracts
 * @returns {{ description: string, body: string }}
 */
function buildSkillContent(domainName, extracts) {
  const description = `${domainName} 知識域。提供 ${domainName} 相關的知識和參考資料。`;
  const body = assembleSkillBody(domainName, extracts);

  return { description, body };
}

// ── 驗證 ──

/**
 * 呼叫 validate-agents.js 驗證結構（exit 0 = pass）
 * @param {string} pluginRoot
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateStructure(pluginRoot) {
  const validateAgentsPath = resolveValidateAgentsPath(pluginRoot);
  const projectRoot = path.resolve(pluginRoot, '..', '..');

  const result = Bun.spawnSync(['bun', validateAgentsPath], {
    cwd: projectRoot,
    stderr: 'pipe',
    stdout: 'pipe',
  });

  if (result.exitCode === 0) {
    return { valid: true, errors: [] };
  }

  const stderr = result.stderr ? Buffer.from(result.stderr).toString() : '';
  const stdout = result.stdout ? Buffer.from(result.stdout).toString() : '';
  const errorMsg = stderr || stdout || 'validate-agents.js 執行失敗';

  return { valid: false, errors: [errorMsg] };
}

// ── 回滾 ──

/**
 * 刪除已建立的 skill 目錄（回滾）
 * @param {string} skillDir
 */
function rollback(skillDir) {
  try {
    fs.rmSync(skillDir, { recursive: true, force: true });
  } catch {
    // 靜默處理回滾失敗
  }
}

// ── 主 API ──

/**
 * @param {string} domainName - 要建立的 skill domain 名稱（kebab-case）
 * @param {object} context - 觸發 forge 的上下文（Phase 1 可為空物件 {}）
 * @param {object} [options]
 * @param {boolean} [options.dryRun=true] - 預設 dry-run
 * @param {number} [options.maxConsecutiveFailures=3] - 連續失敗暫停門檻
 * @param {string} [options.pluginRoot] - plugin 根目錄路徑覆寫
 * @param {number} [options.initialFailures] - 注入初始計數（Phase 2 多 domain 場景，不影響模組層級計數）
 * @param {boolean} [options.enableWebResearch=false] - 啟用外部 WebSearch 研究（false: 僅 codebase 內知識）
 * @returns {ForgeResult}
 */
function forgeSkill(domainName, context, options = {}) {
  const {
    dryRun = true,
    maxConsecutiveFailures = 3,
    pluginRoot: pluginRootOverride,
    initialFailures,
    enableWebResearch = false,
  } = options;

  // 決定本次呼叫使用的計數器：
  // - 若呼叫端注入 initialFailures（Phase 2 多 domain 場景），使用注入值（不修改模組層級）
  // - 否則使用模組層級計數（Phase 1 CLI 場景）
  const useInjected = initialFailures !== undefined;
  let localFailures = useInjected ? initialFailures : consecutiveFailures;

  const pluginRoot = resolvePluginRoot(pluginRootOverride);

  // 1. 衝突檢查
  const skillDir = path.join(pluginRoot, 'skills', domainName);
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (fs.existsSync(skillMdPath)) {
    return {
      status: 'conflict',
      domainName,
      conflictPath: skillMdPath,
      consecutiveFailures: localFailures,
    };
  }

  // 2. 暫停檢查
  if (localFailures >= maxConsecutiveFailures) {
    return {
      status: 'paused',
      domainName,
      consecutiveFailures: localFailures,
    };
  }

  // 3. 知識萃取
  const extracts = extractKnowledgeFromCodebase(domainName, pluginRoot);

  // 3a. 外部研究（選用）
  if (enableWebResearch) {
    extracts.webResearch = extractWebKnowledge(domainName, context);
  }

  // 4. SKILL.md 組裝
  const { description, body } = buildSkillContent(domainName, extracts);

  // ── 計數器更新輔助函式 ──
  // 注入模式：只更新 localFailures（不污染模組層級）
  // CLI 模式：同步更新模組層級計數器
  function incrementFailures() {
    localFailures++;
    if (!useInjected) consecutiveFailures = localFailures;
  }

  function resetFailures() {
    localFailures = 0;
    if (!useInjected) consecutiveFailures = 0;
  }

  // 5. dry-run 模式
  if (dryRun) {
    return {
      status: 'success',
      domainName,
      preview: {
        domainName,
        description,
        body,
        sourcesScanned: extracts.sourcesScanned,
      },
      consecutiveFailures: localFailures,
    };
  }

  // 6. execute 模式
  const manageComponentPath = resolveManageComponentPath(pluginRoot);
  const projectRoot = path.resolve(pluginRoot, '..', '..');

  // 呼叫 manage-component.js create skill
  const skillParams = {
    name: domainName,
    description,
    'disable-model-invocation': true,
    'user-invocable': false,
    globs: [],
    body,
  };

  const createResult = Bun.spawnSync(
    ['bun', manageComponentPath, 'create', 'skill', JSON.stringify(skillParams)],
    {
      cwd: projectRoot,
      stderr: 'pipe',
      stdout: 'pipe',
    }
  );

  if (createResult.exitCode !== 0) {
    incrementFailures();
    const errMsg = createResult.stderr
      ? Buffer.from(createResult.stderr).toString()
      : 'manage-component.js create skill 執行失敗';
    return {
      status: 'error',
      domainName,
      error: errMsg,
      consecutiveFailures: localFailures,
    };
  }

  // 呼叫 validate-agents.js 驗證
  const validation = validateStructure(pluginRoot);

  if (!validation.valid) {
    // 驗證失敗 → 回滾
    rollback(skillDir);
    incrementFailures();
    return {
      status: 'error',
      domainName,
      error: validation.errors.join('\n'),
      consecutiveFailures: localFailures,
    };
  }

  // 驗證成功 → 重置計數器
  resetFailures();

  return {
    status: 'success',
    domainName,
    skillPath: skillMdPath,
    consecutiveFailures: localFailures,
  };
}

module.exports = {
  forgeSkill,
  _resetConsecutiveFailures,
  // 內部函式導出供測試
  extractKnowledgeFromCodebase,
  extractWebKnowledge,
  assembleSkillBody,
  buildSkillContent,
  validateStructure,
};
