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
 */

const { analyzeGaps } = require('./lib/gap-analyzer');
const { fixGaps } = require('./lib/gap-fixer');
const { forgeSkill } = require('./lib/skill-forge');

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
  process.stdout.write('\n');
  process.stdout.write('選項：\n');
  process.stdout.write('  --json      以 JSON 格式輸出\n');
  process.stdout.write('  --execute   實際執行（fix/forge 子命令預設為 dry-run）\n');
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
    if (!domainName) {
      process.stdout.write('forge 子命令用法：bun scripts/evolution.js forge <domain> [--execute] [--json]\n');
      process.stdout.write('\n');
      process.stdout.write('  forge <domain>              預覽 forge 結果（dry-run，不建立任何檔案）\n');
      process.stdout.write('  forge <domain> --execute    實際執行 forge，建立 skill\n');
      process.stdout.write('  forge <domain> --json       以 JSON 格式輸出結果\n');
      process.exit(1);
    }

    let result;
    try {
      result = forgeSkill(domainName, {}, { dryRun: !execute });
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
  } else {
    process.stderr.write(`未知子命令：${subcommand}\n\n`);
    printUsage();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { formatTextReport, formatFixDryRun, formatFixResult, main, VALID_FIX_TYPES };
