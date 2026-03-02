#!/usr/bin/env node
'use strict';
/**
 * manage-component.js — 元件管理 CLI
 *
 * 統一的 agent/hook/skill 建立與更新介面。
 * 底層呼叫 config-api.js 的 L2 結構化 API，確保驗證和一致性。
 *
 * 用法：
 *   bun manage-component.js <action> <type> [name] '<json>'
 *
 * Actions: create, update
 * Types:   agent, hook, skill
 *
 * 範例：
 *   # 建立 agent
 *   bun manage-component.js create agent '{
 *     "name":"my-agent", "description":"描述", "model":"sonnet",
 *     "color":"blue", "stage":"MY_STAGE", "emoji":"🎯",
 *     "label":"My Agent", "maxTurns":50, "body":"# Instructions..."
 *   }'
 *
 *   # 更新 agent
 *   bun manage-component.js update agent developer '{"model":"opus"}'
 *
 *   # 建立 hook
 *   bun manage-component.js create hook '{
 *     "event":"CustomEvent",
 *     "command":"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/custom.js"
 *   }'
 *
 *   # 更新 hook
 *   bun manage-component.js update hook SessionStart '{"command":"new-path.js"}'
 *
 *   # 建立 skill
 *   bun manage-component.js create skill '{
 *     "name":"my-skill", "description":"描述",
 *     "user-invocable":false, "body":"# Content..."
 *   }'
 *
 *   # 更新 skill
 *   bun manage-component.js update skill my-skill '{"description":"新描述"}'
 */

const { join } = require('path');
const configApi = require('./lib/config-api');

const PLUGIN_ROOT = join(__dirname, '..');

// ── 用法說明 ──

function printUsage() {
  const usage = [
    '用法：bun manage-component.js <action> <type> [name] \'<json>\'',
    '',
    'Actions:',
    '  create        — 建立新元件',
    '  update        — 更新現有元件',
    '  bump-version  — 更新版本號（預設 patch +1，或指定 x.y.z）',
    '',
    'Types:',
    '  agent   — Agent 定義（agents/*.md + registry-data.json + plugin.json）',
    '  hook    — Hook 條目（hooks/hooks.json）',
    '  skill   — Skill 定義（skills/*/SKILL.md）',
    '',
    '建立範例：',
    '  bun manage-component.js create agent \'{"name":"my-agent","description":"描述","model":"sonnet","color":"blue","stage":"MY_STAGE","emoji":"🎯","label":"My Agent","maxTurns":50,"body":"# Instructions..."}\'',
    '  bun manage-component.js create hook \'{"event":"CustomEvent","command":"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/custom.js"}\'',
    '  bun manage-component.js create skill \'{"name":"my-skill","description":"描述","user-invocable":false,"body":"# Content..."}\'',
    '',
    '更新範例：',
    '  bun manage-component.js update agent developer \'{"model":"opus"}\'',
    '  bun manage-component.js update hook SessionStart \'{"command":"new-path.js"}\'',
    '  bun manage-component.js update skill my-skill \'{"description":"新描述"}\'',
  ];
  console.log(usage.join('\n'));
}

// ── 參數解析 ──

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  printUsage();
  process.exit(0);
}

const action = args[0];
const type = args[1];

// ── bump-version 快速路徑 ──

if (action === 'bump-version') {
  const version = args[1] || null; // 可選：指定版本號
  const result = configApi.bumpVersion(version, PLUGIN_ROOT);
  if (result.success) {
    console.log(`✅ 版本更新：${result.oldVersion} → ${result.newVersion}`);
  } else {
    console.error(`❌ 版本更新失敗：${result.errors.join(', ')}`);
    process.exit(1);
  }
  process.exit(0);
}

if (!['create', 'update'].includes(action)) {
  console.error(`❌ 不合法的 action：${action}（合法值：create, update, bump-version）`);
  process.exit(1);
}

if (!['agent', 'hook', 'skill'].includes(type)) {
  console.error(`❌ 不合法的 type：${type}（合法值：agent, hook, skill）`);
  process.exit(1);
}

// ── JSON 解析 ──

let jsonArg;
let name;

if (action === 'update') {
  // update 需要 name 和 json：update <type> <name> '<json>'
  name = args[2];
  if (!name) {
    console.error('❌ update 需要指定元件名稱');
    process.exit(1);
  }
  jsonArg = args[3];
  if (!jsonArg) {
    console.error('❌ update 需要提供 JSON 更新內容');
    process.exit(1);
  }
} else {
  // create 只需要 json：create <type> '<json>'
  jsonArg = args[2];
  if (!jsonArg) {
    console.error('❌ create 需要提供 JSON 設定內容');
    process.exit(1);
  }
}

let opts;
try {
  opts = JSON.parse(jsonArg);
} catch (e) {
  console.error(`❌ JSON 解析失敗：${e.message}`);
  process.exit(1);
}

// ── 執行 ──

let result;

if (action === 'create') {
  switch (type) {
    case 'agent':
      result = configApi.createAgent(opts, PLUGIN_ROOT);
      break;
    case 'hook':
      result = configApi.createHook(opts, PLUGIN_ROOT);
      break;
    case 'skill':
      result = configApi.createSkill(opts, PLUGIN_ROOT);
      break;
  }
} else {
  // update
  switch (type) {
    case 'agent':
      result = configApi.updateAgent(name, opts, PLUGIN_ROOT);
      break;
    case 'hook':
      result = configApi.updateHook(name, opts, PLUGIN_ROOT);
      break;
    case 'skill':
      result = configApi.updateSkill(name, opts, PLUGIN_ROOT);
      break;
  }
}

// ── 輸出結果 ──

if (result.success) {
  console.log(`✅ ${action} ${type} 成功！`);
  if (result.path) {
    console.log(`   路徑：${result.path}`);
  }
  // 輸出 JSON 供程式解析
  console.log(JSON.stringify(result));
} else {
  console.error(`❌ ${action} ${type} 失敗：`);
  for (const err of result.errors) {
    console.error(`   - ${err}`);
  }
  process.exit(1);
}
