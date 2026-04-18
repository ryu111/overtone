// ralph-loop-pivot-detector.test.js — 空轉偵測 baseline
// 派生：spec/討論/ralph-loop-pivot-detector.md

import { describe, test, expect } from "bun:test";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";

const TMPDIR = "/tmp/pivot-detector-test";

function setup(iter) {
	if (existsSync(TMPDIR)) rmSync(TMPDIR, { recursive: true });
	mkdirSync(`${TMPDIR}/.claude`, { recursive: true });
	writeFileSync(
		`${TMPDIR}/.claude/ralph-loop.local.md`,
		`---\niteration: ${iter}\n---\n`,
	);
}

describe("ralph-loop-pivot-detector", () => {
	test("iter < 4 不觸發", async () => {
		setup(3);
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectPivot({ cwd: TMPDIR });
		expect(result).toBeNull();
	});

	test("iter >= 4 + 0 commit → 觸發 warn", async () => {
		setup(5);
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectPivot({ cwd: TMPDIR });
		expect(result?.hookSpecificOutput?.additionalContext).toContain("pivot-detector");
		expect(result?.hookSpecificOutput?.additionalContext).toContain("iter 5");
	});

	test("缺 cwd 不 crash", async () => {
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectPivot({});
		expect(result).toBeNull();
	});

	test("ralph-loop.local.md 不存在不 crash", async () => {
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectPivot({ cwd: "/tmp/nonexistent-pivot-test" });
		expect(result).toBeNull();
	});

	test("hook-client.js 已註冊", () => {
		const fs = require("node:fs");
		const content = fs.readFileSync(`${require("node:os").homedir()}/.claude/hooks/hook-client.js`, "utf-8");
		expect(content).toContain("ralph-loop-pivot-detector.js");
	});

	test("ralph-loop.local.md 格式異常（無 iteration）不 crash", async () => {
		if (existsSync(TMPDIR)) rmSync(TMPDIR, { recursive: true });
		mkdirSync(`${TMPDIR}/.claude`, { recursive: true });
		writeFileSync(`${TMPDIR}/.claude/ralph-loop.local.md`, "---\nactive: true\n---\n");
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectPivot({ cwd: TMPDIR });
		expect(result).toBeNull();
	});

	test("getIteration 獨立 export — 支援外部診斷呼叫", async () => {
		setup(7);
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		expect(mod.getIteration(TMPDIR)).toBe(7);
		expect(mod.getIteration("/tmp/nonexistent-xxx")).toBeNull();
	});
});

// ─── 新動機 baseline（2026-04-19 commit 4107453 rule 升級配合） ───
// 偵測：近 3 筆 reflections.jsonl 全無 `外部研究` field → pivot-mandatory warn
import { appendFileSync } from "node:fs";

function setupReflections(entries) {
	if (existsSync(TMPDIR)) rmSync(TMPDIR, { recursive: true });
	mkdirSync(`${TMPDIR}/data`, { recursive: true });
	const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
	writeFileSync(`${TMPDIR}/data/reflections.jsonl`, lines);
}

describe("pivot-detector — 反思外部研究缺漏偵測（commit 4107453 新動機）", () => {
	test("近 3 筆反思全無 `外部研究` field → 觸發 pivot-mandatory warn", async () => {
		setupReflections([
			{ ts: "2026-04-19T09:00:00Z", 結論: ["a"], 行動: ["commit abc1234"], resolved_at: "2026-04-19T09:00:00Z" },
			{ ts: "2026-04-19T10:00:00Z", 結論: ["b"], 行動: ["commit def5678"], resolved_at: "2026-04-19T10:00:00Z" },
			{ ts: "2026-04-19T11:00:00Z", 結論: ["c"], 行動: ["commit 9012345"], resolved_at: "2026-04-19T11:00:00Z" },
		]);
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectNoExternalResearch(TMPDIR);
		expect(result).not.toBeNull();
		expect(result.warnMessage).toContain("外部研究");
		expect(result.warnMessage).toContain("pivot-mandatory");
	});

	test("近 3 筆至少 1 筆含 `外部研究` field → 不觸發", async () => {
		setupReflections([
			{ ts: "2026-04-19T09:00:00Z", 結論: ["a"], 行動: ["x"], resolved_at: "2026-04-19T09:00:00Z" },
			{ ts: "2026-04-19T10:00:00Z", 結論: ["b"], 行動: ["y"], 外部研究: [{ topic: "t", source_url: "https://x.com", insight: "i" }], resolved_at: "2026-04-19T10:00:00Z" },
			{ ts: "2026-04-19T11:00:00Z", 結論: ["c"], 行動: ["z"], resolved_at: "2026-04-19T11:00:00Z" },
		]);
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectNoExternalResearch(TMPDIR);
		expect(result).toBeNull();
	});

	test("reflections.jsonl 不存在不 crash", async () => {
		if (existsSync(TMPDIR)) rmSync(TMPDIR, { recursive: true });
		mkdirSync(TMPDIR, { recursive: true });
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectNoExternalResearch(TMPDIR);
		expect(result).toBeNull();
	});

	test("少於 3 筆反思不觸發（樣本不足）", async () => {
		setupReflections([
			{ ts: "2026-04-19T09:00:00Z", 結論: ["a"], 行動: ["x"], resolved_at: "2026-04-19T09:00:00Z" },
			{ ts: "2026-04-19T10:00:00Z", 結論: ["b"], 行動: ["y"], resolved_at: "2026-04-19T10:00:00Z" },
		]);
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectNoExternalResearch(TMPDIR);
		expect(result).toBeNull();
	});

	test("action 字串含 external-references/ path pattern → 視為有外部研究", async () => {
		setupReflections([
			{ ts: "2026-04-19T09:00:00Z", 結論: ["a"], 行動: ["寫 obsidian/semantic/external-references/foo.md"], resolved_at: "2026-04-19T09:00:00Z" },
			{ ts: "2026-04-19T10:00:00Z", 結論: ["b"], 行動: ["y"], resolved_at: "2026-04-19T10:00:00Z" },
			{ ts: "2026-04-19T11:00:00Z", 結論: ["c"], 行動: ["z"], resolved_at: "2026-04-19T11:00:00Z" },
		]);
		const mod = await import("/Users/sbu/.claude/hooks/modules/ralph-loop-pivot-detector.js");
		const result = mod.detectNoExternalResearch(TMPDIR);
		expect(result).toBeNull();
	});
});
