#!/usr/bin/env node
'use strict';
/**
 * validate-agents.js — 驗證所有 plugin 元件的正確性
 *
 * 透過 config-api.validateAll() 執行完整驗證：agents + hooks + skills + 交叉一致性。
 *
 * 檢查項目：
 *   Agents:
 *   1. agents/ 目錄下所有 .md 檔案格式正確
 *   2. frontmatter 必填欄位完整（name、description、model、permissionMode、color、maxTurns）
 *   3. model 與 registry agentModels 一致
 *   4. permissionMode === 'bypassPermissions'
 *   5. disallowedTools/tools 工具名稱值域（未知工具 → warning）
 *   6. skills 引用存在性
 *
 *   Hooks:
 *   7. hooks.json 官方三層嵌套格式驗證
 *   8. 每個 handler 的 type 和 command 欄位存在
 *   9. command 指向的腳本存在
 *
 *   Skills:
 *   10. SKILL.md frontmatter 必填欄位
 *   11. references/ 引用完整性
 *
 *   交叉驗證:
 *   12. registry-data.json stages 中定義的 agent 都有對應 .md 檔案
 *
 *   Prompt 品質（警告，不阻擋）:
 *   13. agent prompt 包含四模式要素（停止條件/邊界清單/誤判防護/信心過濾）
 */

const { join } = require('path');
const { readdirSync, readFileSync, existsSync } = require('fs');
const { validateAll } = require('./lib/config-api');

const PLUGIN_ROOT = join(__dirname, '..');

let totalErrors = 0;
let totalWarnings = 0;

function printResult(name, result) {
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

const allResult = validateAll(PLUGIN_ROOT);

// ── Agents ──
const agentNames = Object.keys(allResult.agents);
console.log(`\n🔍 Agents（${agentNames.length} 個）`);
for (const [name, result] of Object.entries(allResult.agents)) {
  printResult(name, result);
}

// ── Hooks ──
const hookNames = Object.keys(allResult.hooks);
console.log(`\n🔍 Hooks（${hookNames.length} 個）`);
for (const [event, result] of Object.entries(allResult.hooks)) {
  printResult(event, result);
}

// ── Skills ──
const skillNames = Object.keys(allResult.skills);
console.log(`\n🔍 Skills（${skillNames.length} 個）`);
for (const [name, result] of Object.entries(allResult.skills)) {
  printResult(name, result);
}

// ── 交叉驗證 ──
console.log('\n🔗 交叉驗證...');
if (allResult.cross.errors.length > 0) {
  for (const err of allResult.cross.errors) {
    console.error(`  ❌ ${err}`);
    totalErrors++;
  }
} else {
  console.log('  ✅ 交叉驗證通過');
}

// ── Prompt 品質檢查（四模式要素）──
console.log('\n🔍 Prompt 品質檢查...');
const PROMPT_ELEMENTS = [
  { key: '停止條件', patterns: ['停止條件', 'Stop Condition'] },
  { key: '邊界清單', patterns: ['DO（', "DON'T（", 'DO\\(', "DON'T\\("] },
  { key: '誤判防護', patterns: ['誤判防護', 'false positive', 'False Positive', '防 false'] },
  { key: '信心過濾', patterns: ['信心', 'confidence', '80%', '70%'] }
];

const agentsDir = join(PLUGIN_ROOT, 'agents');
const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
let promptWarnings = 0;
for (const file of agentFiles.sort()) {
  const agentName = file.replace('.md', '');
  const content = readFileSync(join(agentsDir, file), 'utf8');
  const missing = [];
  for (const el of PROMPT_ELEMENTS) {
    const found = el.patterns.some(p => new RegExp(p).test(content));
    if (!found) missing.push(el.key);
  }
  if (missing.length > 0) {
    for (const m of missing) {
      console.warn(`  ⚠️  ${agentName}: 缺少 ${m}`);
      totalWarnings++;
      promptWarnings++;
    }
  }
}
if (promptWarnings === 0) {
  console.log('  ✅ 所有 agent prompt 包含四模式要素');
}

// ── 結果摘要 ──
console.log('\n' + '─'.repeat(40));
if (totalErrors === 0) {
  console.log(`\n🎉 驗證通過！${agentNames.length} agents + ${hookNames.length} hooks + ${skillNames.length} skills 全部正確。`);
  if (totalWarnings > 0) {
    console.log(`⚠️  ${totalWarnings} 個警告。`);
  }
} else {
  console.log(`\n💥 驗證失敗：${totalErrors} 個錯誤，${totalWarnings} 個警告。`);
  process.exit(1);
}
