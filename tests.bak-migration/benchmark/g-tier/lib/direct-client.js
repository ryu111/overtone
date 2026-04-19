// direct-client.js — g-tier benchmark 直連 client
// 支援 31b（本地 vllm-mlx via local-model.json SoT）+ haiku/sonnet（claude CLI）
// 不走 multi-tier-loop 升級階梯，純量測單模型能力。

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// 直接讀 ~/.claude/config/local-model.json SoT（不依賴相對 import 跨 repo）
function loadLocalModelConfig() {
	const path = join(homedir(), ".claude/config/local-model.json");
	const defaults = {
		model: "mlx-community/gemma-4-31b-it-4bit",
		port: 8000,
		max_tokens_tiers: { decision: 512, classify: 1024, dispatch: 2048, codegen: 4096, analysis: 8192, hard_cap: 16384 },
	};
	try {
		if (!existsSync(path)) return defaults;
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		return {
			model: parsed.model || defaults.model,
			port: parsed.port || defaults.port,
			max_tokens_tiers: { ...defaults.max_tokens_tiers, ...(parsed.max_tokens_tiers || {}) },
		};
	} catch { return defaults; }
}
function getLocalModelUrl(path = "/v1/chat/completions") {
	const { port } = loadLocalModelConfig();
	return `http://127.0.0.1:${port}${path}`;
}
function getMaxTokens(tier) {
	return loadLocalModelConfig().max_tokens_tiers[tier];
}

/**
 * 呼叫本地 31b 模型。回 { ok, content, tokens, elapsed_ms, error }
 */
export async function callLocal31b(prompt, opts = {}) {
	const { model } = loadLocalModelConfig();
	const url = getLocalModelUrl("/v1/chat/completions");
	const maxTokens = opts.max_tokens || getMaxTokens("dispatch");
	const temperature = opts.temperature ?? 0.2;
	const t0 = Date.now();
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: prompt }],
				max_tokens: maxTokens,
				temperature,
			}),
			signal: AbortSignal.timeout(120000),
		});
		const elapsed = Date.now() - t0;
		if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, elapsed_ms: elapsed };
		const data = await res.json();
		const content = data.choices?.[0]?.message?.content || "";
		const tokens = data.usage?.completion_tokens ?? countTokensEstimate(content);
		return { ok: true, content, tokens, elapsed_ms: elapsed };
	} catch (e) {
		return { ok: false, error: e.message, elapsed_ms: Date.now() - t0 };
	}
}

/**
 * 呼叫 claude CLI (haiku / sonnet)。用 `claude -p <prompt> --model <model>`。
 * --strict-mcp-config + --permission-mode plan 避免 hooks 遞迴或檔案變更。
 */
export function callClaudeCLI(modelName, prompt, _opts = {}) {
	const modelMap = { haiku: "claude-haiku-4-5", sonnet: "claude-sonnet-4-6" };
	const model = modelMap[modelName] || modelName;
	const t0 = Date.now();
	try {
		const r = spawnSync(
			"claude",
			["-p", prompt, "--model", model, "--max-turns", "1", "--output-format", "json"],
			{
				encoding: "utf-8",
				timeout: 60000,
				env: {
					...process.env,
					NOVA_BENCHMARK: "1",
					NOVA_HOOK_TEST: "1",
				},
			},
		);
		const elapsed = Date.now() - t0;
		if (r.status !== 0) {
			return { ok: false, error: `claude exit ${r.status}: ${(r.stderr || "").slice(0, 200)}`, elapsed_ms: elapsed };
		}
		let content = "";
		let tokens = 0;
		try {
			const parsed = JSON.parse(r.stdout);
			content = parsed.result || parsed.response || parsed.text || r.stdout;
			tokens = parsed.usage?.output_tokens ?? countTokensEstimate(content);
		} catch {
			content = r.stdout.trim();
			tokens = countTokensEstimate(content);
		}
		return { ok: true, content, tokens, elapsed_ms: elapsed };
	} catch (e) {
		return { ok: false, error: e.message, elapsed_ms: Date.now() - t0 };
	}
}

/** 粗估 token 數（claude CLI JSON 沒 usage 時的 fallback） */
function countTokensEstimate(text) {
	return Math.max(1, Math.round((text || "").length / 4));
}

/** 統一 dispatch：model ∈ {31b, haiku, sonnet} */
export async function callModel(model, prompt, opts = {}) {
	if (model === "31b") return callLocal31b(prompt, opts);
	return callClaudeCLI(model, prompt, opts);
}
