// tests/helpers/counts.js
// 動態取得系統元件數量，避免測試中硬編碼數字。
// 所有數量從 registry.js 或目錄掃描取得（Single Source of Truth）。

'use strict';

const fs = require('fs');
const { join } = require('path');
const { PLUGIN_ROOT, SCRIPTS_LIB, SCRIPTS_DIR } = require('./paths');

const registry = require(join(SCRIPTS_LIB, 'registry'));

// ── 從 registry 取得 ──

const WORKFLOW_COUNT = Object.keys(registry.workflows).length;
const STAGE_COUNT = Object.keys(registry.stages).length;
const TIMELINE_EVENT_COUNT = Object.keys(registry.timelineEvents).length;
const TIMELINE_CATEGORY_COUNT = new Set(
  Object.values(registry.timelineEvents).map(e => e.category),
).size;

// ── 從目錄掃描取得 ──

const AGENT_COUNT = fs.readdirSync(join(PLUGIN_ROOT, 'agents'))
  .filter(f => f.endsWith('.md')).length;

const SKILL_COUNT = fs.readdirSync(join(PLUGIN_ROOT, 'skills'))
  .filter(d => fs.existsSync(join(PLUGIN_ROOT, 'skills', d, 'SKILL.md'))).length;

const COMMAND_COUNT = fs.readdirSync(join(PLUGIN_ROOT, 'commands'))
  .filter(f => f.endsWith('.md')).length;

const HOOK_COUNT = (() => {
  try {
    const hooksJson = JSON.parse(
      fs.readFileSync(join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf8'),
    );
    return Object.keys(hooksJson.hooks).length;
  } catch {
    return 0;
  }
})();

// ── 從 health-check checkDefs 取得（不執行 runAllChecks）──

const { CHECK_COUNT: HEALTH_CHECK_COUNT } = require(join(SCRIPTS_DIR, 'health-check'));

module.exports = {
  AGENT_COUNT,
  SKILL_COUNT,
  COMMAND_COUNT,
  HOOK_COUNT,
  STAGE_COUNT,
  WORKFLOW_COUNT,
  TIMELINE_EVENT_COUNT,
  TIMELINE_CATEGORY_COUNT,
  HEALTH_CHECK_COUNT,
};
