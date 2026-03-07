#!/usr/bin/env bun
'use strict';
/**
 * test-parallel.js — 多進程並行測試執行器
 *
 * 策略：
 *   1. 偵測 CPU 核心數，worker 數 = floor(cpus * 3/4)
 *   2. 掃描所有測試檔案
 *   3. 已知重量級檔案（歷史計時）優先分配到獨立 worker
 *   4. 輕量級檔案用 greedy bin-packing 均分
 *   5. 並行啟動所有 worker，收集結果
 *
 * 用法：bun scripts/test-parallel.js [--workers N] [--verbose]
 */

const { readdirSync, readFileSync } = require('fs');
const { join } = require('path');
const { cpus } = require('os');

// ── 設定 ──

const PROJECT_ROOT = join(__dirname, '..');
const TEST_DIRS = ['tests/unit', 'tests/integration', 'tests/e2e'];

// 確保子進程繼承正確的 OVERTONE_PLUGIN_ROOT（指向本地 plugins/overtone）
// 若外部已設定則保留（CI 環境可能指向全域安裝路徑）
// 注意：Bun.spawn 不自動繼承 process.env 動態賦值，需在 spawn options.env 中明確傳遞
const CHILD_ENV = {
  ...process.env,
  OVERTONE_PLUGIN_ROOT: process.env.OVERTONE_PLUGIN_ROOT || join(PROJECT_ROOT, 'plugins', 'overtone'),
};

// 已知重量級檔案（ms，來自實測）——定期用 --calibrate 更新
const KNOWN_WEIGHTS = {
  'tests/unit/session-start-handler.test.js': 10302,
  'tests/unit/session-end-handler.test.js': 9265,
  'tests/integration/session-start.test.js': 6322,
  'tests/integration/health-check.test.js': 3743,
  'tests/integration/platform-alignment-session-end.test.js': 3577,
  'tests/e2e/smoke.test.js': 2837,
  'tests/integration/os-scripts.test.js': 2388,
  'tests/integration/pre-compact.test.js': 2269,
  'tests/unit/guard-system.test.js': 1953,
  'tests/unit/health-check.test.js': 1722,
  'tests/e2e/guard-system-e2e.test.js': 1393,
  'tests/integration/feedback-loop.test.js': 1342,
  'tests/unit/health-check-internalization.test.js': 1332,
  'tests/integration/agent-on-stop.test.js': 1331,
  'tests/unit/health-check-os-tools.test.js': 1307,
  'tests/e2e/full-workflow.test.js': 1294,
  'tests/unit/health-check-proactive.test.js': 1256,
  'tests/e2e/secure-workflow.test.js': 1124,
  'tests/unit/dead-code-scanner.test.js': 1108,
  'tests/integration/gh-check.test.js': 1104,
  'tests/e2e/workflow-lifecycle.test.js': 1053,
  'tests/e2e/standard-workflow.test.js': 1023,
  'tests/unit/websocket.test.js': 1007,
};

// 預設權重（未知檔案）
const DEFAULT_WEIGHT = 300;

// 需要隔離執行的檔案（fallback 白名單，向下相容）
// 主要靠 // @sequential marker 偵測（見 hasSequentialMarker）
// 注意：health-check.test.js 曾因重量級子進程列於此，優化後已透過 @sequential marker 管理
const SEQUENTIAL_FILES = new Set([
  'tests/integration/session-id-bridge.test.js',
  'tests/unit/health-check-os-tools.test.js',
  'tests/integration/dashboard-pid.test.js',
  'tests/integration/health-check.test.js',
]);

/**
 * 掃描檔案前 5 行是否含有 // @sequential 標記
 * @param {string} relativePath 相對於 PROJECT_ROOT 的路徑
 * @returns {boolean}
 */
function hasSequentialMarker(relativePath) {
  try {
    const content = readFileSync(join(PROJECT_ROOT, relativePath), 'utf8');
    const lines = content.split('\n').slice(0, 5);
    return lines.some(line => line.trim() === '// @sequential');
  } catch {
    return false;
  }
}

// ── 參數解析 ──

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const calibrate = args.includes('--calibrate');
const workerOverride = args.find(a => a.startsWith('--workers='));
const cpuCount = cpus().length;
const workerCount = workerOverride
  ? parseInt(workerOverride.split('=')[1], 10)
  : Math.max(2, Math.floor(cpuCount * 3 / 4));

// ── 收集測試檔案 ──

function collectTestFiles() {
  const files = [];
  for (const dir of TEST_DIRS) {
    const fullDir = join(PROJECT_ROOT, dir);
    try {
      for (const f of readdirSync(fullDir)) {
        if (f.endsWith('.test.js')) {
          files.push(join(dir, f));
        }
      }
    } catch { /* 目錄不存在跳過 */ }
  }
  return files;
}

// ── 校準模式：逐檔計時 ──

async function runCalibrate() {
  const files = collectTestFiles();
  const results = [];

  console.log(`校準 ${files.length} 個測試檔案...\n`);

  for (const file of files) {
    const start = performance.now();
    const proc = Bun.spawnSync(['bun', 'test', file], {
      cwd: PROJECT_ROOT,
      env: CHILD_ENV,
      stdout: 'ignore',
      stderr: 'ignore',
    });
    const ms = Math.round(performance.now() - start);
    results.push({ file, ms, ok: proc.exitCode === 0 });
    if (verbose) console.log(`  ${ms}ms ${file}`);
  }

  results.sort((a, b) => b.ms - a.ms);

  console.log('\n// 將以下貼入 KNOWN_WEIGHTS：');
  console.log('const KNOWN_WEIGHTS = {');
  for (const r of results.filter(r => r.ms > 1000)) {
    console.log(`  '${r.file}': ${r.ms},`);
  }
  console.log('};');
}

// ── Greedy Bin-Packing ──

function distributeFiles(files, numWorkers) {
  // 按權重降序排列
  const weighted = files.map(f => ({
    file: f,
    weight: KNOWN_WEIGHTS[f] || DEFAULT_WEIGHT,
  })).sort((a, b) => b.weight - a.weight);

  // 初始化 worker buckets
  const workers = Array.from({ length: numWorkers }, () => ({
    files: [],
    totalWeight: 0,
  }));

  // Greedy：每次把最重的檔案放到最輕的 worker
  for (const item of weighted) {
    const lightest = workers.reduce((min, w) =>
      w.totalWeight < min.totalWeight ? w : min
    );
    lightest.files.push(item.file);
    lightest.totalWeight += item.weight;
  }

  return workers;
}

// ── 並行執行 ──

async function runParallel() {
  const allFiles = collectTestFiles();

  // 分離串行檔案：優先靠 // @sequential marker，SEQUENTIAL_FILES 作 fallback
  const markerFiles = allFiles.filter(f => hasSequentialMarker(f));
  const markerCount = markerFiles.length;
  const sequentialFiles = allFiles.filter(f => hasSequentialMarker(f) || SEQUENTIAL_FILES.has(f));
  const parallelFiles = allFiles.filter(f => !sequentialFiles.includes(f));

  const workers = distributeFiles(parallelFiles, workerCount);

  console.log(`CPU: ${cpuCount} 核心 | Workers: ${workerCount} | 測試檔案: ${allFiles.length}`);
  if (markerCount > 0) {
    console.log(`偵測到 @sequential marker: ${markerCount} 個`);
  }
  if (sequentialFiles.length > 0) {
    console.log(`隔離測試: ${sequentialFiles.length} 個（parallel 完成後並行啟動）`);
  }

  if (verbose) {
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      console.log(`  Worker ${i + 1}: ${w.files.length} 檔案, 預估 ${w.totalWeight}ms`);
    }
    console.log('');
  }

  const start = performance.now();

  // 啟動所有並行 worker
  const promises = workers
    .filter(w => w.files.length > 0)
    .map((w, i) => {
      const proc = Bun.spawn(['bun', 'test', ...w.files], {
        cwd: PROJECT_ROOT,
        env: CHILD_ENV,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      return (async () => {
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        return { index: i, stdout, stderr, exitCode, files: w.files };
      })();
    });

  const parallelResults = await Promise.all(promises);

  // sequential 檔案各自作為獨立進程，在 parallel 完成後並行啟動（彼此存取不同共享資源）
  const seqPromises = sequentialFiles.map((f, i) => {
    const proc = Bun.spawn(['bun', 'test', '--max-concurrency=1', f], {
      cwd: PROJECT_ROOT,
      env: CHILD_ENV,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    return (async () => {
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { index: workers.length + i, stdout, stderr, exitCode, files: [f], sequential: true };
    })();
  });

  const seqResults = await Promise.all(seqPromises);
  const results = [...parallelResults, ...seqResults];

  const elapsed = Math.round(performance.now() - start);

  // 彙總結果
  let totalPass = 0;
  let totalFail = 0;
  let hasFailure = false;
  const failedFiles = [];

  for (const r of results) {
    // bun test 將結果輸出到 stderr
    const output = r.stderr || r.stdout;
    const passMatch = output.match(/(\d+) pass/);
    const failMatch = output.match(/(\d+) fail/);
    totalPass += passMatch ? parseInt(passMatch[1], 10) : 0;
    const fails = failMatch ? parseInt(failMatch[1], 10) : 0;
    totalFail += fails;

    if (r.exitCode !== 0 || fails > 0) {
      hasFailure = true;
      failedFiles.push(...r.files);
      if (verbose) {
        const label = r.sequential ? `串行 ${r.files[0]}` : `Worker ${r.index + 1}`;
        console.log(`\n❌ ${label} 失敗：`);
        console.log(output);
      }
    }
  }

  // 輸出摘要
  const icon = hasFailure ? '❌' : '✅';
  console.log(`\n${icon} ${totalPass} pass, ${totalFail} fail | ${(elapsed / 1000).toFixed(1)}s（${workerCount} workers）`);

  if (hasFailure && !verbose) {
    console.log('\n失敗的檔案：');
    for (const f of failedFiles) {
      console.log(`  - ${f}`);
    }
    console.log('\n加 --verbose 查看詳細輸出');
  }

  process.exit(hasFailure ? 1 : 0);
}

// ── 入口 ──

if (calibrate) {
  runCalibrate();
} else {
  runParallel();
}
