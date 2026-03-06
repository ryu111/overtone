#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { build } = require('./src/builder');

function parseArgs(argv) {
  // argv = process.argv.slice(2)
  const args = { command: null, inputDir: null, outputDir: './dist' };

  if (argv.length === 0) return args;

  args.command = argv[0];

  let i = 1;
  while (i < argv.length) {
    if (argv[i] === '--output' || argv[i] === '-o') {
      args.outputDir = argv[i + 1];
      i += 2;
    } else if (!argv[i].startsWith('-')) {
      args.inputDir = argv[i];
      i++;
    } else {
      i++;
    }
  }

  return args;
}

function main(argv) {
  const args = parseArgs(argv);

  if (args.command !== 'build') {
    process.stderr.write(`使用方式：md-blog build <inputDir> [--output <outputDir>]\n`);
    process.exit(1);
  }

  if (!args.inputDir) {
    process.stderr.write(`錯誤：請提供 inputDir 參數\n使用方式：md-blog build <inputDir> [--output <outputDir>]\n`);
    process.exit(1);
  }

  const inputDir = path.resolve(args.inputDir);
  if (!fs.existsSync(inputDir)) {
    process.stderr.write(`錯誤：路徑不存在：${inputDir}\n`);
    process.exit(1);
  }

  const outputDir = path.resolve(args.outputDir);

  try {
    const result = build(inputDir, outputDir);
    const postCount = result.skipped === 0
      ? `成功建置，共 ${result.skipped} 篇 skip`
      : `成功建置，${result.skipped} 篇 skip`;
    process.stdout.write(`建置完成 → ${result.outputDir}\n`);
    if (result.skipped > 0) {
      process.stdout.write(`（${result.skipped} 篇文章因解析錯誤被略過）\n`);
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`建置失敗：${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { main, parseArgs };
