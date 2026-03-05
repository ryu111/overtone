'use strict';
/**
 * gap-fixer.js — Evolution Engine Gap Auto-Fix
 *
 * API：
 *   fixGaps(gaps, options) → FixResult
 *
 * options:
 *   dryRun: boolean        — true 時不執行任何 fs 操作（預設 true）
 *   typeFilter?: string    — 只修復指定 type（如 'sync-mismatch' / 'no-references'）
 *   pluginRoot?: string    — 覆寫 pluginRoot（供測試使用）
 *
 * FixResult:
 *   { fixed: Gap[], skipped: SkippedItem[], failed: FailedItem[] }
 *
 * SkippedItem:  { gap: Gap, reason: 'dry-run' | 'not-fixable' | 'type-filter' }
 * FailedItem:   { gap: Gap, error: string }
 */

const path = require('path');
const { mkdirSync, writeFileSync } = require('fs');

// ── 路徑解析 ──

function resolvePluginRoot(override) {
  if (override) return override;
  // gap-fixer.js 位於 scripts/lib/，往上兩層到 plugin root
  return path.resolve(__dirname, '..', '..');
}

function resolveFixConsistencyPath(pluginRoot) {
  return path.join(pluginRoot, 'scripts', 'fix-consistency.js');
}

// ── 核心修復函式 ──

/**
 * 修復 sync-mismatch 缺口（批次呼叫 fix-consistency.js）
 * @param {object[]} mismatchGaps
 * @param {string} fixConsistencyPath
 * @param {string} projectRoot
 * @returns {{ fixed: object[], failed: object[] }}
 */
function fixSyncMismatches(mismatchGaps, fixConsistencyPath, projectRoot) {
  if (mismatchGaps.length === 0) return { fixed: [], failed: [] };

  // 批次執行一次
  const result = Bun.spawnSync(['bun', fixConsistencyPath, '--fix'], {
    cwd: projectRoot,
    stderr: 'pipe',
    stdout: 'pipe',
  });

  if (result.exitCode === 0) {
    return { fixed: [...mismatchGaps], failed: [] };
  } else {
    const errMsg = result.stderr ? Buffer.from(result.stderr).toString() : 'fix-consistency.js 執行失敗';
    return {
      fixed: [],
      failed: mismatchGaps.map((gap) => ({ gap, error: errMsg })),
    };
  }
}

/**
 * 修復 no-references 缺口（建立 references/README.md）
 * @param {object} gap
 * @param {string} pluginRoot
 * @returns {{ fixed?: object, failed?: object }}
 */
function fixNoReferences(gap, pluginRoot) {
  // 從 gap.file 解析 skillName（e.g., skills/foo/SKILL.md → foo）
  const parts = (gap.file || '').split('/');
  const skillIdx = parts.indexOf('skills');
  const skillName = skillIdx >= 0 && parts[skillIdx + 1] ? parts[skillIdx + 1] : null;

  if (!skillName) {
    return { failed: { gap, error: '無法從 file 路徑解析 skillName' } };
  }

  const refsDir = path.join(pluginRoot, 'skills', skillName, 'references');
  const readmePath = path.join(refsDir, 'README.md');

  try {
    mkdirSync(refsDir, { recursive: true });
    writeFileSync(readmePath, '# References\n');
    return { fixed: gap };
  } catch (err) {
    return { failed: { gap, error: err.message } };
  }
}

// ── 主 API ──

/**
 * @param {object[]} gaps
 * @param {{ dryRun?: boolean, typeFilter?: string, pluginRoot?: string }} options
 * @returns {{ fixed: object[], skipped: object[], failed: object[] }}
 */
function fixGaps(gaps, options = {}) {
  const {
    dryRun = true,
    typeFilter,
    pluginRoot: pluginRootOverride,
  } = options;

  const pluginRoot = resolvePluginRoot(pluginRootOverride);
  const projectRoot = path.resolve(pluginRoot, '..', '..');
  const fixConsistencyPath = resolveFixConsistencyPath(pluginRoot);

  const fixed = [];
  const skipped = [];
  const failed = [];

  if (!gaps || gaps.length === 0) {
    return { fixed, skipped, failed };
  }

  // 將缺口分類
  const toProcess = [];

  for (const gap of gaps) {
    // 不可修復的缺口 → 跳過
    if (!gap.fixable) {
      skipped.push({ gap, reason: 'not-fixable' });
      continue;
    }

    // dry-run 模式 → 跳過所有
    if (dryRun) {
      skipped.push({ gap, reason: 'dry-run' });
      continue;
    }

    // typeFilter 過濾
    if (typeFilter && gap.type !== typeFilter) {
      skipped.push({ gap, reason: 'type-filter' });
      continue;
    }

    toProcess.push(gap);
  }

  if (toProcess.length === 0) {
    return { fixed, skipped, failed };
  }

  // 分組處理
  const syncMismatches = toProcess.filter((g) => g.type === 'sync-mismatch');
  const noReferences = toProcess.filter((g) => g.type === 'no-references');

  // 批次處理 sync-mismatch（只呼叫一次 fix-consistency.js）
  if (syncMismatches.length > 0) {
    const { fixed: f, failed: fa } = fixSyncMismatches(syncMismatches, fixConsistencyPath, projectRoot);
    fixed.push(...f);
    failed.push(...fa);
  }

  // 逐個處理 no-references
  for (const gap of noReferences) {
    const { fixed: f, failed: fa } = fixNoReferences(gap, pluginRoot);
    if (f) fixed.push(f);
    if (fa) failed.push(fa);
  }

  return { fixed, skipped, failed };
}

module.exports = { fixGaps };
