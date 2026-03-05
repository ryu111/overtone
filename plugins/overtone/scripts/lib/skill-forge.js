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
 *
 * ForgeResult:
 *   { status: 'success'|'conflict'|'paused'|'error',
 *     domainName, skillPath?, preview?, conflictPath?,
 *     consecutiveFailures?, error? }
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

// ── SKILL.md 組裝 ──

/**
 * 組裝 SKILL.md 的 body（不含 frontmatter）
 * @param {string} domainName
 * @param {{ skillPatterns: string[], autoDiscovered: string, claudeMdRelevant: string }} extracts
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
`;

  return body;
}

/**
 * 組裝完整的 SKILL.md 文字（含 frontmatter）
 * @param {string} domainName
 * @param {{ skillPatterns: string[], autoDiscovered: string, claudeMdRelevant: string }} extracts
 * @returns {{ description: string, body: string, fullContent: string }}
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
 * @returns {ForgeResult}
 */
function forgeSkill(domainName, context, options = {}) {
  const {
    dryRun = true,
    maxConsecutiveFailures = 3,
    pluginRoot: pluginRootOverride,
  } = options;

  const pluginRoot = resolvePluginRoot(pluginRootOverride);

  // 1. 衝突檢查
  const skillDir = path.join(pluginRoot, 'skills', domainName);
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (fs.existsSync(skillMdPath)) {
    return {
      status: 'conflict',
      domainName,
      conflictPath: skillMdPath,
    };
  }

  // 2. 暫停檢查
  if (consecutiveFailures >= maxConsecutiveFailures) {
    return {
      status: 'paused',
      domainName,
      consecutiveFailures,
    };
  }

  // 3. 知識萃取
  const extracts = extractKnowledgeFromCodebase(domainName, pluginRoot);

  // 4. SKILL.md 組裝
  const { description, body } = buildSkillContent(domainName, extracts);

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
    consecutiveFailures++;
    const errMsg = createResult.stderr
      ? Buffer.from(createResult.stderr).toString()
      : 'manage-component.js create skill 執行失敗';
    return {
      status: 'error',
      domainName,
      error: errMsg,
    };
  }

  // 呼叫 validate-agents.js 驗證
  const validation = validateStructure(pluginRoot);

  if (!validation.valid) {
    // 驗證失敗 → 回滾
    rollback(skillDir);
    consecutiveFailures++;
    return {
      status: 'error',
      domainName,
      error: validation.errors.join('\n'),
    };
  }

  // 驗證成功 → 重置計數器
  consecutiveFailures = 0;

  return {
    status: 'success',
    domainName,
    skillPath: skillMdPath,
  };
}

module.exports = {
  forgeSkill,
  _resetConsecutiveFailures,
  // 內部函式導出供測試
  extractKnowledgeFromCodebase,
  assembleSkillBody,
  buildSkillContent,
  validateStructure,
};
