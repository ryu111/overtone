'use strict';
/**
 * config-validator.js — Overtone Config 驗證層（L1）
 *
 * 從 config-api.js 提取的驗證函式。
 * 負責驗證 agent/hook/skill 三大元件的設定正確性。
 *
 * exports：validateAgent, validateHook, validateSkill, validateAll
 */

const { existsSync } = require('fs');
const { join } = require('path');
const { knownTools, hookEvents } = require('./registry');
const {
  readAgentFile,
  readSkillFile,
  readHooksJson,
  getHookHandler,
  readRegistryData,
  resolveCommand,
} = require('./config-io');

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

// ── 內部驗證函式 ──

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

// ── 公開 API ──

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

  const handler = getHookHandler(hooksData, event);
  if (!handler) {
    addError(result, `hooks.json 中不存在 "${event}" 的條目`);
    return result;
  }

  // type 必須是 'command'
  if (handler.type !== 'command') {
    addError(result, `hook type 必須是 command（實際值：${handler.type}）`);
  }

  // command 腳本必須存在
  if (!handler.command) {
    addError(result, '缺少必填欄位：command');
  } else {
    const resolvedCmd = resolveCommand(handler.command, pluginRoot);
    if (!existsSync(resolvedCmd)) {
      addError(result, `command 指向的腳本不存在：${handler.command}`);
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
  let hooksData = { hooks: {} };
  try {
    hooksData = readHooksJson(pluginRoot);
  } catch (e) {
    addError(crossResult, `無法讀取 hooks.json：${e.message}`);
    allValid = false;
  }

  for (const event of Object.keys(hooksData.hooks)) {
    const r = validateHook(event, pluginRoot);
    hookResults[event] = r;
    if (!r.valid) allValid = false;
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

// ── 模組匯出 ──

module.exports = {
  validateAgent,
  validateHook,
  validateSkill,
  validateAll,
  // 供 config-api.js 內部使用的輔助函式
  validateAgentFrontmatter,
  validateSkillFrontmatter,
  makeResult,
  addError,
  addWarning,
  VALID_MODELS,
};
