'use strict';
// dependency-graph.js — Overtone plugin 依賴圖核心模組
//
// 提供 on-demand 掃描 + 雙向索引，讓開發者能查詢：
//   - 修改某個檔案會影響哪些元件（getImpacted）
//   - 某個元件依賴哪些路徑（getDependencies）
//
// 四類掃描器：
//   1. Agent Skills：agents/*.md 的 frontmatter skills 欄位對應至 skills/X/SKILL.md
//   2. Skill References：skills/*/SKILL.md 中的路徑引用（舊格式 ${CLAUDE_PLUGIN_ROOT}、相對格式 ./ 和 ../）
//   3. Registry Stages：registry-data.json stages 的 agent 欄位對應至 agents/X.md
//   4. Hook Requires：hooks/scripts 下的相對 require 對應至 scripts/lib/*.js

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// ── ComponentType 推斷 ──────────────────────────────────────────────────────

/**
 * 根據相對路徑推斷元件類型
 * @param {string} relPath - 相對於 pluginRoot 的路徑
 * @returns {string}
 */
function inferType(relPath) {
  if (relPath === 'scripts/lib/registry-data.json') return 'registry';
  if (relPath.startsWith('agents/')) return 'agent';
  if (/^skills\/[^/]+\/SKILL\.md$/.test(relPath)) return 'skill';
  if (relPath.startsWith('skills/')) return 'skill-reference';
  if (relPath.startsWith('hooks/scripts/')) return 'hook-script';
  if (relPath.startsWith('scripts/lib/')) return 'lib-module';
  return 'unknown';
}

// ── 掃描工具 ────────────────────────────────────────────────────────────────

/**
 * 遞迴收集目錄下符合 pattern 的檔案
 * @param {string} dir - 起始目錄（絕對路徑）
 * @param {RegExp} pattern - 檔名 pattern
 * @returns {string[]} 絕對路徑列表
 */
function globRecursive(dir, pattern) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

// ── 四類掃描器 ──────────────────────────────────────────────────────────────

/**
 * 掃描器 1：Agent Skills（agent.md frontmatter skills → SKILL.md）
 */
function scanAgentSkills(pluginRoot, addEdge) {
  const agentsDir = path.join(pluginRoot, 'agents');
  const agentFiles = globRecursive(agentsDir, /\.md$/);

  for (const absPath of agentFiles) {
    const relPath = path.relative(pluginRoot, absPath);
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      const parsed = matter(content);
      const skills = parsed.data && parsed.data.skills;
      if (!Array.isArray(skills) || skills.length === 0) continue;

      for (const skillName of skills) {
        const skillRel = `skills/${skillName}/SKILL.md`;
        addEdge(relPath, skillRel);
      }
    } catch (_) {
      // 靜默跳過損壞檔案
    }
  }
}

/**
 * 掃描器 2：Skill References（SKILL.md 路徑引用 → reference 檔案）
 *
 * 支援三種格式（轉換期間新舊共存）：
 *   1. 舊格式：`${CLAUDE_PLUGIN_ROOT}/skills/{skill}/references/{file}`
 *   2. 新格式（同 skill）：`./references/{file}` 或 `./examples/{file}`
 *   3. 新格式（跨 skill）：`../{otherSkill}/references/{file}`
 */
function scanSkillReferences(pluginRoot, addEdge) {
  const skillsDir = path.join(pluginRoot, 'skills');
  const skillFiles = globRecursive(skillsDir, /^SKILL\.md$/);

  // 格式 1：舊格式 `${CLAUDE_PLUGIN_ROOT}/skills/xxx/references/yyy`
  const oldRegex = /`\$\{CLAUDE_PLUGIN_ROOT\}\/([^`]+)`/g;
  // 格式 2：同 skill 相對路徑 `./references/yyy` 或 `./examples/yyy`
  const selfRelRegex = /`(\.\/(references|examples)\/[^`]+)`/g;
  // 格式 3：跨 skill 相對路徑 `../otherSkill/references/yyy`
  const crossRelRegex = /`(\.\.\/([\w-]+)\/(references|examples)\/[^`]+)`/g;

  for (const absPath of skillFiles) {
    const relPath = path.relative(pluginRoot, absPath);
    // relPath 形如 skills/{skillName}/SKILL.md
    const skillName = relPath.split('/')[1];
    const seenEdges = new Set();

    try {
      const content = fs.readFileSync(absPath, 'utf8');
      let match;

      // 格式 1：舊格式
      oldRegex.lastIndex = 0;
      while ((match = oldRegex.exec(content)) !== null) {
        const refRel = match[1]; // 已是相對於 pluginRoot 的路徑（e.g. skills/xxx/references/yyy.md）
        if (!seenEdges.has(refRel)) {
          seenEdges.add(refRel);
          addEdge(relPath, refRel);
        }
      }

      // 格式 2：同 skill 相對路徑（./references/yyy）
      selfRelRegex.lastIndex = 0;
      while ((match = selfRelRegex.exec(content)) !== null) {
        const subPath = match[1].slice(2); // 去掉開頭的 "./"
        const refRel = `skills/${skillName}/${subPath}`;
        if (!seenEdges.has(refRel)) {
          seenEdges.add(refRel);
          addEdge(relPath, refRel);
        }
      }

      // 格式 3：跨 skill 相對路徑（../otherSkill/references/yyy）
      crossRelRegex.lastIndex = 0;
      while ((match = crossRelRegex.exec(content)) !== null) {
        const subPath = match[1].slice(3); // 去掉開頭的 "../"
        const refRel = `skills/${subPath}`;
        if (!seenEdges.has(refRel)) {
          seenEdges.add(refRel);
          addEdge(relPath, refRel);
        }
      }
    } catch (_) {
      // 靜默跳過
    }
  }
}

/**
 * 掃描器 3：Registry Stages（registry-data.json stages[*].agent → agents/X.md）
 */
function scanRegistryStages(pluginRoot, addEdge) {
  const registryRel = 'scripts/lib/registry-data.json';
  const registryAbs = path.join(pluginRoot, registryRel);

  if (!fs.existsSync(registryAbs)) return;

  let data;
  try {
    const content = fs.readFileSync(registryAbs, 'utf8');
    data = JSON.parse(content);
  } catch (_) {
    return; // 格式損壞時靜默跳過
  }

  if (!data || !data.stages) return;

  const seenAgents = new Set();
  for (const stageKey of Object.keys(data.stages)) {
    const stage = data.stages[stageKey];
    if (!stage || !stage.agent) continue;
    const agentRel = `agents/${stage.agent}.md`;
    if (seenAgents.has(agentRel)) continue; // Set 去重（addEdge 內部也有 Set，雙保險）
    seenAgents.add(agentRel);
    addEdge(registryRel, agentRel);
  }
}

/**
 * 掃描器 4：Hook Requires（hook scripts require 相對路徑 → lib modules）
 */
function scanHookRequires(pluginRoot, addEdge) {
  const hooksScriptsDir = path.join(pluginRoot, 'hooks', 'scripts');
  const jsFiles = globRecursive(hooksScriptsDir, /\.js$/);

  // 比對 require('...') 或 require("...") 中的路徑
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;

  for (const absPath of jsFiles) {
    const relPath = path.relative(pluginRoot, absPath);
    const hookDir = path.dirname(absPath);

    try {
      const content = fs.readFileSync(absPath, 'utf8');
      let match;
      requireRegex.lastIndex = 0;
      while ((match = requireRegex.exec(content)) !== null) {
        const req = match[1];
        // 只處理以 . 開頭的相對路徑
        if (!req.startsWith('.')) continue;

        let resolvedAbs;
        try {
          resolvedAbs = path.resolve(hookDir, req);
        } catch (_) {
          continue;
        }

        // 排除 pluginRoot 外的路徑
        const resolvedRel = path.relative(pluginRoot, resolvedAbs);
        if (resolvedRel.startsWith('..')) continue;

        // 補 .js 副檔名（若原本無副檔名）
        const targetRel = path.extname(resolvedRel) ? resolvedRel : resolvedRel + '.js';
        addEdge(relPath, targetRel);
      }
    } catch (_) {
      // 靜默跳過
    }
  }
}

// ── DependencyGraph 類別 ─────────────────────────────────────────────────────

class DependencyGraph {
  /**
   * @param {string} pluginRoot - plugin 根目錄（絕對路徑）
   * @param {Map<string, Set<string>>} dependencies - 正向索引：A → [B, C]
   * @param {Map<string, Set<string>>} dependents - 反向索引：B → [A]（誰依賴 B）
   */
  constructor(pluginRoot, dependencies, dependents) {
    this._pluginRoot = pluginRoot;
    this._dependencies = dependencies;
    this._dependents = dependents;
  }

  /**
   * 將輸入路徑正規化為相對路徑
   * @param {string} inputPath
   * @returns {string}
   */
  _normalize(inputPath) {
    if (path.isAbsolute(inputPath)) {
      return path.relative(this._pluginRoot, inputPath);
    }
    return inputPath;
  }

  /**
   * 查詢修改某個路徑後會影響哪些元件（BFS 反向遍歷）
   * @param {string} inputPath - 相對或絕對路徑
   * @returns {{ path: string, impacted: Array<{ path: string, type: string, reason: string }> }}
   */
  getImpacted(inputPath) {
    const relPath = this._normalize(inputPath);
    const impacted = [];
    const visited = new Set();
    const queue = [relPath];

    while (queue.length > 0) {
      const current = queue.shift();
      const deps = this._dependents.get(current);
      if (!deps) continue;

      for (const dependent of deps) {
        if (visited.has(dependent)) continue;
        visited.add(dependent);

        impacted.push({
          path: dependent,
          type: inferType(dependent),
          reason: `依賴 ${current}`,
        });

        queue.push(dependent);
      }
    }

    return { path: relPath, impacted };
  }

  /**
   * 查詢某個路徑依賴哪些路徑（正向）
   * @param {string} inputPath - 相對或絕對路徑
   * @returns {string[]}
   */
  getDependencies(inputPath) {
    const relPath = this._normalize(inputPath);
    const deps = this._dependencies.get(relPath);
    if (!deps) return [];
    return Array.from(deps);
  }

  /**
   * 回傳可序列化的原始圖資料
   * @returns {{ dependencies: Record<string, string[]>, dependents: Record<string, string[]> }}
   */
  getRawGraph() {
    const dependencies = {};
    for (const [key, set] of this._dependencies) {
      dependencies[key] = Array.from(set);
    }
    const dependents = {};
    for (const [key, set] of this._dependents) {
      dependents[key] = Array.from(set);
    }
    return { dependencies, dependents };
  }
}

// ── buildGraph 工廠函式 ──────────────────────────────────────────────────────

/**
 * 建立 plugin 依賴圖
 * @param {string} pluginRoot - plugin 根目錄（絕對路徑）
 * @returns {DependencyGraph}
 */
function buildGraph(pluginRoot) {
  if (!fs.existsSync(pluginRoot)) {
    throw new Error(`pluginRoot 不存在：${pluginRoot}`);
  }

  const dependencies = new Map(); // from → Set<to>
  const dependents = new Map();   // to → Set<from>

  /**
   * 新增一條有向邊 from → to
   */
  function addEdge(from, to) {
    if (!dependencies.has(from)) dependencies.set(from, new Set());
    dependencies.get(from).add(to);
    if (!dependents.has(to)) dependents.set(to, new Set());
    dependents.get(to).add(from);
  }

  // 執行四類掃描器
  scanAgentSkills(pluginRoot, addEdge);
  scanSkillReferences(pluginRoot, addEdge);
  scanRegistryStages(pluginRoot, addEdge);
  scanHookRequires(pluginRoot, addEdge);

  return new DependencyGraph(pluginRoot, dependencies, dependents);
}

module.exports = { buildGraph, inferType };
