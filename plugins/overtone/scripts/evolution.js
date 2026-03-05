#!/usr/bin/env node
'use strict';
/**
 * evolution.js — Evolution Engine CLI 入口
 *
 * 用法：bun scripts/evolution.js <subcommand> [options]
 *
 *   analyze              執行 gap 分析，輸出純文字報告（有缺口 exit 1，無缺口 exit 0）
 *   analyze --json       輸出 JSON 格式報告
 *   fix                  預覽可修復缺口（dry-run）
 *   fix --execute        實際執行修復
 *   forge <domain>       預覽 forge 結果（dry-run，不建立任何檔案）
 *   forge <domain> --execute  實際執行 forge，建立 skill
 *   forge <domain> --json     以 JSON 格式輸出結果
 *   orchestrate <specPath>    從 Project Spec 協調：gap 偵測 + skill forge + 佇列排程（dry-run）
 *   orchestrate <specPath> --execute   實際執行
 *   orchestrate <specPath> --json      JSON 輸出
 *   orchestrate <specPath> --overwrite 覆蓋現有佇列
 *   orchestrate <specPath> --workflow <template>  指定 workflow 類型
 *   internalize          評估 auto-discovered.md 並生成 internalized.md（dry-run）
 *   internalize --execute  實際寫入 internalized.md + 更新 experience-index
 *   internalize --json   JSON 格式輸出
 */

const { analyzeGaps } = require('./lib/gap-analyzer');
const { fixGaps } = require('./lib/gap-fixer');
const { forgeSkill } = require('./lib/skill-forge');
const { orchestrate } = require('./lib/project-orchestrator');
const { evaluateEntries } = require('./lib/knowledge/skill-evaluator');
const { generalizeEntries } = require('./lib/knowledge/skill-generalizer');
const { buildIndex } = require('./lib/knowledge/experience-index');

// ── 工具函式 ──

const VALID_FIX_TYPES = ['sync-mismatch', 'no-references'];

function printUsage() {
  process.stdout.write('用法：bun scripts/evolution.js <subcommand> [options]\n');
  process.stdout.write('\n');
  process.stdout.write('子命令：\n');
  process.stdout.write('  analyze              執行 gap 分析，輸出純文字報告\n');
  process.stdout.write('  analyze --json       輸出 JSON 格式報告（供程式消費）\n');
  process.stdout.write('  fix                  預覽可修復缺口（dry-run，不修改任何檔案）\n');
  process.stdout.write('  fix --execute        實際執行修復\n');
  process.stdout.write('  fix --type <type>    只修復指定類型（sync-mismatch / no-references）\n');
  process.stdout.write('  fix --json           以 JSON 格式輸出修復結果\n');
  process.stdout.write('  forge <domain>       預覽 forge 結果（dry-run，不建立任何檔案）\n');
  process.stdout.write('  forge <domain> --execute  實際執行 forge，建立 skill\n');
  process.stdout.write('  forge <domain> --json     以 JSON 格式輸出 forge 結果\n');
  process.stdout.write('  forge <domain> --research 啟用外部 WebSearch 研究補充知識\n');
  process.stdout.write('  orchestrate <specPath>              從 Project Spec dry-run 預覽協調流程\n');
  process.stdout.write('  orchestrate <specPath> --execute    實際執行：gap 偵測 + skill forge + 佇列排程\n');
  process.stdout.write('  orchestrate <specPath> --json       JSON 格式輸出\n');
  process.stdout.write('  orchestrate <specPath> --overwrite  覆蓋現有佇列（預設 append）\n');
  process.stdout.write('  orchestrate <specPath> --workflow <template>  指定 workflow 類型（預設 standard）\n');
  process.stdout.write('  internalize          評估 auto-discovered 條目並預覽內化結果（dry-run）\n');
  process.stdout.write('  internalize --execute  實際寫入 internalized.md + 更新 experience-index\n');
  process.stdout.write('  internalize --json   以 JSON 格式輸出內化結果\n');
  process.stdout.write('\n');
  process.stdout.write('選項：\n');
  process.stdout.write('  --json      以 JSON 格式輸出\n');
  process.stdout.write('  --execute   實際執行（fix/forge/orchestrate/internalize 子命令預設為 dry-run）\n');
  process.stdout.write('  --type <t>  限制修復類型（sync-mismatch / no-references）\n');
}

function formatTextReport(report) {
  const { gaps, summary } = report;
  const lines = [];

  lines.push(`Evolution Gap Analysis`);
  lines.push(`======================`);
  lines.push(`總計：${summary.total} 個缺口`);
  lines.push('');

  if (gaps.length === 0) {
    lines.push('無缺口 — 所有元件一致性正常');
    return lines.join('\n');
  }

  // 依 severity 排序（error 優先）
  const severityOrder = { error: 0, warning: 1, info: 2 };
  const sorted = [...gaps].sort((a, b) =>
    (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
  );

  for (const gap of sorted) {
    lines.push(`[${gap.severity.toUpperCase()}] ${gap.type}`);
    lines.push(`  file: ${gap.file || '(unknown)'}`);
    lines.push(`  message: ${gap.message}`);
    lines.push(`  suggestion: ${gap.suggestion}`);
    lines.push(`  source: ${gap.sourceCheck}`);
    lines.push('');
  }

  lines.push(`摘要：`);
  lines.push(`  by severity: error=${summary.bySeverity.error} warning=${summary.bySeverity.warning} info=${summary.bySeverity.info}`);
  lines.push(`  by type:`);
  for (const [type, count] of Object.entries(summary.byType)) {
    if (count > 0) lines.push(`    ${type}: ${count}`);
  }

  return lines.join('\n');
}

function formatFixDryRun(fixableGaps, typeFilter) {
  const lines = [];
  lines.push('Evolution Fix — Dry Run 預覽');
  lines.push('============================');

  if (typeFilter) {
    lines.push(`類型過濾：${typeFilter}`);
    lines.push('');
  }

  if (fixableGaps.length === 0) {
    lines.push('無可修復缺口');
    return lines.join('\n');
  }

  lines.push(`可修復缺口：${fixableGaps.length} 個（加 --execute 執行修復）`);
  lines.push('');

  for (const gap of fixableGaps) {
    lines.push(`  [${gap.type}] ${gap.file || '(unknown)'}`);
    lines.push(`    動作：${gap.fixAction}`);
    lines.push(`    訊息：${gap.message}`);
    lines.push('');
  }

  return lines.join('\n');
}

function formatFixResult(fixResult, remainingGaps, typeFilter) {
  const { fixed, skipped, failed } = fixResult;
  const lines = [];

  lines.push('Evolution Fix — 修復結果');
  lines.push('========================');

  if (typeFilter) {
    lines.push(`類型過濾：${typeFilter}`);
    lines.push('');
  }

  lines.push(`修復結果：fixed=${fixed.length} / skipped=${skipped.length} / failed=${failed.length}`);
  lines.push('');

  if (fixed.length > 0) {
    lines.push('已修復：');
    for (const gap of fixed) {
      lines.push(`  [${gap.type}] ${gap.file || '(unknown)'}`);
    }
    lines.push('');
  }

  if (failed.length > 0) {
    lines.push('修復失敗：');
    for (const item of failed) {
      lines.push(`  [${item.gap.type}] ${item.gap.file || '(unknown)'} — ${item.error}`);
    }
    lines.push('');
  }

  if (remainingGaps.length > 0) {
    lines.push(`驗證結果：仍有 ${remainingGaps.length} 個可修復缺口未解決`);
    for (const gap of remainingGaps) {
      lines.push(`  [${gap.type}] ${gap.file || '(unknown)'} — ${gap.message}`);
    }
  } else {
    lines.push('驗證結果：無剩餘可修復缺口');
  }

  return lines.join('\n');
}

/**
 * 格式化內化預覽（human-readable）
 * @param {object} result - runInternalize() 回傳值
 * @param {boolean} dryRun
 * @returns {string}
 */
function formatInternalizeOutput(result, dryRun) {
  const lines = [];
  lines.push('=== Skill Internalization ===');
  lines.push(`評估條目：${result.evaluated}`);
  lines.push(`通過門檻：${result.retained}`);
  lines.push(`通用化後保留：${result.generalized}`);
  lines.push(`跳過（太短）：${result.skipped}`);

  if (dryRun) {
    lines.push('');
    lines.push('[dry-run] 以上為預覽，加 --execute 執行');
  } else {
    lines.push('');
    lines.push(`已寫入：${result.outputPath}`);
    lines.push('experience-index 已更新');
  }

  return lines.join('\n');
}

/**
 * 執行內化流程（可測試的純邏輯函式，不直接呼叫 process.exit）
 *
 * @param {object} options
 * @param {boolean} options.execute - 是否實際寫入
 * @param {string} options.pluginRoot - plugin 根目錄路徑
 * @param {string} options.projectRoot - 專案根目錄路徑
 * @returns {{ evaluated: number, retained: number, generalized: number, skipped: number, outputPath: string, entries: object[] }}
 */
function runInternalize(options = {}) {
  const { join } = require('path');
  const { mkdirSync, writeFileSync } = require('fs');

  const pluginRoot = options.pluginRoot || _resolvePluginRoot();
  const projectRoot = options.projectRoot || process.cwd();
  const execute = options.execute || false;

  // 步驟 1：找到 auto-discovered.md 路徑
  const autoDiscoveredPath = join(pluginRoot, 'skills', 'instinct', 'auto-discovered.md');

  // 步驟 2：評估所有條目
  const evaluated = evaluateEntries(autoDiscoveredPath, projectRoot);

  // 步驟 3：過濾通過門檻的條目（qualified=true）
  const qualifiedEntries = evaluated.filter(e => e.qualified === true);

  // 步驟 4：通用化（generalizeEntries 只處理 qualified=true 的條目）
  const generalizedResults = generalizeEntries(evaluated);

  // 步驟 5：過濾掉 isEmpty 的條目
  const nonEmptyResults = generalizedResults.filter(r => !r.isEmpty);
  const skipped = generalizedResults.length - nonEmptyResults.length;

  // 組裝輸出路徑
  const outputPath = join(pluginRoot, 'skills', 'instinct', 'internalized.md');

  if (execute) {
    // 步驟 7：寫入 internalized.md
    const content = _buildInternalizedContent(nonEmptyResults, evaluated);
    mkdirSync(join(pluginRoot, 'skills', 'instinct'), { recursive: true });
    writeFileSync(outputPath, content, 'utf8');

    // 步驟 7b：呼叫 buildIndex() 更新 experience-index
    const domains = _extractDomains(evaluated);
    if (domains.length > 0) {
      buildIndex(projectRoot, domains);
    }
  }

  return {
    evaluated: evaluated.length,
    retained: qualifiedEntries.length,
    generalized: nonEmptyResults.length,
    skipped,
    outputPath,
    entries: nonEmptyResults,
  };
}

/**
 * 從評估結果中提取 domain 清單（去重）
 * @param {object[]} evaluatedEntries
 * @returns {string[]}
 */
function _extractDomains(evaluatedEntries) {
  const domains = new Set();
  for (const e of evaluatedEntries) {
    if (e.domain) domains.add(e.domain);
  }
  return Array.from(domains);
}

/**
 * 建立 internalized.md 內容
 * @param {Array<{generalized: string, original: string}>} results
 * @param {object[]} evaluatedEntries - 用於 domain 資訊
 * @returns {string}
 */
function _buildInternalizedContent(results, evaluatedEntries) {
  const now = new Date().toISOString();
  const lines = [];

  // frontmatter
  lines.push('---');
  lines.push(`lastUpdated: ${now}`);
  lines.push('version: 1');
  lines.push('---');
  lines.push('');
  lines.push('# Internalized Knowledge');

  for (const result of results) {
    // 嘗試找到對應的 domain
    const matched = evaluatedEntries.find(e => e.entry === result.original);
    const domain = matched ? (matched.domain || 'general') : 'general';

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## ${domain}`);
    lines.push('');
    lines.push(result.generalized);
  }

  return lines.join('\n') + '\n';
}

/**
 * 解析 plugin 根目錄路徑（從 __dirname 推算）
 * @returns {string}
 */
function _resolvePluginRoot() {
  const { join } = require('path');
  // __dirname = plugins/overtone/scripts/
  // pluginRoot = plugins/overtone/
  return join(__dirname, '..');
}

// ── 主流程 ──

function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const positional = args.filter((a) => !a.startsWith('--'));

  const subcommand = positional[0];
  const jsonOutput = flags.includes('--json');

  if (!subcommand) {
    printUsage();
    process.exit(1);
  }

  if (subcommand === 'analyze') {
    let report;
    try {
      report = analyzeGaps();
    } catch (err) {
      process.stderr.write(`錯誤：${err.message}\n`);
      process.exit(1);
    }

    if (jsonOutput) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      process.stdout.write(formatTextReport(report) + '\n');
    }

    process.exit(report.summary.total > 0 ? 1 : 0);
  } else if (subcommand === 'fix') {
    const execute = flags.includes('--execute');

    // 解析 --type 參數
    const typeIdx = args.indexOf('--type');
    const typeFilter = typeIdx >= 0 ? args[typeIdx + 1] : undefined;

    // 驗證 --type 值
    if (typeFilter !== undefined) {
      if (!VALID_FIX_TYPES.includes(typeFilter)) {
        process.stderr.write(`錯誤：無效的 --type 值 "${typeFilter}"。有效值：${VALID_FIX_TYPES.join(' / ')}\n`);
        process.exit(1);
      }
    }

    // 取得缺口清單
    let report;
    try {
      report = analyzeGaps();
    } catch (err) {
      process.stderr.write(`錯誤：${err.message}\n`);
      process.exit(1);
    }

    // 過濾出可修復缺口（再根據 typeFilter 過濾）
    let fixableGaps = report.gaps.filter((g) => g.fixable);
    if (typeFilter) {
      fixableGaps = fixableGaps.filter((g) => g.type === typeFilter);
    }

    // 無可修復缺口
    if (report.gaps.length === 0) {
      if (jsonOutput) {
        process.stdout.write(JSON.stringify({ dryRun: !execute, fixableGaps: [], fixed: [], skipped: [], failed: [], remainingGaps: [] }, null, 2) + '\n');
      } else {
        process.stdout.write('無缺口需要修復\n');
      }
      process.exit(0);
    }

    if (fixableGaps.length === 0) {
      // 有缺口但無可修復的
      const nonFixable = report.gaps.filter((g) => !g.fixable);
      if (jsonOutput) {
        process.stdout.write(JSON.stringify({ dryRun: !execute, fixableGaps: [], fixed: [], skipped: [], failed: [], remainingGaps: [] }, null, 2) + '\n');
      } else {
        process.stdout.write('無可修復缺口（所有缺口需人工處理）\n');
        if (nonFixable.length > 0) {
          process.stdout.write('\n需人工處理的缺口：\n');
          for (const gap of nonFixable) {
            process.stdout.write(`  [${gap.type}] ${gap.file || '(unknown)'} — ${gap.message}\n`);
          }
        }
      }
      process.exit(0);
    }

    // Dry-run 模式（不加 --execute）
    if (!execute) {
      if (jsonOutput) {
        process.stdout.write(JSON.stringify({ dryRun: true, fixableGaps }, null, 2) + '\n');
      } else {
        process.stdout.write(formatFixDryRun(fixableGaps, typeFilter) + '\n');
      }
      process.exit(0);
    }

    // 執行修復
    let fixResult;
    try {
      fixResult = fixGaps(fixableGaps, { dryRun: false, typeFilter: undefined }); // typeFilter 已預先篩選
    } catch (err) {
      process.stderr.write(`修復過程發生錯誤：${err.message}\n`);
      process.exit(1);
    }

    // 重新驗證
    let afterReport;
    try {
      afterReport = analyzeGaps();
    } catch {
      afterReport = { gaps: [] };
    }
    const remainingFixable = afterReport.gaps.filter((g) => g.fixable);

    if (jsonOutput) {
      const output = {
        dryRun: false,
        fixed: fixResult.fixed,
        skipped: fixResult.skipped,
        failed: fixResult.failed,
        remainingGaps: remainingFixable,
      };
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    } else {
      process.stdout.write(formatFixResult(fixResult, remainingFixable, typeFilter) + '\n');
    }

    if (remainingFixable.length > 0) {
      process.stderr.write(`驗證失敗：仍有 ${remainingFixable.length} 個可修復缺口\n`);
      process.exit(1);
    }
    process.exit(0);
  } else if (subcommand === 'forge') {
    const domainName = positional[1];
    const execute = flags.includes('--execute');

    // 缺少 domain 參數
    const enableWebResearch = flags.includes('--research');

    if (!domainName) {
      process.stdout.write('forge 子命令用法：bun scripts/evolution.js forge <domain> [--execute] [--json] [--research]\n');
      process.stdout.write('\n');
      process.stdout.write('  forge <domain>              預覽 forge 結果（dry-run，不建立任何檔案）\n');
      process.stdout.write('  forge <domain> --execute    實際執行 forge，建立 skill\n');
      process.stdout.write('  forge <domain> --json       以 JSON 格式輸出結果\n');
      process.stdout.write('  forge <domain> --research   啟用外部 WebSearch 研究補充知識\n');
      process.exit(1);
    }

    let result;
    try {
      result = forgeSkill(domainName, {}, { dryRun: !execute, enableWebResearch });
    } catch (err) {
      process.stderr.write(`forge 執行錯誤：${err.message}\n`);
      process.exit(1);
    }

    if (jsonOutput) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      // conflict / paused / error → exit 1
      if (result.status !== 'success') {
        process.exit(1);
      }
      process.exit(0);
    }

    // 人類可讀輸出
    if (result.status === 'success') {
      if (result.preview) {
        // dry-run 成功
        process.stdout.write(`Skill Forge — Dry Run 預覽\n`);
        process.stdout.write(`==========================\n`);
        process.stdout.write(`Domain：${result.domainName}\n`);
        process.stdout.write(`描述：${result.preview.description}\n`);
        process.stdout.write(`\n已掃描來源（${result.preview.sourcesScanned.length} 個）：\n`);
        for (const src of result.preview.sourcesScanned.slice(0, 5)) {
          process.stdout.write(`  ${src}\n`);
        }
        if (result.preview.sourcesScanned.length > 5) {
          process.stdout.write(`  ...（共 ${result.preview.sourcesScanned.length} 個）\n`);
        }
        process.stdout.write(`\n--- SKILL.md Body 預覽（前 500 字元）---\n`);
        process.stdout.write(result.preview.body.slice(0, 500) + '\n');
        process.stdout.write(`---\n`);
        process.stdout.write(`\n加 --execute 旗標實際建立此 skill。\n`);
      } else {
        // execute 成功
        process.stdout.write(`Skill Forge — 建立成功\n`);
        process.stdout.write(`======================\n`);
        process.stdout.write(`Domain：${result.domainName}\n`);
        process.stdout.write(`路徑：${result.skillPath}\n`);
      }
      process.exit(0);
    }

    if (result.status === 'conflict') {
      process.stdout.write(`衝突：skill "${result.domainName}" 已存在於 ${result.conflictPath}\n`);
      process.exit(1);
    }

    if (result.status === 'paused') {
      process.stdout.write(`已暫停：連續失敗 ${result.consecutiveFailures} 次，超過上限\n`);
      process.exit(1);
    }

    if (result.status === 'error') {
      process.stderr.write(`forge 失敗：${result.error}\n`);
      process.exit(1);
    }

    // 未預期的 status
    process.stderr.write(`未預期的 forge 結果：${JSON.stringify(result)}\n`);
    process.exit(1);
  } else if (subcommand === 'orchestrate') {
    const specPath = positional[1];
    const execute = flags.includes('--execute');
    const overwriteQueue = flags.includes('--overwrite');

    // 解析 --workflow 參數
    const workflowIdx = args.indexOf('--workflow');
    const workflowTemplate = workflowIdx >= 0 ? args[workflowIdx + 1] : 'standard';

    // 解析 --project-root 參數（預設 cwd）
    const projectRootIdx = args.indexOf('--project-root');
    const projectRoot = projectRootIdx >= 0 ? args[projectRootIdx + 1] : process.cwd();

    // 無 specPath 時顯示用法
    if (!specPath) {
      process.stderr.write('orchestrate 子命令用法：bun scripts/evolution.js orchestrate <specPath> [--execute] [--json] [--overwrite] [--workflow <template>]\n');
      process.stderr.write('\n');
      process.stderr.write('  orchestrate <specPath>              dry-run 預覽（不修改任何檔案）\n');
      process.stderr.write('  orchestrate <specPath> --execute    實際執行：gap 偵測 + skill forge + 佇列排程\n');
      process.stderr.write('  orchestrate <specPath> --json       JSON 格式輸出\n');
      process.stderr.write('  orchestrate <specPath> --overwrite  覆蓋現有佇列（預設 append）\n');
      process.stderr.write('  orchestrate <specPath> --workflow <template>  指定 workflow 類型（預設 standard）\n');
      process.exit(1);
    }

    // 讀取 spec 檔案
    const fs = require('fs');
    if (!fs.existsSync(specPath)) {
      process.stderr.write(`找不到 spec 檔案：${specPath}\n`);
      process.exit(1);
    }

    let specContent;
    try {
      specContent = fs.readFileSync(specPath, 'utf8');
    } catch (err) {
      process.stderr.write(`讀取 spec 檔案失敗：${err.message}\n`);
      process.exit(1);
    }

    // 執行 orchestrate
    let result;
    try {
      result = orchestrate(specContent, {
        dryRun: !execute,
        execute,
        workflowTemplate,
        overwriteQueue,
        projectRoot,
      });
    } catch (err) {
      process.stderr.write(`orchestrate 執行錯誤：${err.message}\n`);
      process.exit(1);
    }

    if (jsonOutput) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(0);
    }

    // 人類可讀輸出
    const isDryRun = result.summary.dryRun;
    if (isDryRun) {
      process.stdout.write('Project Orchestrator — Dry Run 預覽\n');
      process.stdout.write('=====================================\n');
    } else {
      process.stdout.write('Project Orchestrator — 執行結果\n');
      process.stdout.write('=================================\n');
    }
    process.stdout.write('\n');

    // 能力盤點
    process.stdout.write('能力盤點：\n');
    if (result.domainAudit.present.length > 0) {
      process.stdout.write(`  已有（${result.domainAudit.present.length} 個）：${result.domainAudit.present.join(', ')}\n`);
    } else {
      process.stdout.write('  已有：無\n');
    }
    if (result.domainAudit.missing.length > 0) {
      process.stdout.write(`  需建立（${result.domainAudit.missing.length} 個）：${result.domainAudit.missing.join(', ')}\n`);
    } else {
      process.stdout.write('  需建立：無\n');
    }
    process.stdout.write('\n');

    // Skill Forge 結果
    if (result.forgeResults.length > 0) {
      process.stdout.write('Skill Forge 結果：\n');
      for (const r of result.forgeResults) {
        process.stdout.write(`  [${r.status}] ${r.domainName}\n`);
        if (r.error) process.stdout.write(`    錯誤：${r.error}\n`);
      }
      process.stdout.write('\n');
    }

    // Feature 排程
    const items = result.queueResult.items || [];
    if (items.length > 0) {
      process.stdout.write(`Feature 排程（${workflowTemplate} workflow）：\n`);
      for (const item of items) {
        process.stdout.write(`  - ${item.name}\n`);
      }
      process.stdout.write('\n');
    } else {
      process.stdout.write('Feature 排程：無\n\n');
    }

    // 摘要
    const { totalDomains, presentCount, missingCount, forgedCount, featureCount } = result.summary;
    process.stdout.write(`摘要：${presentCount} present / ${missingCount} missing / ${forgedCount} forged / ${featureCount} features 排程\n`);

    if (isDryRun) {
      process.stdout.write('\n（dry-run 預覽，加 --execute 執行）\n');
    }

    process.exit(0);
  } else if (subcommand === 'internalize') {
    const execute = flags.includes('--execute');

    // 解析 --plugin-root（測試用，預設自動推算）
    const pluginRootIdx = args.indexOf('--plugin-root');
    const pluginRoot = pluginRootIdx >= 0 ? args[pluginRootIdx + 1] : undefined;

    // 解析 --project-root（測試用，預設 cwd）
    const projectRootIdx = args.indexOf('--project-root');
    const projectRoot = projectRootIdx >= 0 ? args[projectRootIdx + 1] : process.cwd();

    let result;
    try {
      result = runInternalize({ execute, pluginRoot, projectRoot });
    } catch (err) {
      process.stderr.write(`internalize 執行錯誤：${err.message}\n`);
      process.exit(1);
    }

    if (jsonOutput) {
      const output = {
        dryRun: !execute,
        evaluated: result.evaluated,
        retained: result.retained,
        generalized: result.generalized,
        skipped: result.skipped,
        outputPath: result.outputPath,
        entries: result.entries,
      };
      process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    } else {
      process.stdout.write(formatInternalizeOutput(result, !execute) + '\n');
    }

    process.exit(0);
  } else {
    process.stderr.write(`未知子命令：${subcommand}\n\n`);
    printUsage();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { formatTextReport, formatFixDryRun, formatFixResult, formatInternalizeOutput, runInternalize, main, VALID_FIX_TYPES, orchestrate };
