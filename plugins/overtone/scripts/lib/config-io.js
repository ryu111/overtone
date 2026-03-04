'use strict';
/**
 * config-io.js — Config IO 輔助函式
 *
 * 供 config-validator.js 和 config-api.js 共用的 IO 操作函式。
 * 負責讀寫 agent/skill/hook/registry/plugin 檔案。
 */

const { existsSync, readFileSync } = require('fs');
const { join } = require('path');
const matter = require('gray-matter');
const { atomicWrite } = require('./utils');

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
 * 讀取 hooks.json（官方三層嵌套格式）
 * @param {string} pluginRoot
 * @returns {{ hooks: object }} hooks 物件以事件名為 key
 */
function readHooksJson(pluginRoot) {
  const hooksPath = join(pluginRoot, 'hooks', 'hooks.json');
  if (!existsSync(hooksPath)) return { hooks: {} };
  return JSON.parse(readFileSync(hooksPath, 'utf8'));
}

/**
 * 從 hooks.json 取得指定事件的第一個 handler（扁平化）
 * @param {object} hooksData - readHooksJson() 回傳值
 * @param {string} event - 事件名稱
 * @returns {{ type: string, command: string, matcher?: string, timeout?: number } | null}
 */
function getHookHandler(hooksData, event) {
  const matcherGroups = hooksData.hooks?.[event];
  if (!matcherGroups || !Array.isArray(matcherGroups) || matcherGroups.length === 0) return null;
  const group = matcherGroups[0];
  if (!group.hooks || group.hooks.length === 0) return null;
  const handler = { ...group.hooks[0] };
  if (group.matcher) handler.matcher = group.matcher;
  return handler;
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

module.exports = {
  resolveCommand,
  readAgentFile,
  readSkillFile,
  readHooksJson,
  getHookHandler,
  readRegistryData,
  writeRegistryData,
  readPluginJson,
  writePluginJson,
};
