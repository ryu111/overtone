import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CLAUDE_DIR = join(homedir(), ".claude");

describe("session-wrapup 架構", () => {
	test("wrapup-guard.js 模組存在且 export SessionEnd + Stop", async () => {
		const mod = await import("../../../../.claude/hooks/modules/wrapup-guard.js");
		expect(mod.on.SessionEnd).toBeDefined();
		expect(mod.on.Stop).toBeDefined();
	});

	test("ralph-loop.js 模組存在且 export SessionStart", async () => {
		const mod = await import("../../../../.claude/hooks/modules/ralph-loop.js");
		expect(mod.on.SessionStart).toBeDefined();
	});

	test("wrapup-marker.js 存在", () => {
		const markerPath = join(CLAUDE_DIR, "scripts/wrapup-marker.js");
		expect(existsSync(markerPath)).toBe(true);
	});

	test("settings.json 只有 hook-client.js entry（無側門腳本）", () => {
		const settings = JSON.parse(
			readFileSync(join(CLAUDE_DIR, "settings.json"), "utf-8"),
		);
		const allCommands = Object.values(settings.hooks)
			.flat()
			.flatMap((e) => e.hooks.map((h) => h.command || ""));

		// 所有 hook entry 都透過 hook-client.js
		for (const cmd of allCommands) {
			expect(cmd).toContain("hook-client.js");
		}

		// 不應有側門腳本
		expect(allCommands.some((c) => c.includes("auto-ralph"))).toBe(false);
		expect(allCommands.some((c) => c.includes("session-wrapup-safety"))).toBe(false);
		expect(allCommands.some((c) => c.includes("wrapup-stop-hook"))).toBe(false);
	});

	test("settings.json SessionEnd 不包含 daemon 直接呼叫", () => {
		const settings = JSON.parse(
			readFileSync(join(CLAUDE_DIR, "settings.json"), "utf-8"),
		);
		const sessionEndHooks = settings.hooks.SessionEnd[0]?.hooks || [];
		const commands = sessionEndHooks.map((h) => h.command || "");

		// 不應直接呼叫 daemon 腳本
		expect(commands.some((c) => c.includes("scripts/maintainer.js"))).toBe(false);
		expect(commands.some((c) => c.includes("scripts/learner.js"))).toBe(false);
		expect(commands.some((c) => c.includes("scripts/judge.js"))).toBe(false);

		// 應只有 hook-client
		expect(commands.some((c) => c.includes("hook-client.js SessionEnd"))).toBe(true);
	});
});

describe("daemon export", () => {
	test("maintainer.js export runMaintainer", async () => {
		const mod = await import("../../../../.claude/scripts/maintainer.js");
		expect(typeof mod.runMaintainer).toBe("function");
	});

	test("learner.js export runLearner", async () => {
		const mod = await import("../../../../.claude/scripts/learner.js");
		expect(typeof mod.runLearner).toBe("function");
	});

	test("judge.js export runJudge", async () => {
		const mod = await import("../../../../.claude/scripts/judge.js");
		expect(typeof mod.runJudge).toBe("function");
	});
});

describe("Stop Hook 行為", () => {
	test("wrapup-guard Stop handler 回傳 decision", async () => {
		const mod = await import("../../../../.claude/hooks/modules/wrapup-guard.js");
		// 呼叫 Stop handler — 結果取決於當前 git 狀態和 marker
		const result = mod.on.Stop({ session_id: "test-session", cwd: "/tmp/nonexistent" });
		expect(result).toHaveProperty("decision");
		expect(["allow", "block"]).toContain(result.decision);
	});
});
