'use strict';
/**
 * config-api.js — Overtone Config API
 *
 * 統一管理 agent/hook/skill 三大元件的驗證與 CRUD。
 *
 * L1 驗證層：validateAgent, validateHook, validateSkill, validateAll
 * L2 結構化 API：createAgent, updateAgent, createHook, updateHook, createSkill, updateSkill
 */

const { existsSync, readFileSync, mkdirSync } = require('fs');
const { join } = require('path');
const matter = require('gray-matter');
const { atomicWrite } = require('./utils');
const { knownTools, hookEvents } = require('./registry');

// ── 內部常數 ──

const VALID_MODELS = ['opus', 'opusplan', 'sonnet', 'haiku'];

// ── 內部輔助函式 ──

/**
 * 建立空的 ValidationResult
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function makeResult() {
  return { valid: true, errors: [], warnings: [] };
}

/**
 * 加入錯誤，並將 valid 設為 false
 * @param {object} result
 * @param {string} msg
 */
function addError(result, msg) {
  result.errors.push(msg);
  result.valid = false;
}

/**
 * 加入警告（不影響 valid）
 * @param {object} result
 * @param {string} msg
 */
function addWarning(result, msg) {
  result.warnings.push(msg);
}

/**
 * 解析 ${CLAUDE_PLUGIN_ROOT} 占位符，替換為實際 pluginRoot
 * @param {string} command
 * @param {string} pluginRoot
 * @returns {string}
 */
function resolveCommand(command, pluginRoot) {
  return command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot);
}

/**
 * 讀取並解析 agent .md frontmatter（用 gray-matter 預設 engine）
 * @param {string} agentPath
 * @returns {{ frontmatter: object, content: string, rawContent: string }}
 */
function readAgentFile(agentPath) {
  const rawContent = readFileSync(agentPath, 'utf8');
  const parsed = matter(rawContent);
  return { frontmatter: parsed.data, content: parsed.content, rawContent };
}

/**
 * 讀取並解析 skill SKILL.md frontmatter
 * @param {string} skillPath
 * @returns {{ frontmatter: object, content: string, rawContent: string }}
 */
function readSkillFile(skillPath) {
  const rawContent = readFileSync(skillPath, 'utf8');
  const parsed = matter(rawContent);
  return { frontmatter: parsed.data, content: parsed.content, rawContent };
}

/**
 * 讀取 hooks.json
 * @param {string} pluginRoot
 * @returns {{ hooks: object[] }}
 */
function readHooksJson(pluginRoot) {
  const hooksPath = join(pluginRoot, 'hooks', 'hooks.json');
  if (!existsSync(hooksPath)) return { hooks: [] };
  return JSON.parse(readFileSync(hooksPath, 'utf8'));
}

/**
 * 讀取 registry-data.json
 * @param {string} pluginRoot
 * @returns {{ stages: object, agentModels: object }}
 */
function readRegistryData(pluginRoot) {
  const dataPath = join(pluginRoot, 'scripts', 'lib', 'registry-data.json');
  return JSON.parse(readFileSync(dataPath, 'utf8'));
}

/**
 * 寫入 registry-data.json（atomicWrite）
 * @param {string} pluginRoot
 * @param {object} data
 */
function writeRegistryData(pluginRoot, data) {
  const dataPath = join(pluginRoot, 'scripts', 'lib', 'registry-data.json');
  atomicWrite(dataPath, data);
}

/**
 * 讀取 plugin.json
 * @param {string} pluginRoot
 * @returns {object}
 */
function readPluginJson(pluginRoot) {
  const pluginPath = join(pluginRoot, '.claude-plugin', 'plugin.json');
  return JSON.parse(readFileSync(pluginPath, 'utf8'));
}

/**
 * 寫入 plugin.json（atomicWrite）
 * @param {string} pluginRoot
 * @param {object} data
 */
function writePluginJson(pluginRoot, data) {
  const pluginPath = join(pluginRoot, '.claude-plugin', 'plugin.json');
  atomicWrite(pluginPath, data);
}

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
  lines.push(`color: ${fm.color}`);
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

// ── L1 驗證層 ──

/**
 * 驗證 agent frontmatter 欄位（內部，可傳入已解析的 frontmatter）
 * @param {object} frontmatter
 * @param {string} pluginRoot
 * @returns {object} ValidationResult
 */
function validateAgentFrontmatter(frontmatter, pluginRoot) {
  const result = makeResult();

  // 必填欄位檢查
  const requiredFields = ['name', 'description', 'model', 'permissionMode', 'color', 'maxTurns'];
  for (const field of requiredFields) {
    if (frontmatter[field] === undefined || frontmatter[field] === null || frontmatter[field] === '') {
      addError(result, `缺少必填欄位：${field}`);
    }
  }

  if (!result.valid) return result;

  // model 值域檢查
  if (!VALID_MODELS.includes(frontmatter.model)) {
    addError(result, `model 值不合法：${frontmatter.model}（合法值：${VALID_MODELS.join(', ')}）`);
  }

  // permissionMode 固定值檢查
  if (frontmatter.permissionMode !== 'bypassPermissions') {
    addError(result, `permissionMode 必須為 bypassPermissions（實際值：${frontmatter.permissionMode}）`);
  }

  // maxTurns 必須是正整數
  const maxTurns = frontmatter.maxTurns;
  if (typeof maxTurns !== 'number' || !Number.isInteger(maxTurns) || maxTurns <= 0) {
    addError(result, `maxTurns 必須是正整數（實際值：${maxTurns}）`);
  }

  // disallowedTools 和 tools 互斥檢查 + 工具名稱值域
  if (frontmatter.disallowedTools && frontmatter.tools) {
    addError(result, 'disallowedTools 和 tools 不可同時設定（互斥）');
  }

  const toolsToCheck = frontmatter.disallowedTools || frontmatter.tools || [];
  for (const tool of toolsToCheck) {
    if (!knownTools.includes(tool)) {
      addWarning(result, `未知的工具名稱：${tool}`);
    }
  }

  // skills 引用存在性檢查
  if (frontmatter.skills && frontmatter.skills.length > 0) {
    for (const skill of frontmatter.skills) {
      const skillPath = join(pluginRoot, 'skills', skill, 'SKILL.md');
      if (!existsSync(skillPath)) {
        addError(result, `引用的 skill 不存在：${skill}`);
      }
    }
  }

  return result;
}

/**
 * 驗證單一 agent 設定的正確性
 * @param {string} name - agent 名稱（如 'developer'）
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateAgent(name, pluginRoot) {
  const result = makeResult();
  const agentPath = join(pluginRoot, 'agents', `${name}.md`);

  if (!existsSync(agentPath)) {
    addError(result, `Agent "${name}" 的 .md 檔案不存在：${agentPath}`);
    return result;
  }

  let frontmatter;
  try {
    ({ frontmatter } = readAgentFile(agentPath));
  } catch (e) {
    addError(result, `無法讀取 agent 檔案：${e.message}`);
    return result;
  }

  const fmResult = validateAgentFrontmatter(frontmatter, pluginRoot);
  result.errors.push(...fmResult.errors);
  result.warnings.push(...fmResult.warnings);
  if (!fmResult.valid) result.valid = false;

  return result;
}

/**
 * 驗證 skill frontmatter 欄位（內部）
 * @param {object} frontmatter
 * @returns {object} ValidationResult
 */
function validateSkillFrontmatter(frontmatter) {
  const result = makeResult();

  // 必填欄位
  if (!frontmatter.name) {
    addError(result, '缺少必填欄位：name');
  }
  if (!frontmatter.description) {
    addError(result, '缺少必填欄位：description');
  }

  // disable-model-invocation 必須是 boolean
  if (frontmatter['disable-model-invocation'] !== undefined) {
    if (typeof frontmatter['disable-model-invocation'] !== 'boolean') {
      addError(result, `disable-model-invocation 必須是 boolean（實際值：${frontmatter['disable-model-invocation']}）`);
    }
  }

  // user-invocable 必須是 boolean
  if (frontmatter['user-invocable'] !== undefined) {
    if (typeof frontmatter['user-invocable'] !== 'boolean') {
      addError(result, `user-invocable 必須是 boolean（實際值：${frontmatter['user-invocable']}）`);
    }
  }

  return result;
}

/**
 * 驗證單一 skill 設定的正確性
 * @param {string} name - skill 名稱（如 'auto'）
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateSkill(name, pluginRoot) {
  const result = makeResult();
  const skillPath = join(pluginRoot, 'skills', name, 'SKILL.md');

  if (!existsSync(skillPath)) {
    addError(result, `Skill "${name}" 的 SKILL.md 不存在：${skillPath}`);
    return result;
  }

  let frontmatter;
  try {
    ({ frontmatter } = readSkillFile(skillPath));
  } catch (e) {
    addError(result, `無法讀取 skill 檔案：${e.message}`);
    return result;
  }

  const fmResult = validateSkillFrontmatter(frontmatter);
  result.errors.push(...fmResult.errors);
  result.warnings.push(...fmResult.warnings);
  if (!fmResult.valid) result.valid = false;

  return result;
}

/**
 * 驗證單一 hook event 設定的正確性
 * @param {string} event - hook event 名稱（如 'SessionStart'）
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateHook(event, pluginRoot) {
  const result = makeResult();

  // event 必須在合法列表中
  if (!hookEvents.includes(event)) {
    addError(result, `hook event "${event}" 不在合法列表中（合法值：${hookEvents.join(', ')}）`);
    return result;
  }

  let hooksData;
  try {
    hooksData = readHooksJson(pluginRoot);
  } catch (e) {
    addError(result, `無法讀取 hooks.json：${e.message}`);
    return result;
  }

  const hookEntry = hooksData.hooks.find((h) => h.event === event);
  if (!hookEntry) {
    addError(result, `hooks.json 中不存在 "${event}" 的條目`);
    return result;
  }

  // type 必須是 'command'
  if (hookEntry.type !== 'command') {
    addError(result, `hook type 必須是 command（實際值：${hookEntry.type}）`);
  }

  // command 腳本必須存在
  if (!hookEntry.command) {
    addError(result, '缺少必填欄位：command');
  } else {
    const resolvedCmd = resolveCommand(hookEntry.command, pluginRoot);
    if (!existsSync(resolvedCmd)) {
      addError(result, `command 指向的腳本不存在：${hookEntry.command}`);
    }
  }

  return result;
}

/**
 * 跨元件交叉一致性驗證
 * @param {string} pluginRoot - plugin 根目錄路徑
 * @returns {{ valid: boolean, agents: object, hooks: object, skills: object, cross: object }}
 */
function validateAll(pluginRoot) {
  const agentsDir = join(pluginRoot, 'agents');
  const skillsDir = join(pluginRoot, 'skills');

  const agentResults = {};
  const hookResults = {};
  const skillResults = {};
  const crossResult = makeResult();

  let allValid = true;

  // 掃描所有 agent .md 檔案
  let agentFiles = [];
  try {
    const { readdirSync } = require('fs');
    agentFiles = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
  } catch (e) {
    addError(crossResult, `無法讀取 agents 目錄：${e.message}`);
    allValid = false;
  }

  for (const file of agentFiles) {
    const name = file.replace(/\.md$/, '');
    const r = validateAgent(name, pluginRoot);
    agentResults[name] = r;
    if (!r.valid) allValid = false;
  }

  // 掃描所有 hook events
  let hooksData = { hooks: [] };
  try {
    hooksData = readHooksJson(pluginRoot);
  } catch (e) {
    addError(crossResult, `無法讀取 hooks.json：${e.message}`);
    allValid = false;
  }

  const seenHookEvents = new Set();
  for (const hookEntry of hooksData.hooks) {
    const event = hookEntry.event;
    if (!seenHookEvents.has(event)) {
      seenHookEvents.add(event);
      const r = validateHook(event, pluginRoot);
      hookResults[event] = r;
      if (!r.valid) allValid = false;
    }
  }

  // 掃描所有 skill 目錄
  let skillDirs = [];
  try {
    const { readdirSync } = require('fs');
    skillDirs = readdirSync(skillsDir).filter((name) => {
      const skillPath = join(skillsDir, name, 'SKILL.md');
      return existsSync(skillPath);
    });
  } catch (e) {
    addError(crossResult, `無法讀取 skills 目錄：${e.message}`);
    allValid = false;
  }

  for (const skillName of skillDirs) {
    const r = validateSkill(skillName, pluginRoot);
    skillResults[skillName] = r;
    if (!r.valid) allValid = false;
  }

  // 交叉驗證：registry-data.json 中的 stage agent 必須有對應的 .md 檔案
  // grader 是特例，不在 stages 中，不應產生錯誤
  let registryData;
  try {
    registryData = readRegistryData(pluginRoot);
  } catch (e) {
    addError(crossResult, `無法讀取 registry-data.json：${e.message}`);
    allValid = false;
    registryData = null;
  }

  if (registryData) {
    for (const [stageKey, stageDef] of Object.entries(registryData.stages)) {
      const agentName = stageDef.agent;
      const agentPath = join(pluginRoot, 'agents', `${agentName}.md`);
      if (!existsSync(agentPath)) {
        addError(crossResult, `Stage "${stageKey}" 的 agent "${agentName}" 不存在（缺少 agents/${agentName}.md）`);
        allValid = false;
      }
    }
  }

  return {
    valid: allValid,
    agents: agentResults,
    hooks: hookResults,
    skills: skillResults,
    cross: crossResult,
  };
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
  const frontmatterUpdateKeys = ['description', 'model', 'color', 'maxTurns', 'disallowedTools', 'tools', 'skills'];
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

  // 若 model 有變更，同步更新 registry-data.json
  if (updates.model !== undefined && updates.model !== existingFrontmatter.model) {
    const registryData = readRegistryData(pluginRoot);
    registryData.agentModels[name] = updates.model;
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

  // 讀取現有 hooks.json
  const hooksPath = join(pluginRoot, 'hooks', 'hooks.json');
  let hooksData;
  try {
    hooksData = readHooksJson(pluginRoot);
  } catch (e) {
    return { success: false, errors: [`無法讀取 hooks.json：${e.message}`] };
  }

  // 建立新條目
  const newEntry = {
    event: opts.event,
    type: 'command',
    command: opts.command,
  };
  if (opts.matcher !== undefined) {
    newEntry.matcher = opts.matcher;
  }

  hooksData.hooks.push(newEntry);
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

  const hookIndex = hooksData.hooks.findIndex((h) => h.event === event);
  if (hookIndex === -1) {
    return { success: false, errors: [`hooks.json 中不存在 "${event}" 的條目`] };
  }

  const hookEntry = { ...hooksData.hooks[hookIndex] };

  // 驗證新 command 路徑（若有提供）
  if (updates.command !== undefined) {
    const resolvedCmd = resolveCommand(updates.command, pluginRoot);
    if (!existsSync(resolvedCmd)) {
      return { success: false, errors: [`command 指向的腳本不存在：${updates.command}`] };
    }
    hookEntry.command = updates.command;
  }

  // 更新 matcher（null 表示移除）
  if (updates.matcher !== undefined) {
    if (updates.matcher === null) {
      delete hookEntry.matcher;
    } else {
      hookEntry.matcher = updates.matcher;
    }
  }

  hooksData.hooks[hookIndex] = hookEntry;
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

// ── 模組匯出 ──

module.exports = {
  // L1 驗證層
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
};
