#!/usr/bin/env bun
/**
 * Claude-as-Judge — 模型品質比較
 * 用法: bun judge.js [--models qwen3-8b,gemma4-26b] [--task TASK_ID]
 *
 * 讀取 results/ 下的 .jsonl 結果，用 Claude 評比品質
 * 輸出比較報告到 results/judge-report.json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const __dir = dirname(new URL(import.meta.url).pathname);
const resultsDir = join(__dir, "results");

// ── CLI args ──
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const MODELS = getArg("models", "").split(",").filter(Boolean);
const TASK_FILTER = getArg("task", null);

// 自動偵測可用模型
const availableModels = MODELS.length > 0
  ? MODELS
  : readdirSync(resultsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.replace(".jsonl", ""));

if (availableModels.length < 2) {
  console.error("需要至少 2 個模型結果才能比較。目前有:", availableModels.join(", ") || "無");
  process.exit(1);
}

console.log(`\n比較模型: ${availableModels.join(" vs ")}`);

// ── 載入結果 ──
function loadResults(modelId) {
  const path = join(resultsDir, `${modelId}.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const allResults = {};
for (const m of availableModels) {
  allResults[m] = loadResults(m);
}

// ── 用 Claude 評分 ──
function askClaude(prompt) {
  const result = spawnSync(
    "claude",
    ["-p", "--model", "sonnet", "--output-format", "text"],
    {
      input: prompt,
      encoding: "utf-8",
      timeout: 60000,
      env: { ...process.env, DISABLE_HOOKS: "1" },
    }
  );
  return result.status === 0 ? result.stdout?.trim() : null;
}

// ── 配對比較 ──
const comparisons = [];
const baseModel = availableModels[0]; // 第一個模型為基準
const baseResults = allResults[baseModel];

for (const challModel of availableModels.slice(1)) {
  const challResults = allResults[challModel];
  console.log(`\n── ${baseModel} vs ${challModel} ──`);

  // 按 task + label 配對
  const pairs = [];
  for (const baseR of baseResults) {
    if (TASK_FILTER && baseR.task !== TASK_FILTER) continue;
    const challR = challResults.find((r) => r.task === baseR.task && r.label === baseR.label);
    if (challR) {
      pairs.push({ task: baseR.task, label: baseR.label, base: baseR, chall: challR });
    }
  }

  console.log(`  配對案例: ${pairs.length}`);

  // 隨機化 A/B 避免位置偏差
  let baseWins = 0, challWins = 0, ties = 0;

  for (const pair of pairs) {
    const isSwapped = Math.random() > 0.5;
    const outputA = isSwapped ? pair.chall.output : pair.base.output;
    const outputB = isSwapped ? pair.base.output : pair.chall.output;
    const modelA = isSwapped ? challModel : baseModel;
    const modelB = isSwapped ? baseModel : challModel;

    const judgePrompt = `你是品質評審。比較以下兩個 AI 模型針對同一任務的輸出。

任務：${pair.task} — ${pair.label}

## 輸出 A
${outputA || "(空)"}

## 輸出 B
${outputB || "(空)"}

## 評分標準
1. 格式正確性（是否符合要求的格式）
2. 內容品質（是否準確、具體、有用）
3. 語言品質（繁體中文、無冗餘）

回覆格式（只回覆 JSON）：
{"winner": "A" 或 "B" 或 "tie", "score_a": 1-5, "score_b": 1-5, "reason": "一句話說明原因"}`;

    const judgeResult = askClaude(judgePrompt);
    let judgment = { winner: "tie", score_a: 3, score_b: 3, reason: "judge failed" };

    if (judgeResult) {
      try {
        const match = judgeResult.match(/\{[\s\S]*\}/);
        if (match) judgment = JSON.parse(match[0]);
      } catch { /* keep default */ }
    }

    // 反轉 swapped 的結果
    const actualWinner = isSwapped
      ? (judgment.winner === "A" ? "B" : judgment.winner === "B" ? "A" : "tie")
      : judgment.winner;

    const baseScore = isSwapped ? judgment.score_b : judgment.score_a;
    const challScore = isSwapped ? judgment.score_a : judgment.score_b;

    if (actualWinner === "A") baseWins++;
    else if (actualWinner === "B") challWins++;
    else ties++;

    const entry = {
      task: pair.task,
      label: pair.label,
      baseModel,
      challModel,
      baseScore,
      challScore,
      winner: actualWinner === "A" ? baseModel : actualWinner === "B" ? challModel : "tie",
      reason: judgment.reason,
      baseLatency: pair.base.latencyMs,
      challLatency: pair.chall.latencyMs,
    };
    comparisons.push(entry);

    const winTag = entry.winner === baseModel ? `← ${baseModel}` : entry.winner === challModel ? `→ ${challModel}` : "= tie";
    console.log(`  ${pair.label}: ${baseScore} vs ${challScore} ${winTag}`);
  }

  console.log(`\n  結果: ${baseModel} ${baseWins}勝 | ${challModel} ${challWins}勝 | 平手 ${ties}`);
  const challWinRate = pairs.length > 0 ? ((challWins / pairs.length) * 100).toFixed(1) : 0;
  console.log(`  ${challModel} 勝率: ${challWinRate}%`);
}

// ── 輸出報告 ──
const report = {
  timestamp: new Date().toISOString(),
  models: availableModels,
  totalComparisons: comparisons.length,
  comparisons,
  summary: {},
};

// 彙總每個模型
for (const model of availableModels) {
  const results = allResults[model];
  const passRate = results.length > 0
    ? results.filter((r) => r.passed).length / results.length
    : 0;
  const avgLatency = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)
    : 0;

  report.summary[model] = {
    totalCases: results.length,
    passRate: parseFloat((passRate * 100).toFixed(1)),
    avgLatencyMs: avgLatency,
    judgeWins: comparisons.filter((c) => c.winner === model).length,
    judgeTies: comparisons.filter((c) => c.winner === "tie").length,
  };
}

const reportPath = join(resultsDir, "judge-report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\n報告: ${reportPath}`);

// ── 最終總結 ──
console.log(`\n${"=".repeat(60)}`);
console.log("  最終比較");
console.log(`${"=".repeat(60)}`);
for (const [model, s] of Object.entries(report.summary)) {
  console.log(`  ${model}: pass=${s.passRate}% latency=${s.avgLatencyMs}ms wins=${s.judgeWins} ties=${s.judgeTies}`);
}
