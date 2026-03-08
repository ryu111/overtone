'use strict';
/**
 * docs-sync.test.js
 *
 * 文件同步 + 邊界掃描
 *
 * 驗證以下項目：
 * 1. CLAUDE.md 中提到的組件數量與實際一致
 * 2. docs/spec/ 和 CLAUDE.md 關鍵文件引用的路徑存在
 * 3. docs/ 中活躍文件不含已廢棄術語（排除歷史快照/歸檔/設計過渡文件）
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const fs = require('fs');
const { PROJECT_ROOT, PLUGIN_ROOT, SCRIPTS_LIB } = require('../helpers/paths');
const {
  AGENT_COUNT, SKILL_COUNT, COMMAND_COUNT, HOOK_COUNT,
  STAGE_COUNT, WORKFLOW_COUNT,
} = require('../helpers/counts');

// ── 路徑常數 ──────────────────────────────────────────────────────────────

// PLUGIN_ROOT（~/.claude）是唯一 SoT，所有元件從此讀取
const AGENTS_DIR    = join(PLUGIN_ROOT, 'agents');
const SKILLS_DIR    = join(PLUGIN_ROOT, 'skills');
const COMMANDS_DIR  = join(PLUGIN_ROOT, 'commands');
const HOOKS_JSON    = join(PLUGIN_ROOT, 'hooks', 'hooks.json');
const REGISTRY_DATA = join(SCRIPTS_LIB, 'registry-data.json');
const REGISTRY_JS   = join(SCRIPTS_LIB, 'registry.js');
const PLUGIN_JSON   = join(PLUGIN_ROOT, 'plugin.json');
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

// ─────────────────────────────────────────────────────────────────────────────
// 2. 關鍵文件路徑存在性
// ─────────────────────────────────────────────────────────────────────────────

describe('2. 關鍵文件路徑存在性', () => {

  describe('2a. CLAUDE.md 關鍵文件表格中引用的路徑', () => {
    // CLAUDE.md「關鍵文件」區段引用的路徑（相對於專案根目錄）
    const claudeKeyDocs = [
      { label: 'docs/spec/overtone.md', path: join(PROJECT_ROOT, 'docs/spec/overtone.md') },
      // scripts/lib/registry.js 在 CLAUDE.md 中以短路徑描述，實際在 plugins/overtone/scripts/lib/
      { label: '~/.claude/scripts/lib/registry.js（CLAUDE.md 中作為 SoT 標注）', path: join(SCRIPTS_LIB, 'registry.js') },
      { label: '~/.claude/skills/wording/references/wording-guide.md', path: join(PLUGIN_ROOT, 'skills/wording/references/wording-guide.md') },
    ];

    for (const { label, path } of claudeKeyDocs) {
      test(`${label} 存在`, () => {
        expect(fs.existsSync(path)).toBe(true);
      });
    }
  });

  describe('2b. docs/ 核心文件存在性', () => {
    const coreDocs = [
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

    for (const relPath of coreDocs) {
      test(`${relPath} 存在`, () => {
        expect(fs.existsSync(join(PROJECT_ROOT, relPath))).toBe(true);
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 舊術語掃描（排除歷史快照與設計過渡文件）
// ─────────────────────────────────────────────────────────────────────────────

describe('3. 舊術語掃描（活躍文件）', () => {
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
