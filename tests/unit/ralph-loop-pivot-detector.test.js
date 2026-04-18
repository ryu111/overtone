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
});
