#!/usr/bin/env bun
/**
 * autoresearch.js — script-driven autoresearch 迴圈
 *
 * 用法：
 *   bun scripts/autoresearch.js <eval-script> [--max-iterations 30]
 *
 * 功能：
 *   1. 讀取 eval script 同目錄的 cases.json
 *   2. 跑 baseline：解析 metric:X.XXXXXX
 *   3. 迴圈：本地模型分析 → 修改 cases.json meta → 跑 eval → keep/discard
 *   4. 連續 5 次 discard → 停止
 *   5. 輸出 results.tsv
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { askLocalModelJSON } from "/Users/sbu/.claude/scripts/local-model.js";

// ── CLI 解析 ──────────────────────────────────────────────────────────────────

export function parseCLI(args) {
  if (args.length === 0) {
    return { error: "用法: bun scripts/autoresearch.js <eval-script> [--max-iterations N]" };
  }

  const evalScript = args[0];
  let maxIterations = 30;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--max-iterations" && i + 1 < args.length) {
      maxIterations = parseInt(args[i + 1], 10);
      i++;
    }
  }

  if (!existsSync(evalScript)) {
    return { error: `eval script 不存在: ${evalScript}` };
  }

  return { evalScript: resolve(evalScript), maxIterations };
}

// ── Eval 執行 ─────────────────────────────────────────────────────────────────

/**
 * 執行 eval script，解析 metric:X.XXXXXX
 * @returns {{ metric: number|null, stdout: string, stderr: string }}
 */
function runEval(evalScript) {
  const result = spawnSync("bun", [evalScript], {
    encoding: "utf-8",
    timeout: 120000,
    env: { ...process.env },
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  const metricMatch = stdout.match(/metric:(\d+\.\d+)/);
  const metric = metricMatch ? parseFloat(metricMatch[1]) : null;

  return { metric, stdout, stderr, exitCode: result.status };
}

// ── Cases.json 讀寫 ───────────────────────────────────────────────────────────

function loadCases(evalScript) {
  const casesPath = join(dirname(evalScript), "cases.json");
  if (!existsSync(casesPath)) {
    throw new Error(`cases.json 不存在: ${casesPath}`);
  }
  const raw = readFileSync(casesPath, "utf-8");
  return { casesPath, data: JSON.parse(raw) };
}

function writeCases(casesPath, data) {
  writeFileSync(casesPath, JSON.stringify(data, null, 2) + "\n");
}

function backupCases(casesPath) {
  const backupPath = casesPath + ".bak";
  copyFileSync(casesPath, backupPath);
  return backupPath;
}

function restoreCases(casesPath) {
  const backupPath = casesPath + ".bak";
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, casesPath);
  }
}

// ── 錯誤分析（解析 stdout 中的誤判案例）────────────────────────────────────────

function extractErrors(stdout) {
  const lines = stdout.split("\n");
  const errors = [];
  let inErrors = false;

  for (const line of lines) {
    if (line.includes("Errors") || line.includes("誤判案例")) {
      inErrors = true;
      continue;
    }
    if (inErrors && line.trim().startsWith("[")) {
      errors.push(line.trim());
    }
    if (inErrors && (line.includes("===") || line.includes("---"))) {
      inErrors = false;
    }
  }

  return errors;
}

// ── 本地模型：建議修改 meta ───────────────────────────────────────────────────

async function askForMetaChanges(casesData, currentMetric, errors, iteration) {
  const { name, variable_description, meta } = casesData;

  const errorSample = errors.slice(0, 10).join("\n");

  const prompt = `你是量化指標優化助手。任務：調整 cases.json 的 meta 數值來改善 eval 指標。

eval 名稱：${name}
變數說明：${variable_description}
當前 meta 值：${JSON.stringify(meta, null, 2)}
當前指標（F1）：${currentMetric?.toFixed(6) ?? "N/A"}
迭代次數：${iteration}

誤判案例：
${errorSample || "無誤判（指標已完美）"}

規則：
1. 只能修改 meta 物件中的數值（不可新增或刪除 key）
2. 每次修改幅度不超過 ±0.1
3. 根據誤判案例推斷最佳調整方向
4. 回傳修改後的完整 meta 物件

請回傳 JSON：{"meta": {"key1": value1, "key2": value2, ...}, "reasoning": "修改原因"}`;

  const result = await askLocalModelJSON(
    prompt,
    null,
    (msg) => console.log(`  [LLM] ${msg}`),
    { temperature: 0.4 }
  );

  return result;
}

// ── Results TSV ───────────────────────────────────────────────────────────────

function writeTsv(tsvPath, rows) {
  const header = "iteration\tmetric\tstatus\tmeta\n";
  const lines = rows.map((r) =>
    [r.iteration, r.metric?.toFixed(6) ?? "N/A", r.status, JSON.stringify(r.meta)].join("\t")
  );
  writeFileSync(tsvPath, header + lines.join("\n") + "\n");
}

// ── 主迴圈 ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseCLI(args);

  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  const { evalScript, maxIterations } = parsed;
  const evalDir = dirname(evalScript);
  const evalName = basename(evalDir);
  const tsvPath = join(evalDir, "results.tsv");

  console.log(`\nautoresearch — ${evalName}`);
  console.log(`eval script: ${evalScript}`);
  console.log(`max iterations: ${maxIterations}`);
  console.log("─".repeat(60));

  // 讀取 cases.json
  const { casesPath, data: casesData } = loadCases(evalScript);
  const hasMetaVariables = casesData.meta && Object.keys(casesData.meta).length > 0;

  if (!hasMetaVariables) {
    console.log("cases.json 無 meta 欄位，無可調整的變數。");
    console.log("跑 baseline 後退出...\n");
    const { metric, stdout } = runEval(evalScript);
    console.log(stdout);
    console.log(`baseline metric: ${metric?.toFixed(6) ?? "N/A"}`);
    process.exit(0);
  }

  // Baseline
  console.log("\n[0] 跑 baseline...");
  const baseline = runEval(evalScript);
  console.log(baseline.stdout);
  if (baseline.metric === null) {
    console.error("無法解析 metric，請確認 eval script 輸出 metric:X.XXXXXX");
    process.exit(1);
  }

  console.log(`baseline: metric=${baseline.metric.toFixed(6)}`);

  const rows = [
    { iteration: 0, metric: baseline.metric, status: "baseline", meta: { ...casesData.meta } },
  ];

  let bestMetric = baseline.metric;
  let bestMeta = { ...casesData.meta };
  let consecutiveDiscards = 0;
  const MAX_CONSECUTIVE_DISCARDS = 5;

  // 迴圈
  for (let i = 1; i <= maxIterations; i++) {
    console.log(`\n[${i}/${maxIterations}] consecutiveDiscards=${consecutiveDiscards}`);

    if (consecutiveDiscards >= MAX_CONSECUTIVE_DISCARDS) {
      console.log(`連續 ${MAX_CONSECUTIVE_DISCARDS} 次無改善，停止迴圈。`);
      break;
    }

    // 讀取當前 cases（每次迴圈重新讀取，確保狀態正確）
    const { data: currentCasesData } = loadCases(evalScript);
    const currentMeta = currentCasesData.meta;

    // 分析誤判並取得建議
    const { stdout: lastStdout } = runEval(evalScript);
    const errors = extractErrors(lastStdout);

    console.log(`  分析誤判案例（${errors.length} 個）...`);
    const suggestion = await askForMetaChanges(currentCasesData, bestMetric, errors, i);

    if (!suggestion?.meta) {
      console.log("  本地模型未回傳有效建議，跳過本輪。");
      consecutiveDiscards++;
      rows.push({ iteration: i, metric: null, status: "skip", meta: currentMeta });
      continue;
    }

    // 驗證 meta key 不變（只更新數值）
    const validMeta = {};
    let hasChange = false;
    for (const key of Object.keys(currentMeta)) {
      const newVal = suggestion.meta[key];
      if (newVal !== undefined && typeof newVal === "number" && newVal !== currentMeta[key]) {
        validMeta[key] = newVal;
        hasChange = true;
      } else {
        validMeta[key] = currentMeta[key];
      }
    }

    if (!hasChange) {
      console.log("  建議無變化，跳過本輪。");
      consecutiveDiscards++;
      rows.push({ iteration: i, metric: null, status: "no-change", meta: currentMeta });
      continue;
    }

    console.log(`  建議 meta: ${JSON.stringify(validMeta)}`);
    if (suggestion.reasoning) {
      console.log(`  理由: ${suggestion.reasoning}`);
    }

    // 備份 + 寫入修改
    backupCases(casesPath);
    const updatedCasesData = { ...currentCasesData, meta: validMeta };
    writeCases(casesPath, updatedCasesData);

    // 跑 eval
    const evalResult = runEval(evalScript);
    const newMetric = evalResult.metric;

    console.log(evalResult.stdout);

    if (newMetric === null) {
      console.log("  無法解析 metric，restore 備份。");
      restoreCases(casesPath);
      consecutiveDiscards++;
      rows.push({ iteration: i, metric: null, status: "error", meta: currentMeta });
      continue;
    }

    if (newMetric > bestMetric) {
      // 改善 → keep
      console.log(`  KEEP: ${bestMetric.toFixed(6)} → ${newMetric.toFixed(6)} (+${(newMetric - bestMetric).toFixed(6)})`);
      bestMetric = newMetric;
      bestMeta = { ...validMeta };
      consecutiveDiscards = 0;
      rows.push({ iteration: i, metric: newMetric, status: "keep", meta: validMeta });
    } else {
      // 退步或持平 → discard
      console.log(`  DISCARD: ${newMetric.toFixed(6)} <= ${bestMetric.toFixed(6)}, restore`);
      restoreCases(casesPath);
      consecutiveDiscards++;
      rows.push({ iteration: i, metric: newMetric, status: "discard", meta: validMeta });
    }

    // 寫入 TSV（每輪更新）
    writeTsv(tsvPath, rows);
  }

  // 最終摘要
  console.log("\n" + "─".repeat(60));
  console.log("autoresearch 完成");
  console.log(`  baseline:  ${baseline.metric.toFixed(6)}`);
  console.log(`  best:      ${bestMetric.toFixed(6)}`);
  console.log(`  改善幅度: ${(bestMetric - baseline.metric).toFixed(6)}`);
  console.log(`  best meta: ${JSON.stringify(bestMeta)}`);
  console.log(`  results:   ${tsvPath}`);
  console.log("─".repeat(60));

  // 最終 TSV
  writeTsv(tsvPath, rows);

  // 如果 best meta 與目前 cases.json 不同，確保寫入
  const { data: finalCasesData } = loadCases(evalScript);
  const needsUpdate = Object.keys(bestMeta).some((k) => finalCasesData.meta[k] !== bestMeta[k]);
  if (needsUpdate) {
    console.log("\n更新 cases.json 為最佳 meta...");
    writeCases(casesPath, { ...finalCasesData, meta: bestMeta });
  }

  process.exit(0);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("autoresearch 失敗:", e.message);
    process.exit(1);
  });
}
