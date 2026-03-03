'use strict';
/**
 * docs-sync.test.js
 *
 * 文件同步 + 邊界掃描
 *
 * 驗證以下項目：
 * 1. docs/status.md 核心指標數字與實際結構一致
 * 2. CLAUDE.md 中提到的組件數量與實際一致
 * 3. docs/spec/ 和 CLAUDE.md 關鍵文件引用的路徑存在
 * 4. docs/ 中活躍文件不含已廢棄術語（排除歷史快照/歸檔/設計過渡文件）
 * 5. plugin.json 版本與 docs/status.md 版本一致
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const fs = require('fs');
const { PROJECT_ROOT, PLUGIN_ROOT, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑常數 ──────────────────────────────────────────────────────────────

const AGENTS_DIR    = join(PLUGIN_ROOT, 'agents');
const SKILLS_DIR    = join(PLUGIN_ROOT, 'skills');
const COMMANDS_DIR  = join(PLUGIN_ROOT, 'commands');
const HOOKS_JSON    = join(PLUGIN_ROOT, 'hooks', 'hooks.json');
const REGISTRY_DATA = join(SCRIPTS_LIB, 'registry-data.json');
const REGISTRY_JS   = join(SCRIPTS_LIB, 'registry.js');
const PLUGIN_JSON   = join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const STATUS_MD     = join(PROJECT_ROOT, 'docs', 'status.md');
const CLAUDE_MD     = join(PROJECT_ROOT, 'CLAUDE.md');
const DOCS_DIR      = join(PROJECT_ROOT, 'docs');

// ── 輔助函式 ──────────────────────────────────────────────────────────────

/**
 * 計算指定目錄中 .md 檔案數量（非遞迴）
 */
function countMdFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).length;
}

/**
 * 計算 skills/ 中含有 SKILL.md 的子目錄數量
 */
function countSkillsWithSkillMd() {
  if (!fs.existsSync(SKILLS_DIR)) return 0;
  return fs.readdirSync(SKILLS_DIR).filter(dir => {
    return fs.existsSync(join(SKILLS_DIR, dir, 'SKILL.md'));
  }).length;
}

/**
 * 從 status.md 提取核心指標表中的數字
 * 格式：| 指標 | 數值 |
 */
function extractStatusMetrics(content) {
  const metrics = {};
  const lines = content.split('\n');
  for (const line of lines) {
    // 比對 | Agent 數量 | 17（含 grader） | 這類格式
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
 * 從文件內容提取指定模式的第一個數字
 * 用於從敘述性文字中找出數量
 */
function extractNumber(content, pattern) {
  const regex = new RegExp(pattern);
  const match = content.match(regex);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 遞迴掃描目錄，收集所有 .md 檔案路徑
 * @param {string} dir - 起始目錄
 * @param {string[]} excludeDirs - 排除的子目錄名稱（相對於 dir）
 * @returns {string[]} 絕對路徑清單
 */
function collectMdFiles(dir, excludeDirs = []) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // 排除指定子目錄
      if (excludeDirs.includes(entry.name)) continue;
      results.push(...collectMdFiles(fullPath, []));
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── 計算實際數量 ──────────────────────────────────────────────────────────

function getActualCounts() {
  // Agent 數量：agents/ 目錄的 .md 檔案數量
  const agentCount = countMdFiles(AGENTS_DIR);

  // Stage 數量：registry-data.json 的 stages 物件 key 數量
  const registryData = JSON.parse(fs.readFileSync(REGISTRY_DATA, 'utf8'));
  const stageCount = Object.keys(registryData.stages || {}).length;

  // Workflow 模板：registry.js 的 workflows 物件 key 數量
  const registry = require(REGISTRY_JS);
  const workflowCount = Object.keys(registry.workflows || {}).length;

  // Hook 數量：hooks.json 的事件數
  const hooksJson = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const hookCount = Object.keys(hooksJson.hooks || {}).length;

  // Skill 數量：skills/ 目錄中含 SKILL.md 的子目錄數量
  const skillCount = countSkillsWithSkillMd();

  // Command 數量：commands/ 目錄的 .md 檔案數量
  const commandCount = countMdFiles(COMMANDS_DIR);

  return { agentCount, stageCount, workflowCount, hookCount, skillCount, commandCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. docs/status.md 核心指標數字準確性
// ─────────────────────────────────────────────────────────────────────────────

describe('1. docs/status.md 核心指標數字', () => {
  const statusContent = fs.readFileSync(STATUS_MD, 'utf8');
  const metrics = extractStatusMetrics(statusContent);
  const actual = getActualCounts();

  test('Agent 數量：status.md 與 agents/ 目錄一致（應為 17）', () => {
    expect(metrics['Agent 數量']).toBe(actual.agentCount);
    expect(actual.agentCount).toBe(17);
  });

  test('Stage 數量：status.md 與 registry-data.json stages 一致（應為 16）', () => {
    expect(metrics['Stage 數量']).toBe(actual.stageCount);
    expect(actual.stageCount).toBe(16);
  });

  test('Workflow 模板：status.md 與 registry.js workflows 一致（應為 18）', () => {
    expect(metrics['Workflow 模板']).toBe(actual.workflowCount);
    expect(actual.workflowCount).toBe(18);
  });

  test('Hook 數量：status.md 與 hooks.json hooks 陣列一致（應為 11）', () => {
    expect(metrics['Hook 數量']).toBe(actual.hookCount);
    expect(actual.hookCount).toBe(11);
  });

  test('Skill 數量：status.md 與含 SKILL.md 的 skills/ 子目錄一致（應為 19）', () => {
    expect(metrics['Skill 數量']).toBe(actual.skillCount);
    expect(actual.skillCount).toBe(19);
  });

  test('Command 數量：status.md 與 commands/ 目錄 .md 檔案一致（應為 27）', () => {
    expect(metrics['Command 數量']).toBe(actual.commandCount);
    expect(actual.commandCount).toBe(27);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CLAUDE.md 專案指令數量準確性
// ─────────────────────────────────────────────────────────────────────────────

describe('2. CLAUDE.md 專案指令數量', () => {
  const claudeContent = fs.readFileSync(CLAUDE_MD, 'utf8');
  const actual = getActualCounts();

  test('CLAUDE.md 提到 agent 數量（17）與實際一致', () => {
    // 比對「17 個 agent」或「agents/ # 17 個 agent .md」等格式
    const count1 = extractNumber(claudeContent, /(\d+)\s+個\s*agent/);
    const count2 = extractNumber(claudeContent, /agents\/\s*#\s*(\d+)\s+個/);
    const mentionedCount = count1 || count2;
    expect(mentionedCount).toBe(actual.agentCount);
  });

  test('CLAUDE.md 提到 skill 數量（15）與實際一致', () => {
    // 比對「15 個 Skill」或「skills/ # 15 個」等格式
    const count1 = extractNumber(claudeContent, /(\d+)\s+個\s*Skill/);
    const count2 = extractNumber(claudeContent, /skills\/[^#]*#\s*(\d+)\s+個/);
    const mentionedCount = count1 || count2;
    expect(mentionedCount).toBe(actual.skillCount);
  });

  test('CLAUDE.md 提到 command 數量（27）與實際一致', () => {
    // 比對「27 個 Command」或「commands/ # 27 個」等格式
    const count1 = extractNumber(claudeContent, /(\d+)\s+個\s*Command/);
    const count2 = extractNumber(claudeContent, /commands\/[^#]*#\s*(\d+)\s+個/);
    const mentionedCount = count1 || count2;
    expect(mentionedCount).toBe(actual.commandCount);
  });

  test('CLAUDE.md 提到 hook 數量（11）與實際一致', () => {
    // 比對「Hook 架構（11 個）」或「11 個 hook」等格式
    const count1 = extractNumber(claudeContent, /Hook\s+架構[（(]\s*(\d+)\s+個/);
    const count2 = extractNumber(claudeContent, /(\d+)\s+個\s*hook/i);
    const mentionedCount = count1 || count2;
    expect(mentionedCount).toBe(actual.hookCount);
  });

  test('CLAUDE.md 提到 workflow 模板數量（18）與實際一致', () => {
    // 比對「18 個模板」等格式
    const count1 = extractNumber(claudeContent, /(\d+)\s+個模板/);
    const count2 = extractNumber(claudeContent, /(\d+)\s+個\s*workflow\s*模板/i);
    const mentionedCount = count1 || count2;
    expect(mentionedCount).toBe(actual.workflowCount);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 關鍵文件路徑存在性
// ─────────────────────────────────────────────────────────────────────────────

describe('3. 關鍵文件路徑存在性', () => {

  describe('3a. CLAUDE.md 關鍵文件表格中引用的路徑', () => {
    // CLAUDE.md「關鍵文件」區段引用的路徑（相對於專案根目錄）
    const claudeKeyDocs = [
      { label: 'docs/spec/overtone.md', path: join(PROJECT_ROOT, 'docs/spec/overtone.md') },
      { label: 'docs/status.md', path: join(PROJECT_ROOT, 'docs/status.md') },
      // scripts/lib/registry.js 在 CLAUDE.md 中以短路徑描述，實際在 plugins/overtone/scripts/lib/
      { label: 'plugins/overtone/scripts/lib/registry.js（CLAUDE.md 中作為 SoT 標注）', path: REGISTRY_JS },
      { label: 'plugins/overtone/skills/wording/references/wording-guide.md', path: join(PLUGIN_ROOT, 'skills/wording/references/wording-guide.md') },
    ];

    for (const { label, path } of claudeKeyDocs) {
      test(`${label} 存在`, () => {
        expect(fs.existsSync(path)).toBe(true);
      });
    }
  });

  describe('3b. docs/status.md 文件索引中引用的路徑', () => {
    // status.md「文件索引」表格中引用的路徑（相對於專案根目錄）
    const statusDocPaths = [
      'docs/vision.md',
      'docs/roadmap.md',
      'docs/spec/overtone.md',
      'docs/spec/overtone-架構.md',
      'docs/spec/overtone-工作流.md',
      'docs/spec/overtone-agents.md',
      'docs/spec/overtone-並行.md',
      'docs/spec/overtone-子系統.md',
      'docs/spec/overtone-驗證品質.md',
    ];

    for (const relPath of statusDocPaths) {
      test(`${relPath} 存在`, () => {
        expect(fs.existsSync(join(PROJECT_ROOT, relPath))).toBe(true);
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 舊術語掃描（排除歷史快照與設計過渡文件）
// ─────────────────────────────────────────────────────────────────────────────

describe('4. 舊術語掃描（活躍文件）', () => {
  /**
   * 豁免清單說明：
   * - docs/archive/：歷史歸檔文件，保留原始記錄
   * - docs/skill-snapshot-v0.27.md：v0.27 功能快照（重構前基線記錄）
   * - docs/product-brief-normalization.md：S15b 設計規劃文件（描述重構前後的對比，
   *   其中的「workflow skill」和舊路徑是描述重構前現況的歷史記錄，不是待修復的殘留）
   */
  const EXCLUDED_FILES = new Set([
    join(DOCS_DIR, 'skill-snapshot-v0.27.md'),
    join(DOCS_DIR, 'product-brief-normalization.md'),
  ]);
  const EXCLUDED_DIRS = ['archive'];

  // 取得活躍文件（排除豁免項目）
  function getActiveDocs() {
    return collectMdFiles(DOCS_DIR, EXCLUDED_DIRS).filter(f => !EXCLUDED_FILES.has(f));
  }

  test('活躍 docs/ 文件不含「workflow skill」術語（應為 workflow command）', () => {
    const violations = [];
    for (const filePath of getActiveDocs()) {
      const content = fs.readFileSync(filePath, 'utf8');
      // 比對「workflow skill」（不區分大小寫）
      // 豁免：被中文引號包圍的「workflow skill」屬於引用描述（如術語替換記錄）
      // 例如：「workflow skill」→「workflow command」這種格式是在描述術語替換，不是使用舊術語
      const lines = content.split('\n');
      const matchedLines = lines
        .map((line, idx) => ({ line, no: idx + 1 }))
        .filter(({ line }) => {
          if (!/workflow skill/i.test(line)) return false;
          // 如果整行的「workflow skill」都被「...」包圍（引用格式），視為豁免
          const withoutQuoted = line.replace(/「[^」]*workflow skill[^」]*」/gi, '');
          return /workflow skill/i.test(withoutQuoted);
        })
        .map(({ line, no }) => `  L${no}: ${line.trim()}`);

      if (matchedLines.length > 0) {
        violations.push(`${filePath.replace(PROJECT_ROOT + '/', '')}:\n${matchedLines.join('\n')}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `以下活躍文件仍含「workflow skill」術語（共 ${violations.length} 個）：\n` +
        violations.join('\n\n')
      );
    }
  });

  test('活躍 docs/ 文件不含已刪除的 ref-* skill 引用路徑', () => {
    // 已刪除的 ref-* skill 目錄名稱（v0.27.6 全部清零）
    const deletedRefSkills = [
      'ref-bdd-guide',
      'ref-failure-handling',
      'ref-test-strategy',
      'ref-commit-convention',
      'ref-pr-review-checklist',
      'ref-wording-guide',
      'ref-agent-prompt-patterns',
    ];
    const refPattern = new RegExp(
      `skills/(${deletedRefSkills.join('|')})/`
    );

    const violations = [];
    for (const filePath of getActiveDocs()) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (refPattern.test(content)) {
        const lines = content.split('\n');
        const matchedLines = lines
          .map((line, idx) => ({ line, no: idx + 1 }))
          .filter(({ line }) => refPattern.test(line))
          .map(({ line, no }) => `  L${no}: ${line.trim()}`);
        violations.push(`${filePath.replace(PROJECT_ROOT + '/', '')}:\n${matchedLines.join('\n')}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `以下活躍文件仍引用已刪除的 ref-* skill 路徑（共 ${violations.length} 個）：\n` +
        violations.join('\n\n')
      );
    }
  });

  test('活躍 docs/ 文件不含已遷移到 commands/ 的舊 skills/ 路徑', () => {
    // S15b 已將下列 skill 目錄遷移為 commands/，這些路徑不應再出現在活躍文件中
    const migratedSkillPaths = [
      'skills/plan/',
      'skills/architect/',
      'skills/design/',
      'skills/dev/',
      'skills/diagnose/',
      'skills/doc-sync/',
      'skills/e2e/',
      'skills/qa/',
      'skills/review/',
      'skills/security/',
      'skills/test/',
      'skills/build-fix/',
      'skills/clean/',
      'skills/db-review/',
      'skills/standard/',
      'skills/full/',
      'skills/quick/',
      'skills/secure/',
      'skills/tdd/',
      'skills/debug/',
      'skills/refactor/',
      'skills/audit/',
      'skills/dashboard/',
      'skills/remote/',
      'skills/status/',
      'skills/stop/',
    ];

    const violations = [];
    for (const filePath of getActiveDocs()) {
      const content = fs.readFileSync(filePath, 'utf8');
      const foundPaths = migratedSkillPaths.filter(p => content.includes(p));
      if (foundPaths.length > 0) {
        const lines = content.split('\n');
        const matchedLines = lines
          .map((line, idx) => ({ line, no: idx + 1 }))
          .filter(({ line }) => foundPaths.some(p => line.includes(p)))
          .map(({ line, no }) => `  L${no}: ${line.trim()}`);
        violations.push(`${filePath.replace(PROJECT_ROOT + '/', '')}:\n${matchedLines.join('\n')}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `以下活躍文件仍引用已遷移到 commands/ 的舊 skills/ 路徑（共 ${violations.length} 個）：\n` +
        violations.join('\n\n')
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Plugin 版本一致性
// ─────────────────────────────────────────────────────────────────────────────

describe('5. Plugin 版本一致性', () => {
  test('plugin.json 版本與 docs/status.md 標題版本一致', () => {
    // 讀取 plugin.json 版本
    const pluginJson = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8'));
    const pluginVersion = pluginJson.version;
    expect(pluginVersion).toBeTruthy();

    // 從 status.md 提取版本（格式：> 最後更新：YYYY-MM-DD | Plugin 版本：X.Y.Z）
    const statusContent = fs.readFileSync(STATUS_MD, 'utf8');
    const versionMatch = statusContent.match(/Plugin\s+版本[：:]\s*([\d.]+)/);
    expect(versionMatch).not.toBeNull();
    const statusVersion = versionMatch[1];

    expect(statusVersion).toBe(pluginVersion);
  });
});
