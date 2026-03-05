'use strict';
/**
 * config-api.js — Overtone Config API（L2 CRUD 層）
 *
 * 統一管理 agent/hook/skill 三大元件的 CRUD 操作。
 * L1 驗證層已提取至 config-validator.js。
 * IO 輔助已提取至 config-io.js。
 *
 * L2 結構化 API：createAgent, updateAgent, createHook, updateHook, createSkill, updateSkill, bumpVersion
 *
 * 向後相容：validateAgent, validateHook, validateSkill, validateAll 仍從此模組 re-export。
 */

const { existsSync, chmodSync } = require('fs');
const { join } = require('path');
const { atomicWrite } = require('./utils');
const { hookEvents } = require('./registry');
const {
  resolveCommand,
  readAgentFile,
  readSkillFile,
  readHooksJson,
  readRegistryData,
  writeRegistryData,
  readPluginJson,
  writePluginJson,
} = require('./config-io');
const {
  validateAgent,
  validateHook,
  validateSkill,
  validateAll,
  validateAgentFrontmatter,
  validateSkillFrontmatter,
} = require('./config-validator');

// ── 生成 frontmatter 輔助函式 ──

/**
 * 生成 agent .md 的 frontmatter 字串（YAML block sequence 格式）
 * @param {object} fm - frontmatter 欄位
 * @returns {string} 完整 frontmatter 區塊（含 --- 標記）
 */
function buildAgentFrontmatter(fm) {
  const lines = ['---'];
  lines.push(`name: ${fm.name}`);
  lines.push(`description: ${fm.description}`);
  lines.push(`model: ${fm.model}`);
  lines.push(`permissionMode: bypassPermissions`);
  // hex color 需要引號，避免 YAML 將 # 視為注釋
  const colorVal = typeof fm.color === 'string' && fm.color.startsWith('#')
    ? `'${fm.color}'`
    : fm.color;
  lines.push(`color: ${colorVal}`);
  lines.push(`maxTurns: ${fm.maxTurns}`);

  if (fm.disallowedTools && fm.disallowedTools.length > 0) {
    lines.push('disallowedTools:');
    for (const tool of fm.disallowedTools) {
      lines.push(`  - ${tool}`);
    }
  }

  if (fm.tools && fm.tools.length > 0) {
    lines.push('tools:');
    for (const tool of fm.tools) {
      lines.push(`  - ${tool}`);
    }
  }

  if (fm.memory) {
    lines.push(`memory: ${fm.memory}`);
  }

  if (fm.skills && fm.skills.length > 0) {
    lines.push('skills:');
    for (const skill of fm.skills) {
      lines.push(`  - ${skill}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * 生成 skill SKILL.md 的 frontmatter 字串
 * @param {object} fm - frontmatter 欄位
 * @returns {string} 完整 frontmatter 區塊（含 --- 標記）
 */
function buildSkillFrontmatter(fm) {
  const lines = ['---'];
  lines.push(`name: ${fm.name}`);
  lines.push(`description: ${fm.description}`);

  if (fm['disable-model-invocation'] !== undefined) {
    lines.push(`disable-model-invocation: ${fm['disable-model-invocation']}`);
  }

  if (fm['user-invocable'] !== undefined) {
    lines.push(`user-invocable: ${fm['user-invocable']}`);
  }

  lines.push('---');
  return lines.join('\n');
}

// ── L2 結構化 API ──

/**
 * 建立新 agent
 * @param {object} opts - CreateAgentOpts
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {{ success: boolean, errors: string[], path?: string }}
 */
function createAgent(opts, pluginRoot) {
  const errors = [];
  const agentPath = join(pluginRoot, 'agents', `${opts.name}.md`);

  // 前置檢查：name 不能已存在
  if (existsSync(agentPath)) {
    return { success: false, errors: [`Agent "${opts.name}" 已存在：${agentPath}`] };
  }

  // 必填欄位驗證
  const requiredOpts = ['name', 'description', 'model', 'color', 'stage', 'emoji', 'label', 'maxTurns', 'body'];
  for (const field of requiredOpts) {
    if (opts[field] === undefined || opts[field] === null || opts[field] === '') {
      errors.push(`缺少必填欄位：${field}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // 驗證 frontmatter 欄位
  const fmToValidate = {
    name: opts.name,
    description: opts.description,
    model: opts.model,
    permissionMode: 'bypassPermissions',
    color: opts.color,
    maxTurns: opts.maxTurns,
    disallowedTools: opts.disallowedTools,
    tools: opts.tools,
    skills: opts.skills,
  };

  const fmResult = validateAgentFrontmatter(fmToValidate, pluginRoot);
  if (!fmResult.valid) {
    return { success: false, errors: fmResult.errors };
  }
  // warnings 不阻擋建立

  // 生成 agent .md 內容
  const frontmatterStr = buildAgentFrontmatter(fmToValidate);
  const fileContent = `${frontmatterStr}\n\n${opts.body}`;

  // 原子寫入 agent .md
  atomicWrite(agentPath, fileContent);

  // 更新 registry-data.json
  const registryData = readRegistryData(pluginRoot);
  registryData.stages[opts.stage] = {
    label: opts.label,
    emoji: opts.emoji,
    agent: opts.name,
    color: opts.color,
  };
  registryData.agentModels[opts.name] = opts.model;
  writeRegistryData(pluginRoot, registryData);

  // 更新 plugin.json（在末尾插入新 agent 路徑）
  const pluginJson = readPluginJson(pluginRoot);
  if (!pluginJson.agents.includes(`./agents/${opts.name}.md`)) {
    pluginJson.agents.push(`./agents/${opts.name}.md`);
  }
  writePluginJson(pluginRoot, pluginJson);

  return { success: true, errors: [], path: agentPath };
}

/**
 * 更新現有 agent
 * @param {string} name - agent 名稱
 * @param {object} updates - UpdateAgentOpts（partial）
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {{ success: boolean, errors: string[], path?: string }}
 */
function updateAgent(name, updates, pluginRoot) {
  const agentPath = join(pluginRoot, 'agents', `${name}.md`);

  if (!existsSync(agentPath)) {
    return { success: false, errors: [`Agent "${name}" 不存在：${agentPath}`] };
  }

  let existingFrontmatter, existingContent;
  try {
    ({ frontmatter: existingFrontmatter, content: existingContent } = readAgentFile(agentPath));
  } catch (e) {
    return { success: false, errors: [`無法讀取 agent 檔案：${e.message}`] };
  }

  // 合併 updates 到 frontmatter（只更新提供的欄位）
  const mergedFrontmatter = { ...existingFrontmatter };
  const frontmatterUpdateKeys = ['description', 'model', 'color', 'maxTurns', 'memory', 'disallowedTools', 'tools', 'skills'];
  for (const key of frontmatterUpdateKeys) {
    if (updates[key] !== undefined) {
      mergedFrontmatter[key] = updates[key];
    }
  }

  // 驗證合併後結果
  const fmResult = validateAgentFrontmatter(mergedFrontmatter, pluginRoot);
  if (!fmResult.valid) {
    return { success: false, errors: fmResult.errors };
  }

  // 決定 body 內容
  const newBody = updates.body !== undefined ? updates.body : existingContent.trimStart();

  // 生成新的檔案內容
  const frontmatterStr = buildAgentFrontmatter(mergedFrontmatter);
  const fileContent = `${frontmatterStr}\n\n${newBody}`;

  // 原子寫入
  atomicWrite(agentPath, fileContent);

  // 若 model 或 memory 有變更，同步更新 registry-data.json
  const modelChanged = updates.model !== undefined && updates.model !== existingFrontmatter.model;
  const memoryChanged = updates.memory !== undefined && updates.memory !== existingFrontmatter.memory;
  if (modelChanged || memoryChanged) {
    const registryData = readRegistryData(pluginRoot);
    if (modelChanged) {
      registryData.agentModels[name] = updates.model;
    }
    if (memoryChanged) {
      if (updates.memory === null || updates.memory === '') {
        // memory 被移除，從 agentMemory 中刪除該 agent
        delete registryData.agentMemory[name];
      } else {
        registryData.agentMemory[name] = updates.memory;
      }
    }
    writeRegistryData(pluginRoot, registryData);
  }

  return { success: true, errors: [], path: agentPath };
}

/**
 * 建立新 hook 條目（追加到 hooks.json）
 * @param {object} opts - CreateHookOpts
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {{ success: boolean, errors: string[] }}
 */
function createHook(opts, pluginRoot) {
  const errors = [];

  // event 合法性檢查
  if (!hookEvents.includes(opts.event)) {
    errors.push(`hook event "${opts.event}" 不在合法列表中（合法值：${hookEvents.join(', ')}）`);
    return { success: false, errors };
  }

  // command 必須存在且腳本存在
  if (!opts.command) {
    errors.push('缺少必填欄位：command');
    return { success: false, errors };
  }

  const resolvedCmd = resolveCommand(opts.command, pluginRoot);
  if (!existsSync(resolvedCmd)) {
    errors.push(`command 指向的腳本不存在：${opts.command}`);
    return { success: false, errors };
  }

  // 確保腳本有執行權限
  try { chmodSync(resolvedCmd, 0o755); } catch { /* 靜默忽略 */ }

  // 讀取現有 hooks.json
  const hooksPath = join(pluginRoot, 'hooks', 'hooks.json');
  let hooksData;
  try {
    hooksData = readHooksJson(pluginRoot);
  } catch (e) {
    return { success: false, errors: [`無法讀取 hooks.json：${e.message}`] };
  }

  // 建立新條目（官方三層嵌套格式）
  const handler = { type: 'command', command: opts.command };
  const matcherGroup = { hooks: [handler] };
  if (opts.matcher !== undefined) {
    matcherGroup.matcher = opts.matcher;
  }

  if (!hooksData.hooks[opts.event]) {
    hooksData.hooks[opts.event] = [];
  }
  hooksData.hooks[opts.event].push(matcherGroup);
  atomicWrite(hooksPath, hooksData);

  return { success: true, errors: [] };
}

/**
 * 更新現有 hook 條目
 * @param {string} event - hook event 名稱
 * @param {object} updates - UpdateHookOpts
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {{ success: boolean, errors: string[] }}
 */
function updateHook(event, updates, pluginRoot) {
  const hooksPath = join(pluginRoot, 'hooks', 'hooks.json');

  let hooksData;
  try {
    hooksData = readHooksJson(pluginRoot);
  } catch (e) {
    return { success: false, errors: [`無法讀取 hooks.json：${e.message}`] };
  }

  const matcherGroups = hooksData.hooks[event];
  if (!matcherGroups || !Array.isArray(matcherGroups) || matcherGroups.length === 0) {
    return { success: false, errors: [`hooks.json 中不存在 "${event}" 的條目`] };
  }

  const group = matcherGroups[0];
  if (!group.hooks || group.hooks.length === 0) {
    return { success: false, errors: [`hooks.json 中 "${event}" 缺少 handler`] };
  }

  const handler = { ...group.hooks[0] };

  // 驗證新 command 路徑（若有提供）
  if (updates.command !== undefined) {
    const resolvedCmd = resolveCommand(updates.command, pluginRoot);
    if (!existsSync(resolvedCmd)) {
      return { success: false, errors: [`command 指向的腳本不存在：${updates.command}`] };
    }
    handler.command = updates.command;
  }

  // 更新 matcher（null 表示移除，操作在 group 層級）
  if (updates.matcher !== undefined) {
    if (updates.matcher === null) {
      delete group.matcher;
    } else {
      group.matcher = updates.matcher;
    }
  }

  group.hooks[0] = handler;
  atomicWrite(hooksPath, hooksData);

  return { success: true, errors: [] };
}

/**
 * 建立新 skill（建立目錄 + SKILL.md）
 * @param {object} opts - CreateSkillOpts
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {{ success: boolean, errors: string[], path?: string }}
 */
function createSkill(opts, pluginRoot) {
  const errors = [];

  // 必填欄位驗證
  if (!opts.name) {
    errors.push('缺少必填欄位：name');
  }
  if (!opts.description) {
    errors.push('缺少必填欄位：description');
  }
  if (errors.length > 0) {
    return { success: false, errors };
  }

  const skillPath = join(pluginRoot, 'skills', opts.name, 'SKILL.md');

  // 名稱不能已存在
  if (existsSync(skillPath)) {
    return { success: false, errors: [`Skill "${opts.name}" 已存在：${skillPath}`] };
  }

  // 驗證可選欄位
  const fmToValidate = {
    name: opts.name,
    description: opts.description,
    'disable-model-invocation': opts['disable-model-invocation'],
    'user-invocable': opts['user-invocable'],
  };

  const fmResult = validateSkillFrontmatter(fmToValidate);
  if (!fmResult.valid) {
    return { success: false, errors: fmResult.errors };
  }

  // 生成 SKILL.md 內容
  const frontmatterStr = buildSkillFrontmatter(fmToValidate);
  const fileContent = `${frontmatterStr}\n\n${opts.body || ''}`;

  // 建立目錄並寫入（atomicWrite 自動建立父目錄）
  atomicWrite(skillPath, fileContent);

  return { success: true, errors: [], path: skillPath };
}

/**
 * 更新現有 skill
 * @param {string} name - skill 名稱
 * @param {object} updates - UpdateSkillOpts
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {{ success: boolean, errors: string[], path?: string }}
 */
function updateSkill(name, updates, pluginRoot) {
  const skillPath = join(pluginRoot, 'skills', name, 'SKILL.md');

  if (!existsSync(skillPath)) {
    return { success: false, errors: [`Skill "${name}" 不存在：${skillPath}`] };
  }

  let existingFrontmatter, existingContent;
  try {
    ({ frontmatter: existingFrontmatter, content: existingContent } = readSkillFile(skillPath));
  } catch (e) {
    return { success: false, errors: [`無法讀取 skill 檔案：${e.message}`] };
  }

  // 合併 updates（只更新提供的欄位）
  const mergedFrontmatter = { ...existingFrontmatter };
  const skillUpdateKeys = ['description', 'disable-model-invocation', 'user-invocable'];
  for (const key of skillUpdateKeys) {
    if (updates[key] !== undefined) {
      mergedFrontmatter[key] = updates[key];
    }
  }

  // 驗證合併後結果
  const fmResult = validateSkillFrontmatter(mergedFrontmatter);
  if (!fmResult.valid) {
    return { success: false, errors: fmResult.errors };
  }

  // 決定 body 內容
  const newBody = updates.body !== undefined ? updates.body : existingContent.trimStart();

  // 生成新的檔案內容
  const frontmatterStr = buildSkillFrontmatter(mergedFrontmatter);
  const fileContent = `${frontmatterStr}\n\n${newBody}`;

  atomicWrite(skillPath, fileContent);

  return { success: true, errors: [], path: skillPath };
}

// ── 版本管理 ──

/**
 * 更新 plugin.json 的版本號。
 *
 * @param {string} [version] - 指定版本號。若未提供則自動 patch +1
 * @param {string} pluginRoot - plugin 根目錄
 * @returns {{ success: boolean, errors: string[], oldVersion: string, newVersion: string }}
 */
function bumpVersion(version, pluginRoot) {
  const pluginJson = readPluginJson(pluginRoot);
  const oldVersion = pluginJson.version || '0.0.0';

  let newVersion;
  if (version) {
    // 驗證 semver 格式
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return { success: false, errors: [`版本號格式不合法：${version}（需要 x.y.z）`], oldVersion, newVersion: null };
    }
    newVersion = version;
  } else {
    // 自動 patch +1
    const parts = oldVersion.split('.').map(Number);
    parts[2] += 1;
    newVersion = parts.join('.');
  }

  pluginJson.version = newVersion;
  writePluginJson(pluginRoot, pluginJson);

  return { success: true, errors: [], oldVersion, newVersion };
}

// ── 模組匯出 ──

module.exports = {
  // L1 驗證層（re-export from config-validator.js，向後相容）
  validateAgent,
  validateHook,
  validateSkill,
  validateAll,

  // L2 結構化 API
  createAgent,
  updateAgent,
  createHook,
  updateHook,
  createSkill,
  updateSkill,

  // 版本管理
  bumpVersion,
};
