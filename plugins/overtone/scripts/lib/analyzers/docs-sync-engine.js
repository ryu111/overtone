#!/usr/bin/env node
'use strict';
/**
 * docs-sync-engine.js — 文件數字自動同步引擎
 *
 * 偵測並修復 docs/status.md、CLAUDE.md 與實際程式碼結構之間的數字 drift。
 *
 * 核心 API：
 *   scanDrift()         — 純掃描（不修改檔案），回傳 drift 報告
 *   fixDrift(drifts)    — 自動修復 drift（不修改 plugin.json 版本）
 *   runDocsSyncCheck()  — 一鍵掃描 + 修復入口
 */

const fs = require('fs');
const { join } = require('path');

// ── 路徑常數 ──────────────────────────────────────────────────────────────

// 從此模組位置推算專案根目錄
// 此檔位於 plugins/overtone/scripts/lib/analyzers/docs-sync-engine.js
const PLUGIN_ROOT = join(__dirname, '..', '..', '..');
const PROJECT_ROOT = join(PLUGIN_ROOT, '..', '..');

const AGENTS_DIR   = join(PLUGIN_ROOT, 'agents');
const SKILLS_DIR   = join(PLUGIN_ROOT, 'skills');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');
const HOOKS_JSON   = join(PLUGIN_ROOT, 'hooks', 'hooks.json');
const PLUGIN_JSON  = join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const STATUS_MD    = join(PROJECT_ROOT, 'docs', 'status.md');
const CLAUDE_MD    = join(PROJECT_ROOT, 'CLAUDE.md');

// ── 計算實際數量（SoT）────────────────────────────────────────────────────

/**
 * 計算指定目錄中 .md 檔案數量（非遞迴）
 * @param {string} dir
 * @returns {number}
 */
function countMdFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).length;
}

/**
 * 計算 skills/ 中含有 SKILL.md 的子目錄數量
 * @returns {number}
 */
function countSkillsWithSkillMd() {
  if (!fs.existsSync(SKILLS_DIR)) return 0;
  return fs.readdirSync(SKILLS_DIR).filter(entry => {
    return fs.existsSync(join(SKILLS_DIR, entry, 'SKILL.md'));
  }).length;
}

/**
 * 取得所有實際數量（以實際目錄結構為 SoT）
 * @returns {{ agentCount, skillCount, commandCount, hookCount }}
 */
function getActualCounts() {
  const agentCount   = countMdFiles(AGENTS_DIR);
  const skillCount   = countSkillsWithSkillMd();
  const commandCount = countMdFiles(COMMANDS_DIR);

  let hookCount = 0;
  if (fs.existsSync(HOOKS_JSON)) {
    try {
      const hooksData = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
      hookCount = Object.keys(hooksData.hooks || {}).length;
    } catch {
      // 解析失敗靜默降級
    }
  }

  return { agentCount, skillCount, commandCount, hookCount };
}

// ── 解析文件中的數字 ──────────────────────────────────────────────────────

/**
 * 從 status.md 提取核心指標表中的數字
 * 格式：| 指標 | 數值 |（第一個數字）
 * @param {string} content
 * @returns {Object.<string, number>}
 */
function extractStatusMetrics(content) {
  const metrics = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*(\d+)[^\|]*\|/);
    if (match) {
      const key = match[1].trim();
      const value = parseInt(match[2], 10);
      metrics[key] = value;
    }
  }
  return metrics;
}

/**
 * 從文件內容提取指定 regex 的第一個數字
 * @param {string} content
 * @param {RegExp} regex
 * @returns {number|null}
 */
function extractNumber(content, regex) {
  const match = content.match(regex);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 從 status.md 的版本行提取版本號
 * 格式：> 最後更新：YYYY-MM-DD | Plugin 版本：X.Y.Z
 * @param {string} content
 * @returns {string|null}
 */
function extractStatusVersion(content) {
  const match = content.match(/Plugin\s+版本[：:]\s*([\d.]+)/);
  return match ? match[1] : null;
}

// ── 核心 API ──────────────────────────────────────────────────────────────

/**
 * 掃描所有 SoT 文件的數字，對比實際結構，回傳 drift 報告。
 * 純掃描，不修改任何檔案。
 *
 * @returns {{
 *   drifts: Array<{file: string, field: string, expected: number|string, actual: number|string}>,
 *   isClean: boolean
 * }}
 */
function scanDrift() {
  const drifts = [];

  const actual = getActualCounts();

  // ── 掃描 status.md ──────────────────────────────────────────────────────

  if (fs.existsSync(STATUS_MD)) {
    const statusContent = fs.readFileSync(STATUS_MD, 'utf8');
    const metrics = extractStatusMetrics(statusContent);

    // Agent 數量
    if (metrics['Agent 數量'] !== undefined && metrics['Agent 數量'] !== actual.agentCount) {
      drifts.push({
        file: 'docs/status.md',
        field: 'Agent 數量',
        expected: actual.agentCount,
        actual: metrics['Agent 數量'],
      });
    }

    // Skill 數量（格式：16（8 knowledge domain + ...），第一個數字）
    if (metrics['Skill 數量'] !== undefined && metrics['Skill 數量'] !== actual.skillCount) {
      drifts.push({
        file: 'docs/status.md',
        field: 'Skill 數量',
        expected: actual.skillCount,
        actual: metrics['Skill 數量'],
      });
    }

    // Command 數量
    if (metrics['Command 數量'] !== undefined && metrics['Command 數量'] !== actual.commandCount) {
      drifts.push({
        file: 'docs/status.md',
        field: 'Command 數量',
        expected: actual.commandCount,
        actual: metrics['Command 數量'],
      });
    }

    // Hook 數量
    if (metrics['Hook 數量'] !== undefined && metrics['Hook 數量'] !== actual.hookCount) {
      drifts.push({
        file: 'docs/status.md',
        field: 'Hook 數量',
        expected: actual.hookCount,
        actual: metrics['Hook 數量'],
      });
    }

    // 版本一致性：status.md 版本 vs plugin.json 版本
    if (fs.existsSync(PLUGIN_JSON)) {
      try {
        const pluginJson = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
        const pluginVersion = pluginJson.version;
        const statusVersion = extractStatusVersion(statusContent);

        if (pluginVersion && statusVersion && statusVersion !== pluginVersion) {
          drifts.push({
            file: 'docs/status.md',
            field: 'Plugin 版本',
            expected: pluginVersion,
            actual: statusVersion,
          });
        }
      } catch {
        // 版本解析失敗靜默跳過
      }
    }
  }

  // ── 掃描 CLAUDE.md ──────────────────────────────────────────────────────

  if (fs.existsSync(CLAUDE_MD)) {
    const claudeContent = fs.readFileSync(CLAUDE_MD, 'utf8');

    // Agent 數量：「17 個 agent」或 「agents/ # 17 個」格式
    const agentMentioned =
      extractNumber(claudeContent, /(\d+)\s+個\s*agent/) ||
      extractNumber(claudeContent, /agents\/\s*#\s*(\d+)\s+個/);
    if (agentMentioned !== null && agentMentioned !== actual.agentCount) {
      drifts.push({
        file: 'CLAUDE.md',
        field: 'agent 數量',
        expected: actual.agentCount,
        actual: agentMentioned,
      });
    }

    // Skill 數量：「16 個 Skill」或「skills/ # 16 個」格式
    const skillMentioned =
      extractNumber(claudeContent, /(\d+)\s+個\s*Skill/) ||
      extractNumber(claudeContent, /skills\/[^#]*#\s*(\d+)\s+個/);
    if (skillMentioned !== null && skillMentioned !== actual.skillCount) {
      drifts.push({
        file: 'CLAUDE.md',
        field: 'Skill 數量',
        expected: actual.skillCount,
        actual: skillMentioned,
      });
    }

    // Command 數量：「27 個 Command」格式
    const commandMentioned =
      extractNumber(claudeContent, /(\d+)\s+個\s*Command/) ||
      extractNumber(claudeContent, /commands\/[^#]*#\s*(\d+)\s+個/);
    if (commandMentioned !== null && commandMentioned !== actual.commandCount) {
      drifts.push({
        file: 'CLAUDE.md',
        field: 'Command 數量',
        expected: actual.commandCount,
        actual: commandMentioned,
      });
    }

    // Hook 數量：「Hook 架構（11 個）」或「11 個 hook」格式
    const hookMentioned =
      extractNumber(claudeContent, /Hook\s+架構[（(]\s*(\d+)\s+個/) ||
      extractNumber(claudeContent, /(\d+)\s+個\s*hook/i);
    if (hookMentioned !== null && hookMentioned !== actual.hookCount) {
      drifts.push({
        file: 'CLAUDE.md',
        field: 'Hook 數量',
        expected: actual.hookCount,
        actual: hookMentioned,
      });
    }
  }

  return {
    drifts,
    isClean: drifts.length === 0,
  };
}

/**
 * 自動修復 drift 項目。
 *
 * 規則：
 * - docs/status.md：以 regex 替換核心指標表中的數字
 * - CLAUDE.md：以 regex 替換數字
 * - plugin.json 版本號不自動修復（需人類決定語意版本）
 *
 * @param {Array<{file: string, field: string, expected: number|string, actual: number|string}>} drifts
 * @returns {{ fixed: string[], skipped: string[], errors: string[] }}
 */
function fixDrift(drifts) {
  const fixed = [];
  const skipped = [];
  const errors = [];

  if (!drifts || drifts.length === 0) {
    return { fixed, skipped, errors };
  }

  // 分組：依檔案分類需修復的 drift
  const statusDrifts = drifts.filter(d => d.file === 'docs/status.md' && d.field !== 'Plugin 版本');
  const claudeDrifts = drifts.filter(d => d.file === 'CLAUDE.md');
  const versionDrifts = drifts.filter(d => d.field === 'Plugin 版本');

  // ── 修復 docs/status.md ────────────────────────────────────────────────

  if (statusDrifts.length > 0 && fs.existsSync(STATUS_MD)) {
    try {
      let content = fs.readFileSync(STATUS_MD, 'utf8');
      let modified = false;

      for (const drift of statusDrifts) {
        const label = escapeRegex(drift.field);
        // 格式：| Agent 數量 | 17（... | 或 | Agent 數量 | 17 |
        // 替換第一個數字（可能後接中文說明）
        const pattern = new RegExp(
          `(\\|\\s*${label}\\s*\\|\\s*)(${escapeRegex(String(drift.actual))})(\\D)`,
          'g'
        );
        const newContent = content.replace(pattern, `$1${drift.expected}$3`);
        if (newContent !== content) {
          content = newContent;
          modified = true;
          fixed.push(`docs/status.md: ${drift.field} ${drift.actual} → ${drift.expected}`);
        }
      }

      if (modified) {
        // atomicWrite：先寫暫存再 rename
        const tmp = `${STATUS_MD}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, STATUS_MD);
      }
    } catch (err) {
      errors.push(`docs/status.md 修復失敗：${err.message}`);
    }
  }

  // ── 修復 CLAUDE.md ─────────────────────────────────────────────────────

  if (claudeDrifts.length > 0 && fs.existsSync(CLAUDE_MD)) {
    try {
      let content = fs.readFileSync(CLAUDE_MD, 'utf8');
      let modified = false;

      for (const drift of claudeDrifts) {
        const old = String(drift.actual);
        const neo = String(drift.expected);

        // 根據 field 選擇精確的替換 pattern，避免誤替換其他數字
        let patterns = [];

        if (drift.field === 'agent 數量') {
          // 「17 個 agent」格式
          patterns = [
            [new RegExp(`(${escapeRegex(old)})(\\s+個\\s*agent)`, 'g'), `${neo}$2`],
            [new RegExp(`(agents\\/\\s*#\\s*)(${escapeRegex(old)})(\\s+個)`, 'g'), `$1${neo}$3`],
          ];
        } else if (drift.field === 'Skill 數量') {
          // 「16 個 Skill」或「skills/ # 16 個」格式
          patterns = [
            [new RegExp(`(${escapeRegex(old)})(\\s+個\\s*Skill)`, 'g'), `${neo}$2`],
            [new RegExp(`(skills\\/[^#]*#\\s*)(${escapeRegex(old)})(\\s+個)`, 'g'), `$1${neo}$3`],
          ];
        } else if (drift.field === 'Command 數量') {
          // 「27 個 Command」格式
          patterns = [
            [new RegExp(`(${escapeRegex(old)})(\\s+個\\s*Command)`, 'g'), `${neo}$2`],
            [new RegExp(`(commands\\/[^#]*#\\s*)(${escapeRegex(old)})(\\s+個)`, 'g'), `$1${neo}$3`],
          ];
        } else if (drift.field === 'Hook 數量') {
          // 「Hook 架構（11 個）」或「11 個 hook」格式
          patterns = [
            [new RegExp(`(Hook\\s+架構[（(]\\s*)(${escapeRegex(old)})(\\s+個)`, 'g'), `$1${neo}$3`],
            [new RegExp(`(${escapeRegex(old)})(\\s+個\\s*hook)`, 'gi'), `${neo}$2`],
          ];
        }

        for (const [pat, replacement] of patterns) {
          const newContent = content.replace(pat, replacement);
          if (newContent !== content) {
            content = newContent;
            modified = true;
            fixed.push(`CLAUDE.md: ${drift.field} ${old} → ${neo}`);
            break; // 一個 field 找到匹配即停止
          }
        }
      }

      if (modified) {
        const tmp = `${CLAUDE_MD}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmp, content, 'utf8');
        fs.renameSync(tmp, CLAUDE_MD);
      }
    } catch (err) {
      errors.push(`CLAUDE.md 修復失敗：${err.message}`);
    }
  }

  // ── 跳過 plugin.json 版本號修復 ────────────────────────────────────────

  for (const drift of versionDrifts) {
    skipped.push(`${drift.file}: ${drift.field}（版本語意由人類決定，略過自動修復）`);
  }

  return { fixed, skipped, errors };
}

/**
 * 一鍵掃描 + 修復入口
 *
 * @returns {{
 *   wasClean: boolean,
 *   drifts: Array,
 *   fixed: string[],
 *   skipped: string[],
 *   errors: string[]
 * }}
 */
function runDocsSyncCheck() {
  const { drifts, isClean } = scanDrift();

  if (isClean) {
    return { wasClean: true, drifts: [], fixed: [], skipped: [], errors: [] };
  }

  const { fixed, skipped, errors } = fixDrift(drifts);
  return { wasClean: false, drifts, fixed, skipped, errors };
}

// ── 工具函式 ──────────────────────────────────────────────────────────────

/**
 * 跳脫 regex 特殊字元
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── 匯出 ──────────────────────────────────────────────────────────────────

module.exports = {
  scanDrift,
  fixDrift,
  runDocsSyncCheck,
  // 以下為測試用 export
  getActualCounts,
  extractStatusMetrics,
  extractStatusVersion,
  extractNumber,
};
