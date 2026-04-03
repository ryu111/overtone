#!/usr/bin/env bun
/**
 * Model Benchmark Runner
 * 用法: bun run.js [--model MODEL_ID] [--endpoint URL] [--task TASK_ID]
 *
 * MODEL_ID: qwen3-8b | gemma4-26b | gemma4-31b (default: qwen3-8b)
 * ENDPOINT: OpenAI-compatible API endpoint (default: http://localhost:8000)
 * TASK_ID: 只跑指定任務（session-summary, commit-message, etc.）
 *
 * 結果輸出到 results/{MODEL_ID}.jsonl
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";

const __dir = dirname(new URL(import.meta.url).pathname);

// ── CLI args ──
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const MODEL_ID = getArg("model", "qwen3-8b");
const ENDPOINT = getArg("endpoint", "http://localhost:8000");
const TASK_FILTER = getArg("task", null);
// Ollama 用模型全名，vllm-mlx 用 "local"
const API_MODEL_NAME = getArg("api-model", "local");

// ── 載入測試案例 ──
const casesPath = join(__dir, "cases.json");
const benchmark = JSON.parse(readFileSync(casesPath, "utf-8"));

// ── 結果目錄 ──
const resultsDir = join(__dir, "results");
mkdirSync(resultsDir, { recursive: true });
const resultFile = join(resultsDir, `${MODEL_ID}.jsonl`);

// 清除舊結果
if (existsSync(resultFile)) writeFileSync(resultFile, "");

// ── RAM 監控 ──
function getRAMInfo() {
  try {
    const { execSync } = require("node:child_process");
    const vmstat = execSync("vm_stat", { encoding: "utf-8", timeout: 3000 });
    const pageSize = 16384;
    const extract = (label) => {
      const m = vmstat.match(new RegExp(`${label}:\\s+(\\d+)`));
      return m ? parseInt(m[1]) * pageSize : 0;
    };
    const free = extract("Pages free");
    const inactive = extract("Pages inactive");
    const purgeable = extract("Pages purgeable");
    const active = extract("Pages active");
    return {
      freeGB: (free / 1e9).toFixed(1),
      availableGB: ((free + inactive + purgeable) / 1e9).toFixed(1),
      activeGB: (active / 1e9).toFixed(1),
    };
  } catch {
    return { freeGB: "?", availableGB: "?", activeGB: "?" };
  }
}

// ── 呼叫模型 ──
async function waitForServer(maxWait = 10000) {
  const start = Date.now();
  const healthUrl = IS_OLLAMA ? `${ENDPOINT}/api/tags` : `${ENDPOINT}/v1/models`;
  while (Date.now() - start < maxWait) {
    try {
      const r = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// 判斷是否使用 Ollama 原生 API
const IS_OLLAMA = ENDPOINT.includes("11434");

async function callModel(prompt, system, timeout = 60000) {
  const t0 = Date.now();
  try {
    // Ollama 原生 API：/api/chat（think:false 避免 reasoning-only 回應）
    if (IS_OLLAMA) {
      const res = await fetch(`${ENDPOINT}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeout),
        body: JSON.stringify({
          model: API_MODEL_NAME,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          options: { temperature: 0.1, num_predict: 512 },
          stream: false,
          think: false,
        }),
      });
      if (!res.ok) return { error: `HTTP ${res.status}`, latencyMs: Date.now() - t0, output: null };
      const data = await res.json();
      const output = data.message?.content?.trim() || "";
      const tokens = data.eval_count || 0;
      return { output, latencyMs: Date.now() - t0, tokens, error: null };
    }

    // vllm-mlx / OpenAI-compatible API
    const res = await fetch(`${ENDPOINT}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeout),
      body: JSON.stringify({
        model: API_MODEL_NAME,
        messages: [
          { role: "system", content: system },
          { role: "user", content: MODEL_ID.startsWith("qwen") ? prompt + "\n/no_think" : prompt },
        ],
        temperature: 0.1,
        max_tokens: 512,
      }),
    });

    if (!res.ok) {
      return { error: `HTTP ${res.status}`, latencyMs: Date.now() - t0, output: null };
    }

    const data = await res.json();
    // 從 content 或 reasoning 提取輸出
    const msg = data.choices?.[0]?.message;
    const output = msg?.content?.trim() || msg?.reasoning?.trim() || "";
    const tokens = data.usage?.completion_tokens || 0;
    return {
      output,
      latencyMs: Date.now() - t0,
      tokens,
      error: null,
    };
  } catch (e) {
    return { error: e.message, latencyMs: Date.now() - t0, output: null };
  }
}

// ── 客觀評估 ──
function stripThinking(text) {
  if (!text) return "";
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function objectiveScore(taskType, rawOutput, groundTruth, criteria) {
  const scores = {};
  const output = stripThinking(rawOutput);

  // 格式正確性
  if (taskType === "json") {
    try {
      // 先清除 ```json code block 包裝
      let jsonStr = output.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      // 嘗試 array 或 object
      let parsed;
      const arrMatch = jsonStr.match(/\[[\s\S]*\]/);
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (arrMatch) {
        try { parsed = JSON.parse(arrMatch[0]); } catch { /* try obj */ }
      }
      if (!parsed && objMatch) {
        parsed = JSON.parse(objMatch[0]);
      }
      if (!parsed) parsed = JSON.parse(jsonStr);
      scores.jsonValid = 1;
      // Object with total（品質評分）
      if (!Array.isArray(parsed) && parsed.total !== undefined) {
        scores.hasTotal = 1;
        if (criteria) {
          const rangeMatch = criteria.match(/total 在 (\d+)-(\d+)/);
          if (rangeMatch) {
            const [, min, max] = rangeMatch.map(Number);
            scores.totalInRange = (parsed.total >= min && parsed.total <= max) ? 1 : 0;
          }
        }
      }
      // Array（改善建議）
      if (Array.isArray(parsed)) {
        scores.isArray = 1;
        scores.hasItems = parsed.length > 0 ? 1 : 0;
      }
    } catch {
      scores.jsonValid = 0;
    }
  } else if (taskType === "text") {
    scores.nonEmpty = output.length > 0 ? 1 : 0;
    scores.isChinese = /[\u4e00-\u9fff]/.test(output) ? 1 : 0;
    scores.reasonable_length = (output.length >= 10 && output.length <= 500) ? 1 : 0;
  }

  // 通用：空 <think>\n\n</think> 也算通過（Qwen3-8B 特性）
  const hasSubstantialThinking = /<think>[\s\S]{10,}<\/think>/.test(rawOutput);
  scores.noThinking = hasSubstantialThinking ? 0 : 1;

  return scores;
}

// ── 主流程 ──
console.log(`\n${"=".repeat(60)}`);
console.log(`  Model Benchmark: ${MODEL_ID}`);
console.log(`  Endpoint: ${ENDPOINT}`);
console.log(`${"=".repeat(60)}\n`);

// 先確認 endpoint 可用
try {
  const healthUrl = IS_OLLAMA ? `${ENDPOINT}/api/tags` : `${ENDPOINT}/v1/models`;
  const check = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
  if (!check.ok) throw new Error(`HTTP ${check.status}`);
  const models = await check.json();
  const modelName = IS_OLLAMA
    ? models.models?.[0]?.name || "unknown"
    : models.data?.[0]?.id || "unknown";
  console.log(`  Model available: ${modelName}\n`);
} catch (e) {
  console.error(`  ❌ Endpoint not available: ${e.message}`);
  console.log("metric:0.000000");
  process.exit(1);
}

const ramBefore = getRAMInfo();
console.log(`  RAM before: free=${ramBefore.freeGB}GB, available=${ramBefore.availableGB}GB, active=${ramBefore.activeGB}GB\n`);

let totalCases = 0;
let totalPassed = 0;
let totalLatency = 0;

const tasks = TASK_FILTER
  ? benchmark.tasks.filter((t) => t.id === TASK_FILTER)
  : benchmark.tasks;

for (const task of tasks) {
  console.log(`\n── ${task.name} (${task.id}) ──`);
  let taskPassed = 0;

  for (const c of task.cases) {
    // 確認 server 可用（crash recovery）
    const serverOk = await waitForServer(5000);
    if (!serverOk) {
      console.log(`  ⚠ Server unreachable, waiting 10s...`);
      const recovered = await waitForServer(15000);
      if (!recovered) {
        console.log(`  ❌ Server not recovered, skipping remaining cases`);
        break;
      }
    }
    const system = task.system;
    const result = await callModel(c.prompt, system);
    totalCases++;

    const objScores = objectiveScore(task.type, result.output || "", c.ground_truth, c.criteria);
    const passed = Object.values(objScores).every((v) => v === 1);
    if (passed) {
      taskPassed++;
      totalPassed++;
    }
    totalLatency += result.latencyMs;

    // 記錄結果
    const entry = {
      model: MODEL_ID,
      task: task.id,
      label: c.label,
      latencyMs: result.latencyMs,
      tokens: result.tokens,
      output: (result.output || "").slice(0, 500),
      error: result.error,
      objectiveScores: objScores,
      passed,
    };
    appendFileSync(resultFile, JSON.stringify(entry) + "\n");

    const status = passed ? "✓" : "✗";
    const scores = Object.entries(objScores).map(([k, v]) => `${k}:${v}`).join(" ");
    console.log(`  ${status} ${c.label} (${result.latencyMs}ms) [${scores}]`);

    if (result.error) {
      console.log(`    ERROR: ${result.error}`);
    }
  }

  console.log(`  ${task.name}: ${taskPassed}/${task.cases.length} passed`);
}

const ramAfter = getRAMInfo();

console.log(`\n${"=".repeat(60)}`);
console.log(`  Summary: ${MODEL_ID}`);
console.log(`${"=".repeat(60)}`);
console.log(`  Total: ${totalPassed}/${totalCases} passed (${((totalPassed / totalCases) * 100).toFixed(1)}%)`);
console.log(`  Avg latency: ${Math.round(totalLatency / totalCases)}ms`);
console.log(`  RAM after: free=${ramAfter.freeGB}GB, available=${ramAfter.availableGB}GB, active=${ramAfter.activeGB}GB`);
console.log(`  Results: ${resultFile}`);

// metric 輸出（供 autoresearch 用）
const metric = totalPassed / totalCases;
console.log(`\nmetric:${metric.toFixed(6)}`);
