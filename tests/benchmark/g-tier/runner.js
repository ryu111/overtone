#!/usr/bin/env bun
// runner.js — g-tier golden benchmark 主入口
//
// 用法：
//   bun tests/benchmark/g-tier/runner.js --model 31b --set easy
//   bun tests/benchmark/g-tier/runner.js --model 31b,haiku,sonnet --set easy
//   bun tests/benchmark/g-tier/runner.js --dry-run --set easy
//
// xd-l4a0: 複用 block-world 類型的 easy 10 題，3 model 對照；不走 multi-tier-loop

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { callModel } from "./lib/direct-client.js";
import { runChecker } from "./lib/checker.js";
import { writeModelReport, writeCompareReport } from "./lib/report-writer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
	const out = { models: ["31b"], set: "easy", dryRun: false, firstN: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--model") out.models = argv[++i].split(",");
		else if (a === "--set") out.set = argv[++i];
		else if (a === "--dry-run") out.dryRun = true;
		else if (a === "--first-n") out.firstN = parseInt(argv[++i], 10);
	}
	return out;
}

function loadPrompts(setName) {
	const path = join(__dirname, "prompts", `${setName}.json`);
	if (!existsSync(path)) throw new Error(`prompts not found: ${path}`);
	return JSON.parse(readFileSync(path, "utf-8"));
}

async function runTask(model, task) {
	const result = await callModel(model, task.prompt, {
		max_tokens: task.max_tokens,
		temperature: task.temperature,
	});
	if (!result.ok) {
		return {
			id: task.id,
			ok: false,
			pass: false,
			tokens: 0,
			elapsed_ms: result.elapsed_ms,
			error: result.error,
			failureReason: result.error,
		};
	}
	const check = runChecker(task, result.content);
	return {
		id: task.id,
		ok: true,
		pass: check.pass,
		tokens: result.tokens,
		elapsed_ms: result.elapsed_ms,
		content: result.content.slice(0, 200),
		failureReason: check.reason,
	};
}

async function runModel(model, tasks) {
	const results = [];
	for (const task of tasks) {
		process.stderr.write(`[${model}] ${task.id} ... `);
		const r = await runTask(model, task);
		results.push(r);
		process.stderr.write(`${r.pass ? "✅" : "❌"} (${r.tokens}t/${r.elapsed_ms}ms)\n`);
	}
	return results;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const spec = loadPrompts(args.set);
	let tasks = spec.tasks;
	if (args.firstN) tasks = tasks.slice(0, args.firstN);

	console.error(`g-tier benchmark: set=${args.set} tasks=${tasks.length} models=${args.models.join(",")}`);

	if (args.dryRun) {
		for (const t of tasks) {
			const ok = !!t.id && !!t.prompt && !!t.check;
			console.log(`${ok ? "✅" : "❌"} ${t.id}: schema ${ok ? "valid" : "INVALID"}`);
		}
		return;
	}

	const reportsDir = join(__dirname, "reports");
	mkdirSync(reportsDir, { recursive: true });
	const date = new Date().toISOString().slice(0, 10);

	const modelResults = {};
	for (const model of args.models) {
		console.error(`\n=== ${model} ===`);
		const t0 = Date.now();
		const results = await runModel(model, tasks);
		const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
		console.error(`${model} done: ${results.filter((r) => r.pass).length}/${results.length} pass in ${elapsed}s`);
		modelResults[model] = results;

		const reportMd = writeModelReport(model, args.set, results);
		const reportPath = join(reportsDir, `g-tier-benchmark-${model}-${args.set}-${date}.md`);
		writeFileSync(reportPath, reportMd);
		console.error(`  → ${reportPath}`);
	}

	if (args.models.length > 1) {
		const compareMd = writeCompareReport(args.set, modelResults);
		const comparePath = join(reportsDir, `g-tier-benchmark-compare-${args.set}-${date}.md`);
		writeFileSync(comparePath, compareMd);
		console.error(`\ncompare → ${comparePath}`);
	}
}

if (import.meta.main) {
	main().catch((e) => {
		console.error("runner error:", e);
		process.exit(1);
	});
}
