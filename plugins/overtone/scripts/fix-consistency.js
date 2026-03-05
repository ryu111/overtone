#!/usr/bin/env node
'use strict';
// fix-consistency.js — 自動修復 dependency-sync 偵測到的不一致
//
// 用法：
//   bun scripts/fix-consistency.js           — 顯示不一致（dry-run）
//   bun scripts/fix-consistency.js --fix     — 自動修復
//
// 修復範圍：
//   - SKILL.md 消費者表缺少 agent → 自動新增列
//   - agent frontmatter 引用不存在的 skill → 只警告（需人工決定）

const { join, resolve } = require('path');
const { readFileSync, writeFileSync } = require('fs');

const PLUGIN_ROOT = resolve(__dirname, '..');
const fix = process.argv.includes('--fix');

// 執行 checkDependencySync
const { checkDependencySync } = require('./health-check');
const findings = checkDependencySync();

if (findings.length === 0) {
  console.log('dependency-sync: 無不一致，全部同步。');
  process.exit(0);
}

console.log(`dependency-sync: 偵測到 ${findings.length} 個不一致\n`);

// 分類 findings
const skillMissing = []; // SKILL.md 消費者表缺 agent
const agentMissing = []; // agent frontmatter 引用 skill 但 SKILL.md 沒列

for (const f of findings) {
  if (f.file.startsWith('agents/') && f.message.includes('消費者表未列出')) {
    // agent 引用 skill，但 SKILL.md 消費者表沒列
    const agentMatch = f.message.match(/agent "([^"]+)"/);
    const skillMatch = f.message.match(/skill "([^"]+)"/);
    if (agentMatch && skillMatch) {
      skillMissing.push({
        agentName: agentMatch[1],
        skillName: skillMatch[1],
        finding: f,
      });
    }
  } else if (f.file.startsWith('skills/') && f.message.includes('frontmatter 未引用')) {
    agentMissing.push({ finding: f });
  }
}

// 顯示摘要
for (const item of skillMissing) {
  const action = fix ? '修復' : '需修復';
  console.log(`  [${action}] ${item.skillName}/SKILL.md 消費者表 +${item.agentName}`);
}
for (const item of agentMissing) {
  console.log(`  [需人工] ${item.finding.message}`);
}

if (!fix) {
  console.log(`\n使用 --fix 自動修復 ${skillMissing.length} 個 SKILL.md 消費者表缺漏`);
  process.exit(findings.length > 0 ? 1 : 0);
}

// 自動修復：在 SKILL.md 消費者表末尾新增缺少的 agent
// 按 skillName 分組
const bySkill = new Map();
for (const item of skillMissing) {
  if (!bySkill.has(item.skillName)) bySkill.set(item.skillName, []);
  bySkill.get(item.skillName).push(item.agentName);
}

let fixedCount = 0;
for (const [skillName, agents] of bySkill) {
  const skillPath = join(PLUGIN_ROOT, 'skills', skillName, 'SKILL.md');
  let content;
  try {
    content = readFileSync(skillPath, 'utf8');
  } catch {
    console.error(`  跳過 ${skillName}/SKILL.md（讀取失敗）`);
    continue;
  }

  // 找消費者表的最後一行（| ... | ... | 格式）
  const lines = content.split('\n');
  let lastTableLine = -1;
  let inConsumerSection = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^##\s*消費者/.test(lines[i])) {
      inConsumerSection = true;
      continue;
    }
    if (inConsumerSection && /^##\s/.test(lines[i])) {
      break; // 下一個 section
    }
    if (inConsumerSection && /^\|.*\|.*\|/.test(lines[i]) && !/^\|\s*-/.test(lines[i])) {
      // 跳過分隔線 |---|---|
      if (!/Agent/.test(lines[i])) { // 跳過表頭
        lastTableLine = i;
      }
    }
  }

  if (lastTableLine === -1) {
    console.error(`  跳過 ${skillName}/SKILL.md（找不到消費者表）`);
    continue;
  }

  // 在最後一行表格後插入新行
  const newRows = agents.map(a => `| ${a} | （依賴圖自動偵測新增） |`);
  lines.splice(lastTableLine + 1, 0, ...newRows);

  writeFileSync(skillPath, lines.join('\n'), 'utf8');
  fixedCount += agents.length;
  console.log(`  已修復 ${skillName}/SKILL.md：+${agents.join(', +')}`);
}

console.log(`\n修復完成：${fixedCount} 個消費者表條目已新增`);
if (agentMissing.length > 0) {
  console.log(`剩餘 ${agentMissing.length} 個需人工處理（SKILL.md 列了 agent 但 frontmatter 沒引用）`);
}
process.exit(0);
