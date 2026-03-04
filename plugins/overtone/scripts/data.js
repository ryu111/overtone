#!/usr/bin/env node
'use strict';
/**
 * data.js — 統一資料查詢 CLI
 *
 * 用法：
 *   bun scripts/data.js query <type> [options]   查詢資料
 *   bun scripts/data.js stats [sessionId]         統計摘要
 *   bun scripts/data.js gc [options]              垃圾清理
 *   bun scripts/data.js recent [options]          列出最近 session
 *
 * 選項：
 *   --project-root <path>   指定專案根目錄（預設 cwd）
 *   --limit N               最多返回幾筆
 *   --pretty                易讀格式輸出
 *   --table                 表格格式輸出
 *   --dry-run               gc 時只預覽不刪除
 *   --max-age-days N        gc 時指定過期天數（預設 30）
 *   --global                stats 時輸出全域統計
 *   --type <type>           篩選類型
 *   --stage <stage>         篩選 stage
 *   --agent <agent>         篩選 agent
 *   --workflow <type>       篩選 workflow 類型
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// ── 依賴（可透過 _deps 注入供測試替換）──

function _getDeps(_deps = {}) {
  return {
    timeline:       _deps.timeline       || require('./lib/timeline'),
    failureTracker: _deps.failureTracker || require('./lib/failure-tracker'),
    scoreEngine:    _deps.scoreEngine    || require('./lib/score-engine'),
    globalInstinct: _deps.globalInstinct || require('./lib/knowledge/global-instinct'),
    baselineTracker:_deps.baselineTracker|| require('./lib/baseline-tracker'),
    sessionCleanup: _deps.sessionCleanup || require('./lib/session-cleanup'),
    paths:          _deps.paths          || require('./lib/paths'),
    crossAnalyzer:  _deps.crossAnalyzer  || require('./lib/analyzers/cross-analyzer'),
    sessionDigest:  _deps.sessionDigest  || require('./lib/session-digest'),
  };
}

// ── 參數解析工具 ──

/**
 * 解析 CLI 參數
 * @param {string[]} args
 * @returns {{ command, positional, options }}
 */
function parseArgs(args) {
  const options = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      // 布林旗標
      if (!nextArg || nextArg.startsWith('--')) {
        options[key] = true;
      } else {
        options[key] = nextArg;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }

  return {
    command: positional[0] || null,
    positional: positional.slice(1),
    options,
  };
}

// ── 輸出格式工具 ──

/**
 * 輸出結果（依 options 決定格式）
 * @param {*} data
 * @param {object} options
 */
function outputResult(data, options) {
  if (options.pretty) {
    console.log(JSON.stringify(data, null, 2));
  } else if (options.table && Array.isArray(data)) {
    _printTable(data);
  } else {
    console.log(JSON.stringify(data));
  }
}

/**
 * 輸出簡單表格
 * @param {object[]} rows
 */
function _printTable(rows) {
  if (rows.length === 0) {
    console.log('（無資料）');
    return;
  }
  const keys = Object.keys(rows[0]);
  const header = keys.join('\t');
  console.log(header);
  console.log(keys.map(() => '──────').join('\t'));
  for (const row of rows) {
    console.log(keys.map(k => String(row[k] ?? '')).join('\t'));
  }
}

// ── query 子命令 ──

/**
 * 查詢資料
 * @param {string[]} positional - [type, ...]
 * @param {object} options
 * @param {string} projectRoot
 * @param {object} _deps
 */
function cmdQuery(positional, options, projectRoot, _deps = {}) {
  const deps = _getDeps(_deps);
  const type = positional[0];
  const limit = options.limit ? parseInt(options.limit, 10) : undefined;

  if (!type) {
    console.error('用法：bun scripts/data.js query <timeline|failures|scores|observations|baselines|digests> [options]');
    process.exit(1);
  }

  switch (type) {
    case 'timeline': {
      const sessionId = options.session;
      if (!sessionId) {
        console.error('query timeline 需要 --session <sessionId>');
        process.exit(1);
      }
      const filter = {};
      if (options.type) filter.type = options.type;
      if (limit) filter.limit = limit;
      const result = deps.timeline.query(sessionId, filter);
      outputResult(result, options);
      break;
    }

    case 'failures': {
      const patterns = deps.failureTracker.getFailurePatterns(projectRoot);
      // 若有 stage 或 agent 過濾，需要讀取原始資料
      // getFailurePatterns 已聚合，這裡輸出聚合結果
      let result = patterns;
      if (options.stage || options.agent) {
        // 輸出過濾後的 byStage / byAgent 摘要
        result = {};
        if (options.stage && patterns.byStage[options.stage]) {
          result[options.stage] = patterns.byStage[options.stage];
        } else if (options.stage) {
          result = {};
        } else {
          result = patterns;
        }
        if (options.agent && patterns.byAgent[options.agent]) {
          result = { agent: patterns.byAgent[options.agent] };
        }
      }
      outputResult(result, options);
      break;
    }

    case 'scores': {
      const filter = {};
      if (options.stage) filter.stage = options.stage;
      if (limit) filter.limit = limit;
      const result = deps.scoreEngine.queryScores(projectRoot, filter);
      outputResult(result, options);
      break;
    }

    case 'observations': {
      const filter = {};
      if (options.type) filter.type = options.type;
      if (limit) filter.limit = limit;
      const result = deps.globalInstinct.queryGlobal(projectRoot, filter);
      outputResult(result, options);
      break;
    }

    case 'baselines': {
      // queryBaselines 不是 baseline-tracker 的 API，使用 getBaseline 或 _readAll 替代
      // 透過 computeBaselineTrend + getBaseline 組合
      let records;
      try {
        // baseline-tracker 沒有直接的 queryBaselines，
        // 使用 computeSessionMetrics 不適合（需要 sessionId），
        // 這裡讀取 baselines.jsonl 原始資料
        const filePath = deps.paths.global.baselines(projectRoot);
        if (!fs.existsSync(filePath)) {
          outputResult([], options);
          break;
        }
        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (!content) {
          outputResult([], options);
          break;
        }
        records = content.split('\n')
          .filter(Boolean)
          .map(line => { try { return JSON.parse(line); } catch { return null; } })
          .filter(Boolean);

        if (options.workflow) {
          records = records.filter(r => r.workflowType === options.workflow);
        }
        if (limit) {
          records = records.slice(-limit);
        }
      } catch {
        records = [];
      }
      outputResult(records, options);
      break;
    }

    case 'digests': {
      let records;
      try {
        const filePath = deps.paths.global.digests(projectRoot);
        if (!fs.existsSync(filePath)) {
          outputResult([], options);
          break;
        }
        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (!content) {
          outputResult([], options);
          break;
        }
        records = content.split('\n')
          .filter(Boolean)
          .map(line => { try { return JSON.parse(line); } catch { return null; } })
          .filter(Boolean);

        if (options.workflow) {
          records = records.filter(r => r.workflowType === options.workflow);
        }
        if (limit) {
          records = records.slice(-limit);
        }
      } catch {
        records = [];
      }
      outputResult(records, options);
      break;
    }

    default:
      console.error(`未知的資料類型：${type}`);
      console.error('支援類型：timeline, failures, scores, observations, baselines, digests');
      process.exit(1);
  }
}

// ── stats 子命令 ──

/**
 * 統計摘要
 * @param {string[]} positional - [sessionId?]
 * @param {object} options
 * @param {string} projectRoot
 * @param {object} _deps
 */
function cmdStats(positional, options, projectRoot, _deps = {}) {
  const deps = _getDeps(_deps);

  if (options.global) {
    // 全域統計
    const failures = deps.failureTracker.getFailurePatterns(projectRoot);
    const observations = deps.globalInstinct.summarizeGlobal(projectRoot);

    // scores 趨勢（取 DEV 作為代表）
    const scoresSummary = deps.scoreEngine.getScoreSummary(projectRoot, 'DEV');
    const scoresTrend = deps.scoreEngine.computeScoreTrend(projectRoot, 'DEV');

    // baselines 平均（取所有 workflowType）
    const baselinePath = deps.paths.global.baselines(projectRoot);
    let baselineTypes = [];
    let baselineData = {};
    try {
      if (fs.existsSync(baselinePath)) {
        const content = fs.readFileSync(baselinePath, 'utf8').trim();
        if (content) {
          const records = content.split('\n')
            .filter(Boolean)
            .map(line => { try { return JSON.parse(line); } catch { return null; } })
            .filter(Boolean);
          baselineTypes = [...new Set(records.map(r => r.workflowType))];
          for (const wt of baselineTypes) {
            baselineData[wt] = deps.baselineTracker.getBaseline(projectRoot, wt);
          }
        }
      }
    } catch {
      // 靜默
    }

    outputResult({
      failures,
      observations,
      scores: { DEV: { summary: scoresSummary, trend: scoresTrend } },
      baselines: baselineData,
    }, options);
    return;
  }

  // Per-session 統計
  const sessionId = positional[0];
  if (!sessionId) {
    console.error('用法：bun scripts/data.js stats <sessionId> 或 --global');
    process.exit(1);
  }

  // 事件計數（by type）
  const allEvents = deps.timeline.query(sessionId, {});
  const byType = {};
  for (const e of allEvents) {
    if (!byType[e.type]) byType[e.type] = 0;
    byType[e.type]++;
  }

  // 起止時間
  const wfStart = deps.timeline.latest(sessionId, 'workflow:start');
  const wfComplete = deps.timeline.latest(sessionId, 'workflow:complete');

  // workflow 類型（從 workflow:start 事件取）
  const workflowType = wfStart ? wfStart.workflowType : null;

  // stage 耗時
  const stageStarts = deps.timeline.query(sessionId, { type: 'stage:start' });
  const stageCompletes = deps.timeline.query(sessionId, { type: 'stage:complete' });
  const stageDurations = {};
  for (const complete of stageCompletes) {
    if (!complete.stage) continue;
    const start = stageStarts.find(s => s.stage === complete.stage);
    if (start) {
      stageDurations[complete.stage] =
        new Date(complete.ts).getTime() - new Date(start.ts).getTime();
    }
  }

  outputResult({
    sessionId,
    workflowType,
    totalEvents: allEvents.length,
    byType,
    startedAt: wfStart ? wfStart.ts : null,
    completedAt: wfComplete ? wfComplete.ts : null,
    stageDurations,
  }, options);
}

// ── gc 子命令 ──

/**
 * 垃圾清理
 * @param {object} options
 * @param {object} _deps
 */
function cmdGc(options, _deps = {}) {
  const deps = _getDeps(_deps);
  const dryRun = options['dry-run'] === true || options['dry-run'] === 'true' || options['dry-run'] === '';
  const maxAgeDays = options['max-age-days'] ? parseInt(options['max-age-days'], 10) : undefined;

  const gcOptions = { dryRun };
  if (maxAgeDays !== undefined) gcOptions.maxAgeDays = maxAgeDays;

  const result = deps.sessionCleanup.cleanupStaleGlobalDirs(gcOptions);

  if (dryRun) {
    console.log(`[dry-run] 將清理 ${result.dryRunList.length} 個 global hash 目錄：`);
    for (const dir of result.dryRunList) {
      console.log(`  ${dir}`);
    }
  } else {
    console.log(`已清理 ${result.cleaned} 個 global hash 目錄`);
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.error(`  錯誤：${err}`);
      }
    }
  }

  if (options.pretty || options.table) {
    outputResult(result, options);
  }
}

// ── recent 子命令 ──

/**
 * 列出最近 session
 * @param {object} options
 * @param {object} _deps
 */
function cmdRecent(options, _deps = {}) {
  const deps = _getDeps(_deps);
  const limit = options.limit ? parseInt(options.limit, 10) : 10;
  const sessionsDir = deps.paths.SESSIONS_DIR;

  let sessions = [];

  try {
    if (!fs.existsSync(sessionsDir)) {
      outputResult([], options);
      return;
    }

    const entries = fs.readdirSync(sessionsDir);
    const sessionInfos = [];

    for (const entry of entries) {
      const sessionPath = path.join(sessionsDir, entry);
      try {
        const stat = fs.statSync(sessionPath);
        if (!stat.isDirectory()) continue;

        const workflowFile = path.join(sessionPath, 'workflow.json');
        let workflowType = null;
        let eventCount = 0;

        // 讀 workflow.json
        if (fs.existsSync(workflowFile)) {
          try {
            const wf = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
            workflowType = wf.workflowType || null;
          } catch {
            // 靜默
          }
        }

        // 計算 timeline 事件數
        eventCount = deps.timeline.count(entry, {});

        sessionInfos.push({
          sessionId: entry,
          workflowType,
          eventCount,
          lastModified: new Date(stat.mtimeMs).toISOString(),
        });
      } catch {
        // 靜默跳過
      }
    }

    // 按 lastModified 降序排列，取最近 N 個
    sessions = sessionInfos
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
      .slice(0, limit);

  } catch (err) {
    console.error(`讀取 sessions 目錄失敗：${err.message}`);
    process.exit(1);
  }

  outputResult(sessions, options);
}

// ── analyze 子命令 ──

/**
 * 交叉分析
 * @param {string[]} positional - [analysisType, ...]
 * @param {object} options
 * @param {string} projectRoot
 * @param {object} _deps
 */
function cmdAnalyze(positional, options, projectRoot, _deps = {}) {
  const deps = _getDeps(_deps);
  const analysisType = positional[0];

  if (!analysisType) {
    console.error('用法：bun scripts/data.js analyze <failure-hotspot|hook-overhead|workflow-velocity> [options]');
    process.exit(1);
  }

  switch (analysisType) {
    case 'failure-hotspot': {
      const result = deps.crossAnalyzer.analyzeFailureHotspot(deps, projectRoot);
      if (options.table) {
        outputResult(result.hotspots, options);
      } else {
        outputResult(result, options);
      }
      break;
    }

    case 'hook-overhead': {
      // 若無 --session，嘗試從最近的 session 取
      let sessionId = options.session || null;
      if (!sessionId) {
        try {
          const sessionsDir = deps.paths.SESSIONS_DIR;
          const entries = fs.readdirSync(sessionsDir);
          const sessionInfos = entries
            .map(entry => {
              try {
                const stat = fs.statSync(path.join(sessionsDir, entry));
                return { entry, mtime: stat.mtimeMs };
              } catch {
                return null;
              }
            })
            .filter(Boolean)
            .sort((a, b) => b.mtime - a.mtime);
          sessionId = sessionInfos.length > 0 ? sessionInfos[0].entry : null;
        } catch {
          sessionId = null;
        }
      }
      const result = deps.crossAnalyzer.analyzeHookOverhead(deps, { session: sessionId }, projectRoot);
      if (options.table) {
        outputResult(result.hooks, options);
      } else {
        outputResult(result, options);
      }
      break;
    }

    case 'workflow-velocity': {
      // 讀取所有 session ID
      let sessionIds = [];
      try {
        const sessionsDir = deps.paths.SESSIONS_DIR;
        if (fs.existsSync(sessionsDir)) {
          sessionIds = fs.readdirSync(sessionsDir).filter(entry => {
            try {
              return fs.statSync(path.join(sessionsDir, entry)).isDirectory();
            } catch {
              return false;
            }
          });
        }
      } catch {
        sessionIds = [];
      }
      const result = deps.crossAnalyzer.analyzeWorkflowVelocity(deps, sessionIds);
      if (options.table) {
        outputResult(result.stages, options);
      } else {
        outputResult(result, options);
      }
      break;
    }

    default:
      console.error(`未知的分析類型：${analysisType}`);
      console.error('支援類型：failure-hotspot, hook-overhead, workflow-velocity');
      process.exit(1);
  }
}

// ── help ──

function printHelp() {
  console.log('用法：bun scripts/data.js <command> [options]');
  console.log('');
  console.log('子命令：');
  console.log('  query <type>          查詢資料');
  console.log('    type：timeline | failures | scores | observations | baselines | digests');
  console.log('    --session <id>      （timeline 必要）指定 session ID');
  console.log('    --type <type>       篩選事件/觀察類型');
  console.log('    --stage <stage>     篩選 stage');
  console.log('    --agent <agent>     篩選 agent');
  console.log('    --workflow <type>   篩選 workflow 類型');
  console.log('    --limit N           最多返回幾筆');
  console.log('');
  console.log('  stats [sessionId]     統計摘要');
  console.log('    --global            全域統計（跨 session）');
  console.log('');
  console.log('  gc                    垃圾清理（global hash 目錄）');
  console.log('    --dry-run           只預覽不刪除');
  console.log('    --max-age-days N    過期天數（預設 30）');
  console.log('');
  console.log('  recent                列出最近 session');
  console.log('    --limit N           最多列出幾個（預設 10）');
  console.log('');
  console.log('  analyze <type>        交叉分析');
  console.log('    type：failure-hotspot | hook-overhead | workflow-velocity');
  console.log('    failure-hotspot     失敗熱點分析（stage + agent 組合）');
  console.log('    hook-overhead       Hook 開銷分析（平均/最大耗時）');
  console.log('      --session <id>    指定 session（預設取最近的）');
  console.log('    workflow-velocity   工作流速度分析（每個 stage 平均耗時）');
  console.log('');
  console.log('全域選項：');
  console.log('  --project-root <path>  專案根目錄（預設 cwd）');
  console.log('  --pretty               JSON 易讀格式輸出');
  console.log('  --table                表格格式輸出（array 資料時有效）');
}

// ── CLI 入口 ──

/**
 * 主函式
 * @param {string[]} [argv] - 參數（預設 process.argv.slice(2)）
 * @param {object} [_deps]  - 依賴注入（供測試替換）
 */
function main(argv, _deps = {}) {
  const args = argv || process.argv.slice(2);

  // 解析 --project-root（優先）
  const prIdx = args.indexOf('--project-root');
  const projectRoot = prIdx !== -1 && args[prIdx + 1]
    ? path.resolve(args[prIdx + 1])
    : process.cwd();

  // 過濾掉 --project-root 及其值
  const filteredArgs = args.filter((_, i, arr) => {
    if (arr[i] === '--project-root') return false;
    if (i > 0 && arr[i - 1] === '--project-root') return false;
    return true;
  });

  const { command, positional, options } = parseArgs(filteredArgs);

  // --help 旗標
  if (options.help || command === '--help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'query':
      cmdQuery(positional, options, projectRoot, _deps);
      break;

    case 'stats':
      cmdStats(positional, options, projectRoot, _deps);
      break;

    case 'gc':
      cmdGc(options, _deps);
      break;

    case 'recent':
      cmdRecent(options, _deps);
      break;

    case 'analyze':
      cmdAnalyze(positional, options, projectRoot, _deps);
      break;

    default:
      if (!command) {
        printHelp();
      } else {
        console.error(`未知的命令：${command}`);
        console.error('執行 bun scripts/data.js --help 查看完整用法');
        process.exit(1);
      }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  parseArgs,
  outputResult,
  _cmdQuery: cmdQuery,
  _cmdStats: cmdStats,
  _cmdGc: cmdGc,
  _cmdRecent: cmdRecent,
  _cmdAnalyze: cmdAnalyze,
};
