'use strict';
/**
 * gap-analyzer.js — Evolution Engine Gap Detection
 *
 * 組合 health-check 的四個 check 函式，將 findings 轉換為標準化 Gap 物件。
 *
 * API：
 *   analyzeGaps(options?) → GapReport
 *
 * options:
 *   pluginRoot?: string   — 覆寫 pluginRoot（供測試使用）
 *   checks?: string[]     — 要執行的 check 名稱清單（預設全部四個）
 *
 * GapType（五種）：
 *   broken-chain | missing-skill | missing-consumer | no-references | sync-mismatch
 *
 * GapReport：
 *   { gaps: Gap[], summary: { total, byType, bySeverity } }
 */

const path = require('path');

// ── 常數 ──

const ALL_CHECKS = ['component-chain', 'closed-loop', 'completion-gap', 'dependency-sync'];

const ALL_GAP_TYPES = ['broken-chain', 'missing-skill', 'missing-consumer', 'no-references', 'sync-mismatch'];

const ALL_SEVERITIES = ['error', 'warning', 'info'];

// ── Suggestion Templates ──

function buildSuggestion(type, file) {
  // 從 file 路徑推斷名稱（取最後兩段路徑，或檔名）
  const basename = path.basename(file || '', '.md');

  switch (type) {
    case 'broken-chain':
      return `bun scripts/manage-component.js create agent '{"name":"<agentName>","model":"sonnet","description":"<description>"}'`;
    case 'missing-skill':
      return `bun scripts/manage-component.js create skill '{"name":"<skillName>","description":"<description>"}'`;
    case 'missing-consumer':
      return `# 確認事件用途後：\nbun scripts/fix-consistency.js --fix`;
    case 'no-references': {
      // 從 file 取 skill name（e.g., skills/foo/SKILL.md → foo）
      const parts = (file || '').split('/');
      const skillIdx = parts.indexOf('skills');
      const skillName = skillIdx >= 0 && parts[skillIdx + 1] ? parts[skillIdx + 1] : '<skillName>';
      return `mkdir -p plugins/overtone/skills/${skillName}/references && echo '# References' > plugins/overtone/skills/${skillName}/references/README.md`;
    }
    case 'sync-mismatch':
      return `bun scripts/fix-consistency.js --fix`;
    default:
      return `bun scripts/fix-consistency.js --fix`;
  }
}

// ── Finding → Gap 轉換 ──

/**
 * 將 health-check finding 轉換為 Gap 物件
 * @param {object} finding
 * @param {string} sourceCheck  — 來源 check 名稱
 * @returns {object|null} Gap 或 null（無法映射時）
 */
function findingToGap(finding, sourceCheck) {
  const msg = (finding.message || '').toLowerCase();
  let type;

  switch (sourceCheck) {
    case 'component-chain':
      // skill 缺失的 finding：message 含 "skill" 且 message 也含 "agent"（引用關係）
      // 使用 skill 優先：message 含 "skill" → missing-skill
      // agent 本身不存在：message 含 "agent" 但不含 "skill" → broken-chain
      if (msg.includes('skill') || (finding.file || '').includes('skills/')) {
        type = 'missing-skill';
      } else if (msg.includes('agent') || (finding.file || '').includes('agents/')) {
        type = 'broken-chain';
      } else {
        type = 'broken-chain'; // 預設映射
      }
      break;
    case 'closed-loop':
      type = 'missing-consumer';
      break;
    case 'completion-gap':
      type = 'no-references';
      break;
    case 'dependency-sync':
      type = 'sync-mismatch';
      break;
    default:
      return null;
  }

  return {
    type,
    severity: finding.severity || 'warning',
    file: finding.file || '',
    message: finding.message || '',
    suggestion: buildSuggestion(type, finding.file || ''),
    sourceCheck,
  };
}

// ── 核心 API ──

/**
 * 執行 gap 分析
 *
 * @param {object} [options]
 * @param {string} [options.pluginRoot]  — 覆寫 pluginRoot
 * @param {string[]} [options.checks]    — 要執行的 check 清單（預設全部）
 * @returns {{ gaps: object[], summary: object }}
 */
function analyzeGaps(options = {}) {
  const {
    pluginRoot,
    checks = ALL_CHECKS,
  } = options;

  // 初始化空摘要
  const byType = {};
  for (const t of ALL_GAP_TYPES) byType[t] = 0;
  const bySeverity = {};
  for (const s of ALL_SEVERITIES) bySeverity[s] = 0;

  if (checks.length === 0) {
    return {
      gaps: [],
      summary: { total: 0, byType, bySeverity },
    };
  }

  // 載入 health-check 函式
  let healthCheck;
  try {
    healthCheck = require('../health-check');
  } catch {
    return {
      gaps: [],
      summary: { total: 0, byType, bySeverity },
    };
  }

  // 去重用 Map：key = `${type}:${file}`，先到者勝
  const dedupMap = new Map();

  // 依序執行各 check
  for (const checkName of checks) {
    let findings = [];
    try {
      switch (checkName) {
        case 'component-chain':
          findings = healthCheck.checkComponentChain(pluginRoot) || [];
          break;
        case 'closed-loop':
          findings = healthCheck.checkClosedLoop() || [];
          break;
        case 'completion-gap': {
          // checkCompletionGap 接受 skillsDirOverride（skills 目錄路徑）
          const skillsDir = pluginRoot ? require('path').join(pluginRoot, 'skills') : undefined;
          findings = healthCheck.checkCompletionGap(skillsDir) || [];
          break;
        }
        case 'dependency-sync':
          findings = healthCheck.checkDependencySync(pluginRoot) || [];
          break;
        default:
          continue;
      }
    } catch {
      // check 執行失敗時靜默跳過，不拋例外
      continue;
    }

    for (const finding of findings) {
      const gap = findingToGap(finding, checkName);
      if (!gap) continue;

      const dedupKey = `${gap.type}:${gap.file}`;
      if (!dedupMap.has(dedupKey)) {
        dedupMap.set(dedupKey, gap);
      }
    }
  }

  const gaps = Array.from(dedupMap.values());

  // 計算摘要
  for (const gap of gaps) {
    if (byType[gap.type] !== undefined) byType[gap.type]++;
    if (bySeverity[gap.severity] !== undefined) bySeverity[gap.severity]++;
  }

  return {
    gaps,
    summary: {
      total: gaps.length,
      byType,
      bySeverity,
    },
  };
}

module.exports = { analyzeGaps };
