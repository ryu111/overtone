#!/usr/bin/env node
'use strict';
/**
 * evolution.js — Evolution Engine CLI 入口
 *
 * 用法：bun scripts/evolution.js analyze [--json]
 *
 *   analyze         執行 gap 分析，輸出純文字報告（有缺口 exit 1，無缺口 exit 0）
 *   analyze --json  輸出 JSON 格式報告
 */

const { analyzeGaps } = require('./lib/gap-analyzer');

// ── 工具函式 ──

function printUsage() {
  process.stdout.write('用法：bun scripts/evolution.js <subcommand> [options]\n');
  process.stdout.write('\n');
  process.stdout.write('子命令：\n');
  process.stdout.write('  analyze         執行 gap 分析，輸出純文字報告\n');
  process.stdout.write('  analyze --json  輸出 JSON 格式報告（供程式消費）\n');
  process.stdout.write('\n');
  process.stdout.write('選項：\n');
  process.stdout.write('  --json   以 JSON 格式輸出（搭配 analyze 使用）\n');
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
  } else {
    process.stderr.write(`未知子命令：${subcommand}\n\n`);
    printUsage();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { formatTextReport, main };
