#!/usr/bin/env node
'use strict';
/**
 * validate-agents.js — 驗證所有 agent .md 檔案的正確性
 *
 * 透過 config-api.validateAll() 執行完整驗證，保留原有的 CLI 輸出格式。
 *
 * 檢查項目：
 *   1. agents/ 目錄下所有 .md 檔案格式正確
 *   2. frontmatter 必填欄位完整（name、description、model、permissionMode、color、maxTurns）
 *   3. model 與 registry agentModels 一致
 *   4. permissionMode === 'bypassPermissions'
 *   5. disallowedTools/tools 工具名稱值域（未知工具 → warning）
 *   6. skills 引用存在性
 *   7. registry-data.json stages 中定義的 agent 都有對應 .md 檔案（交叉驗證）
 */

const { join } = require('path');
const { validateAll } = require('./lib/config-api');

const PLUGIN_ROOT = join(__dirname, '..');

let totalErrors = 0;
let totalWarnings = 0;

function printResult(name, result, type) {
  console.log(`\n📄 ${name}`);
  if (result.valid && result.errors.length === 0 && result.warnings.length === 0) {
    console.log('  ✅ 驗證通過');
  } else {
    for (const err of result.errors) {
      console.error(`  ❌ ${err}`);
      totalErrors++;
    }
    for (const warn of result.warnings) {
      console.warn(`  ⚠️  ${warn}`);
      totalWarnings++;
    }
    if (result.errors.length === 0 && result.warnings.length > 0) {
      console.log('  ✅ 驗證通過（含警告）');
    }
  }
}

console.log('\n🔍 驗證 Agent 檔案...\n');

const allResult = validateAll(PLUGIN_ROOT);

// 輸出各 agent 結果
const agentNames = Object.keys(allResult.agents);
console.log(`📂 找到 ${agentNames.length} 個 agent 檔案`);

for (const [name, result] of Object.entries(allResult.agents)) {
  printResult(name, result, 'agent');
}

// 輸出交叉驗證結果
console.log('\n🔗 交叉驗證...');
if (allResult.cross.errors.length > 0) {
  for (const err of allResult.cross.errors) {
    console.error(`  ❌ ${err}`);
    totalErrors++;
  }
} else {
  console.log('  ✅ 交叉驗證通過');
}

// 結果摘要
console.log('\n' + '─'.repeat(40));
if (totalErrors === 0) {
  console.log(`\n🎉 驗證通過！${agentNames.length} 個 agent 檔案全部正確。`);
  if (totalWarnings > 0) {
    console.log(`⚠️  ${totalWarnings} 個警告。`);
  }
} else {
  console.log(`\n💥 驗證失敗：${totalErrors} 個錯誤，${totalWarnings} 個警告。`);
  process.exit(1);
}
