#!/usr/bin/env node
'use strict';
/**
 * validate-agents.js — 驗證 14 個 agent .md 檔案的正確性
 *
 * 檢查項目：
 *   1. agents/ 目錄下有 14 個 .md 檔案
 *   2. 每個檔案有合法的 YAML frontmatter
 *   3. frontmatter.name 與 registry.js stages 中的 agent name 一一對應
 *   4. frontmatter.model 與 registry.js agentModels 一致
 *   5. frontmatter.permissionMode === 'bypassPermissions'
 *   6. 唯讀型 agent 的 tools 不含 Write/Edit
 *   7. 每個檔案包含 DO 和 DON'T 區塊
 *   8. 每個檔案包含 HANDOFF 區塊
 */

const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');
const { stages, agentModels } = require('./lib/registry');

const AGENTS_DIR = join(__dirname, '..', 'agents');

// 唯讀型 agent（不應有 Write/Edit 工具）
const READ_ONLY_AGENTS = ['planner', 'architect', 'designer', 'code-reviewer', 'debugger'];

let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`  ❌ ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`  ⚠️  ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`  ✅ ${msg}`);
}

// ── 1. 檢查檔案數量 ──

console.log('\n🔍 驗證 Agent 檔案...\n');

const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
const expectedAgents = Object.values(stages).map((s) => s.agent);

console.log(`📂 找到 ${files.length} 個 .md 檔案（預期 ${expectedAgents.length} 個）`);

if (files.length !== expectedAgents.length) {
  error(`檔案數量不符：找到 ${files.length}，預期 ${expectedAgents.length}`);
}

// ── 2-8. 逐檔驗證 ──

const foundAgents = new Set();

for (const file of files) {
  console.log(`\n📄 ${file}`);

  const content = readFileSync(join(AGENTS_DIR, file), 'utf8');

  // 解析 frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    error('缺少 YAML frontmatter');
    continue;
  }

  const frontmatter = {};
  let lastArrayKey = null;
  for (const line of fmMatch[1].split('\n')) {
    // 偵測陣列開始（key 後面無 value）
    const arrayStartMatch = line.match(/^(\w[\w-]*):\s*$/);
    if (arrayStartMatch) {
      lastArrayKey = arrayStartMatch[1];
      frontmatter[lastArrayKey] = [];
      continue;
    }

    // 處理多行陣列項目
    const arrayItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayItemMatch && lastArrayKey) {
      frontmatter[lastArrayKey].push(arrayItemMatch[1].trim());
      continue;
    }

    // 簡單的 key: value 解析
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kvMatch) {
      frontmatter[kvMatch[1]] = kvMatch[2].trim();
      lastArrayKey = null;
    }
  }

  // 2. name 存在
  const name = frontmatter.name;
  if (!name) {
    error('frontmatter 缺少 name 欄位');
    continue;
  }

  foundAgents.add(name);

  // 3. name 與 registry 一致
  if (!expectedAgents.includes(name)) {
    error(`name "${name}" 不在 registry.js 的 agent 清單中`);
  } else {
    ok(`name: ${name}`);
  }

  // 4. model 與 agentModels 一致
  const expectedModel = agentModels[name];
  if (frontmatter.model !== expectedModel) {
    error(`model 不符：${frontmatter.model}（預期 ${expectedModel}）`);
  } else {
    ok(`model: ${frontmatter.model}`);
  }

  // 5. permissionMode
  if (frontmatter.permissionMode !== 'bypassPermissions') {
    error(`permissionMode 應為 bypassPermissions，實際為 ${frontmatter.permissionMode}`);
  } else {
    ok('permissionMode: bypassPermissions');
  }

  // 6. 唯讀型 agent 的 tools 檢查
  if (READ_ONLY_AGENTS.includes(name)) {
    const tools = frontmatter.tools;
    if (tools) {
      const toolList = Array.isArray(tools) ? tools : tools.split(',').map((t) => t.trim());
      const hasWrite = toolList.some((t) =>
        t.toLowerCase().includes('write') || t.toLowerCase().includes('edit')
      );
      if (hasWrite) {
        error(`唯讀型 agent "${name}" 不應有 Write/Edit 工具`);
      } else {
        ok('唯讀工具限制正確');
      }
    } else {
      warn(`唯讀型 agent "${name}" 未明確指定 tools（繼承全部工具）`);
    }
  }

  // 7. DO / DON'T 區塊
  if (content.includes('## DO')) {
    ok('包含 DO 區塊');
  } else {
    error('缺少 DO 區塊');
  }

  if (content.includes("## DON'T") || content.includes('## DONT')) {
    ok("包含 DON'T 區塊");
  } else {
    error("缺少 DON'T 區塊");
  }

  // 8. HANDOFF 區塊
  if (content.includes('HANDOFF')) {
    ok('包含 HANDOFF 區塊');
  } else {
    error('缺少 HANDOFF 區塊');
  }
}

// ── 交叉驗證：所有 registry agent 都有對應檔案 ──

console.log('\n🔗 交叉驗證...');

for (const agent of expectedAgents) {
  if (!foundAgents.has(agent)) {
    error(`registry 中的 agent "${agent}" 沒有對應的 .md 檔案`);
  }
}

for (const agent of foundAgents) {
  if (!expectedAgents.includes(agent)) {
    error(`agents/ 中的 "${agent}" 不在 registry 中`);
  }
}

if (foundAgents.size === expectedAgents.length) {
  ok(`所有 ${expectedAgents.length} 個 agent 都有對應檔案`);
}

// ── 結果 ──

console.log('\n' + '─'.repeat(40));
if (errors === 0) {
  console.log(`\n🎉 驗證通過！${files.length} 個 agent 檔案全部正確。`);
  if (warnings > 0) {
    console.log(`⚠️  ${warnings} 個警告。`);
  }
} else {
  console.log(`\n💥 驗證失敗：${errors} 個錯誤，${warnings} 個警告。`);
  process.exit(1);
}
