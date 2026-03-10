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

// 確保子進程繼承正確的 OVERTONE_PLUGIN_ROOT（指向 ~/.claude SoT）
// 若外部已設定則保留（CI 環境可能指向不同路徑）
// 注意：Bun.spawn 不自動繼承 process.env 動態賦值，需在 spawn options.env 中明確傳遞
const { homedir } = require('os');
const CHILD_ENV = {
  ...process.env,
  OVERTONE_PLUGIN_ROOT: process.env.OVERTONE_PLUGIN_ROOT || join(homedir(), '.claude'),
};

// 已知重量級檔案（ms，來自實測）——定期用 --calibrate 更新
const KNOWN_WEIGHTS = {
  'tests/e2e/smoke.test.js': 10079,
  'tests/unit/health-check.test.js': 8008,
  'tests/unit/health-check-proactive.test.js': 7688,
  'tests/unit/health-check-internalization.test.js': 7495,
  'tests/integration/health-check.test.js': 7231,
  'tests/integration/platform-alignment-session-end.test.js': 6483,
  'tests/integration/session-start.test.js': 6186,
  'tests/unit/health-check-os-tools.test.js': 2841,
  'tests/integration/pre-compact.test.js': 2821,
  'tests/integration/os-scripts.test.js': 2350,
  'tests/integration/feedback-loop.test.js': 2249,
  'tests/e2e/guard-system-e2e.test.js': 1691,
  'tests/integration/agent-on-stop.test.js': 1576,
  'tests/unit/guard-system.test.js': 1482,
  'tests/e2e/full-workflow.test.js': 1375,
  'tests/unit/statusline.test.js': 1251,
  'tests/e2e/secure-workflow.test.js': 1215,
  'tests/e2e/workflow-lifecycle.test.js': 1200,
  'tests/unit/dead-code-scanner.test.js': 1192,
  'tests/unit/hook-timing.test.js': 1169,
  'tests/e2e/refactor-workflow.test.js': 1139,
  'tests/e2e/standard-workflow.test.js': 1077,
  'tests/integration/baseline-tracker.test.js': 1049,
  'tests/integration/evolution-fix.test.js': 1013,
};

// 預設權重（未知檔案）
const DEFAULT_WEIGHT = 300;

// 互斥組：同組 sequential 檔案在同一 bun test 進程中串行（避免 I/O 競爭）
// 不在任何組中的 sequential 檔案各自獨立進程
//
// 方案 B 優化（2026-03-10）：
//   compact-frequency 和 principles 已移出互斥組：
//   - health-check-compact-frequency.test.js：只呼叫 checkCompactFrequency，用獨立 tmp 目錄，無全域狀態依賴
//   - health-check-principles.test.js：只呼叫 checkClosedLoop/checkRecoveryStrategy/checkCompletionGap，各用 tmp 目錄
//   移出後它們在 Phase 2 作為獨立 @sequential 進程並行執行，不再佔用互斥組時間。
const SEQUENTIAL_GROUPS = {
  'health-check': [
    'tests/unit/health-check.test.js',
    'tests/unit/health-check-os-tools.test.js',
    'tests/unit/health-check-proactive.test.js',
    'tests/unit/health-check-internalization.test.js',
    'tests/integration/health-check.test.js',
  ],
};

// 需要隔離執行的檔案（fallback 白名單，向下相容）
// 主要靠 // @sequential marker 偵測（見 hasSequentialMarker）
// 注意：health-check.test.js 曾因重量級子進程列於此，優化後已透過 @sequential marker 管理
const SEQUENTIAL_FILES = new Set([
  // integration
  'tests/integration/session-id-bridge.test.js',
  'tests/integration/dashboard-pid.test.js',
  'tests/integration/health-check.test.js',
  'tests/integration/platform-alignment-post-failure.test.js',
  // unit (health-check 系列 — compact-frequency 和 principles 已不需互斥，但仍需 @sequential)
  'tests/unit/health-check.test.js',
  'tests/unit/health-check-os-tools.test.js',
  'tests/unit/health-check-compact-frequency.test.js',
  'tests/unit/health-check-proactive.test.js',
  'tests/unit/health-check-principles.test.js',
  'tests/unit/health-check-internalization.test.js',
  // e2e (Bun.spawnSync 子進程競爭共享 session 狀態)
  'tests/e2e/smoke.test.js',
  'tests/e2e/workflow-lifecycle.test.js',
  'tests/e2e/quick-workflow.test.js',
  'tests/e2e/standard-workflow.test.js',
  'tests/e2e/full-workflow.test.js',
  'tests/e2e/debug-workflow.test.js',
  'tests/e2e/tdd-workflow.test.js',
  'tests/e2e/refactor-workflow.test.js',
  'tests/e2e/secure-workflow.test.js',
  'tests/e2e/single-workflow.test.js',
  'tests/e2e/fail-retry-path.test.js',
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
    return lines.some(line => line.trim().startsWith('// @sequential'));
  } catch {
    return false;
  }
}

// ── 參數解析 ──

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const calibrate = args.includes('--calibrate');
const skipSlow = args.includes('--skip-slow');
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

  // --skip-slow：跳過互斥組中的檔案（加速日常開發迭代）
  const slowFiles = new Set(Object.values(SEQUENTIAL_GROUPS).flat());
  const skippedCount = skipSlow ? allFiles.filter(f => slowFiles.has(f)).length : 0;

  console.log(`CPU: ${cpuCount} 核心 | Workers: ${workerCount} | 測試檔案: ${allFiles.length - skippedCount}`);
  if (skipSlow) {
    console.log(`⏭️  跳過互斥組: ${skippedCount} 個慢速測試`);
  }
  if (markerCount > 0) {
    console.log(`偵測到 @sequential marker: ${markerCount - skippedCount} 個`);
  }
  if (sequentialFiles.length - skippedCount > 0) {
    const groupCount = skipSlow ? 0 : Object.keys(SEQUENTIAL_GROUPS).length;
    const ungrouped = sequentialFiles.filter(f => !slowFiles.has(f)).length;
    console.log(`隔離測試: ${sequentialFiles.length - skippedCount} 個（${groupCount} 互斥組 + ${ungrouped} 獨立）`);
  }

  const start = performance.now();

  // 收集 sequential 進程定義（互斥組 + 獨立檔案）
  const groupedFiles = new Set();
  const seqEntries = []; // { files, group? }

  for (const [groupName, groupFiles] of Object.entries(SEQUENTIAL_GROUPS)) {
    if (skipSlow) {
      // --skip-slow：互斥組全部標記為已處理（跳過）
      groupFiles.forEach(f => groupedFiles.add(f));
      continue;
    }
    const matched = sequentialFiles.filter(f => groupFiles.includes(f));
    if (matched.length === 0) continue;
    matched.forEach(f => groupedFiles.add(f));
    seqEntries.push({ files: matched, group: groupName });
  }
  for (const f of sequentialFiles) {
    if (groupedFiles.has(f)) continue;
    seqEntries.push({ files: [f] });
  }

  const parallelWorkers = distributeFiles(parallelFiles, workerCount);

  // Phase 1：parallel workers + 互斥組同時啟動
  // 互斥組是最慢的單一進程（~29s），重疊可省最多時間
  const phase1 = [];

  // 並行 worker
  parallelWorkers
    .filter(w => w.files.length > 0)
    .forEach((w, i) => {
      const proc = Bun.spawn(['bun', 'test', ...w.files], {
        cwd: PROJECT_ROOT,
        env: CHILD_ENV,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      phase1.push((async () => {
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        return { index: i, stdout, stderr, exitCode, files: w.files };
      })());
    });

  // 互斥組進程（與 parallel 同時啟動）
  const groupEntries = seqEntries.filter(e => e.group);
  for (const entry of groupEntries) {
    const idx = phase1.length;
    const proc = Bun.spawn(['bun', 'test', '--max-concurrency=1', ...entry.files], {
      cwd: PROJECT_ROOT,
      env: CHILD_ENV,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    phase1.push((async () => {
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { index: idx, stdout, stderr, exitCode, files: entry.files, sequential: true, group: entry.group };
    })());
  }

  // Phase 2：parallel workers 結束後立刻啟動獨立 sequential（不等互斥組完成）
  const independentEntries = seqEntries.filter(e => !e.group);
  const SEQ_CONCURRENCY = Math.max(2, Math.floor(workerCount / 3));

  // 等 parallel workers 結束（釋放 CPU），但互斥組繼續跑
  const parallelWorkerPromises = phase1.slice(0, parallelWorkers.filter(w => w.files.length > 0).length);
  const groupPromises = phase1.slice(parallelWorkerPromises.length);
  const parallelResults = await Promise.all(parallelWorkerPromises);

  // 啟動獨立 sequential（現在 CPU 已釋放）
  const phase2Results = [];
  for (let i = 0; i < independentEntries.length; i += SEQ_CONCURRENCY) {
    const batch = independentEntries.slice(i, i + SEQ_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(entry => {
      const proc = Bun.spawn(['bun', 'test', '--max-concurrency=1', ...entry.files], {
        cwd: PROJECT_ROOT,
        env: CHILD_ENV,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      return (async () => {
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        return { index: phase1.length + phase2Results.length, stdout, stderr, exitCode, files: entry.files, sequential: true };
      })();
    }));
    phase2Results.push(...batchResults);
  }

  // 等互斥組完成
  const groupResults = await Promise.all(groupPromises);
  const results = [...parallelResults, ...groupResults, ...phase2Results];

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
        const label = r.group ? `串行組 ${r.group}（${r.files.length} 檔）` : r.sequential ? `串行 ${r.files[0]}` : `Worker ${r.index + 1}`;
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
