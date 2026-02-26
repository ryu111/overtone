#!/usr/bin/env node
'use strict';
/**
 * specs.js — Specs 文件管理
 *
 * 管理 {projectRoot}/specs/features/ 下的 feature 目錄生命周期：
 *   in-progress/  — 正在進行
 *   backlog/      — 待辦
 *   archive/      — 已完成歸檔
 */

const {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  cpSync,
  rmSync,
  statSync,
} = require('fs');
const { join } = require('path');
const { atomicWrite } = require('./utils');
const matter = require('gray-matter');

// ── 正規表達式 ──

const KEBAB_CASE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// gray-matter engine：用 matchAll 解析 key: value，避免 js-yaml 的 timestamp 自動轉型
const MATTER_OPTS = {
  engines: {
    yaml: {
      parse: (str) => {
        const result = {};
        for (const [, k, v] of str.matchAll(/^([\w-]+):\s*(.+)$/gm)) {
          result[k] = v.trim();
        }
        return result;
      },
    },
  },
};
const CHECKBOX_UNCHECKED_REGEX = /^[\s]*-\s\[ \]/gm;
const CHECKBOX_CHECKED_REGEX = /^[\s]*-\s\[x\]/gmi;

// ── 路徑輔助 ──

function inProgressDir(projectRoot) {
  return join(projectRoot, 'specs', 'features', 'in-progress');
}

function backlogDir(projectRoot) {
  return join(projectRoot, 'specs', 'features', 'backlog');
}

function archiveDir(projectRoot) {
  return join(projectRoot, 'specs', 'features', 'archive');
}

function featurePath(projectRoot, name) {
  return join(inProgressDir(projectRoot), name);
}

function backlogFeaturePath(projectRoot, name) {
  return join(backlogDir(projectRoot), name);
}

// ── 驗證 ──

/**
 * 驗證 feature 名稱是否符合 kebab-case 格式
 * @param {string} name
 * @returns {boolean}
 */
function isValidFeatureName(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  return KEBAB_CASE_REGEX.test(name);
}

// ── Frontmatter 讀寫 ──

/**
 * 讀取 tasks.md 的 YAML frontmatter
 * @param {string} tasksPath
 * @returns {object|null} 欄位物件；檔案不存在或無 frontmatter 時回傳 null
 */
function readTasksFrontmatter(tasksPath) {
  let content;
  try {
    content = readFileSync(tasksPath, 'utf8');
  } catch {
    return null;
  }

  try {
    const parsed = matter(content, MATTER_OPTS);
    return Object.keys(parsed.data).length ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * 原子性更新 tasks.md frontmatter 中指定欄位
 * @param {string} tasksPath
 * @param {object} updates - 要更新或新增的欄位 key-value
 */
function updateTasksFrontmatter(tasksPath, updates) {
  if (!existsSync(tasksPath)) {
    throw new Error(`檔案不存在：${tasksPath}`);
  }

  const content = readFileSync(tasksPath, 'utf8');
  const parsed = matter(content, MATTER_OPTS);

  if (!matter.test(content)) {
    // 無 frontmatter，直接在開頭加
    atomicWrite(tasksPath, buildFrontmatter(updates) + '\n' + content);
    return;
  }

  // 合併並重建（讀取用 gray-matter，寫入用 buildFrontmatter 保持格式可控）
  const merged = { ...parsed.data, ...updates };
  atomicWrite(tasksPath, buildFrontmatter(merged) + parsed.content);
}

/**
 * 建立 frontmatter 字串
 * @param {object} fields
 * @returns {string}
 */
function buildFrontmatter(fields) {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---`;
}

// ── Checkbox 解析 ──

/**
 * 讀取 tasks.md 中 ## Tasks 區塊後的 checkbox 完成度
 * @param {string} tasksPath
 * @returns {{ total: number, checked: number, allChecked: boolean } | null}
 */
function readTasksCheckboxes(tasksPath) {
  let content;
  try {
    content = readFileSync(tasksPath, 'utf8');
  } catch {
    return null;
  }

  // 只計算 ## Tasks 之後的 checkbox
  const tasksIdx = content.indexOf('## Tasks');
  const relevantContent = tasksIdx >= 0 ? content.slice(tasksIdx) : content;

  CHECKBOX_UNCHECKED_REGEX.lastIndex = 0;
  CHECKBOX_CHECKED_REGEX.lastIndex = 0;

  const unchecked = (relevantContent.match(CHECKBOX_UNCHECKED_REGEX) || []).length;
  const checked = (relevantContent.match(CHECKBOX_CHECKED_REGEX) || []).length;
  const total = unchecked + checked;

  return { total, checked, allChecked: total > 0 && checked === total };
}

// ── Feature 目錄管理 ──

/**
 * 建立 tasks.md 初始內容
 * @param {string} featureName
 * @param {string} workflowType
 * @param {string} status
 * @returns {string}
 */
function buildTasksMd(featureName, workflowType, status) {
  const created = new Date().toISOString();

  const { specsConfig } = require('./registry');
  const config = specsConfig[workflowType] || [];

  // 依 specsConfig 生成 checkbox
  const checkboxes = config.map((item) => `- [ ] ${item}`).join('\n');

  return [
    '---',
    `feature: ${featureName}`,
    `status: ${status}`,
    `workflow: ${workflowType}`,
    `created: ${created}`,
    '---',
    '',
    '## Tasks',
    '',
    checkboxes,
  ].join('\n');
}

/**
 * 在 in-progress 建立 feature 目錄（或從 backlog 搬移）
 * @param {string} projectRoot
 * @param {string} featureName
 * @param {string} workflowType
 * @returns {string} 建立或搬移後的目錄路徑
 */
function initFeatureDir(projectRoot, featureName, workflowType) {
  if (!isValidFeatureName(featureName)) {
    throw new Error(`無效的 feature 名稱：「${featureName}」（必須為 kebab-case）`);
  }

  const destPath = featurePath(projectRoot, featureName);
  const backlogPath = backlogFeaturePath(projectRoot, featureName);

  // 已存在於 in-progress
  if (existsSync(destPath)) {
    throw new Error(`Feature '${featureName}' 已存在於 in-progress`);
  }

  // 從 backlog 搬移
  if (existsSync(backlogPath)) {
    mkdirSync(inProgressDir(projectRoot), { recursive: true });
    moveDir(backlogPath, destPath);
    const tasksPath = join(destPath, 'tasks.md');
    if (existsSync(tasksPath)) {
      updateTasksFrontmatter(tasksPath, { status: 'in-progress' });
    }
    return destPath;
  }

  // 全新建立
  mkdirSync(destPath, { recursive: true });
  const tasksPath = join(destPath, 'tasks.md');
  const content = buildTasksMd(featureName, workflowType, 'in-progress');
  atomicWrite(tasksPath, content);

  return destPath;
}

/**
 * 將 feature 從 in-progress 歸檔到 archive/{date}_{name}/
 * @param {string} projectRoot
 * @param {string} featureName
 * @returns {string} 歸檔目錄路徑
 */
function archiveFeature(projectRoot, featureName) {
  const srcPath = featurePath(projectRoot, featureName);

  if (!existsSync(srcPath)) {
    throw new Error(`Feature '${featureName}' 不在 in-progress 中`);
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const archBase = join(archiveDir(projectRoot), `${today}_${featureName}`);

  // 找不衝突的路徑（加序號）
  let archPath = archBase;
  let suffix = 2;
  while (existsSync(archPath)) {
    archPath = `${archBase}_${suffix}`;
    suffix++;
  }

  mkdirSync(archPath, { recursive: true });
  moveDir(srcPath, archPath);

  // 更新 tasks.md status
  const tasksPath = join(archPath, 'tasks.md');
  if (existsSync(tasksPath)) {
    updateTasksFrontmatter(tasksPath, {
      status: 'archived',
      archivedAt: new Date().toISOString(),
    });
  }

  return archPath;
}

/**
 * 在 backlog 建立新 feature
 * @param {string} projectRoot
 * @param {string} featureName
 * @param {string} workflowType
 * @returns {string} 建立的目錄路徑
 */
function createBacklog(projectRoot, featureName, workflowType) {
  if (!isValidFeatureName(featureName)) {
    throw new Error(`無效的 feature 名稱：「${featureName}」（必須為 kebab-case）`);
  }

  const destPath = backlogFeaturePath(projectRoot, featureName);

  if (existsSync(destPath)) {
    throw new Error(`Feature '${featureName}' 已存在於 backlog`);
  }

  mkdirSync(destPath, { recursive: true });
  const tasksPath = join(destPath, 'tasks.md');
  const content = buildTasksMd(featureName, workflowType, 'backlog');
  atomicWrite(tasksPath, content);

  return destPath;
}

/**
 * 列出所有 feature 清單（依字母排序）
 * @param {string} projectRoot
 * @returns {{ inProgress: string[], backlog: string[], archived: string[] }}
 */
function listFeatures(projectRoot) {
  const result = { inProgress: [], backlog: [], archived: [] };

  result.inProgress = listDirs(inProgressDir(projectRoot));
  result.backlog = listDirs(backlogDir(projectRoot));
  result.archived = listDirs(archiveDir(projectRoot));

  return result;
}

/**
 * 取得當前活躍的 in-progress feature
 * 多個時輸出警告，依字母排序取第一個
 * @param {string} projectRoot
 * @returns {{ name: string, path: string, tasks: object|null } | null}
 */
function getActiveFeature(projectRoot) {
  const dirs = listDirs(inProgressDir(projectRoot));
  if (dirs.length === 0) return null;

  if (dirs.length > 1) {
    process.stderr.write(
      `[overtone/specs] 警告：發現多個 in-progress feature（${dirs.join(', ')}）。使用第一個：${dirs[0]}\n`
    );
  }

  const name = dirs[0];
  const path = join(inProgressDir(projectRoot), name);
  const tasksPath = join(path, 'tasks.md');
  const tasks = existsSync(tasksPath) ? readTasksCheckboxes(tasksPath) : null;

  return { name, path, tasks };
}

// ── 輔助函式 ──

/**
 * 列出目錄下的所有子目錄名稱（排除非目錄，字母排序）
 * @param {string} dirPath
 * @returns {string[]}
 */
function listDirs(dirPath) {
  if (!existsSync(dirPath)) return [];
  try {
    return readdirSync(dirPath)
      .filter((name) => {
        try {
          return statSync(join(dirPath, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

/**
 * 移動目錄（renameSync 優先，失敗時 fallback 到 cpSync + rmSync）
 * @param {string} src
 * @param {string} dest
 */
function moveDir(src, dest) {
  try {
    renameSync(src, dest);
  } catch {
    cpSync(src, dest, { recursive: true });
    rmSync(src, { recursive: true, force: true });
  }
}

module.exports = {
  isValidFeatureName,
  readTasksFrontmatter,
  readTasksCheckboxes,
  updateTasksFrontmatter,
  initFeatureDir,
  archiveFeature,
  createBacklog,
  listFeatures,
  getActiveFeature,
  // 路徑輔助（供 CLI 腳本使用）
  inProgressDir,
  backlogDir,
  archiveDir,
  featurePath,
  backlogFeaturePath,
  // 目錄移動（供 CLI 腳本共用）
  moveDir,
};
