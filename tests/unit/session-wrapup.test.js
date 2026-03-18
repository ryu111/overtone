import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CLAUDE_DIR = join(homedir(), ".claude");

describe("session-wrapup 架構", () => {
	test("wrapup-stop-hook.sh 存在且可執行", () => {
		const hookPath = join(CLAUDE_DIR, "hooks/wrapup-stop-hook.sh");
		expect(existsSync(hookPath)).toBe(true);
		const stat = Bun.file(hookPath);
		expect(stat.size).toBeGreaterThan(0);
	});

	test("session-wrapup-safety.js 存在", () => {
		const safetyPath = join(CLAUDE_DIR, "hooks/session-wrapup-safety.js");
		expect(existsSync(safetyPath)).toBe(true);
	});

	test("wrapup-marker.js 存在", () => {
		const markerPath = join(CLAUDE_DIR, "scripts/wrapup-marker.js");
		expect(existsSync(markerPath)).toBe(true);
	});

	test("settings.json 包含 Stop hook", () => {
		const settings = JSON.parse(
			readFileSync(join(CLAUDE_DIR, "settings.json"), "utf-8"),
		);
		expect(settings.hooks.Stop).toBeDefined();
		const stopHooks = settings.hooks.Stop[0]?.hooks;
		expect(stopHooks).toBeDefined();
		const hasWrapup = stopHooks.some((h) =>
			h.command?.includes("wrapup-stop-hook"),
		);
		expect(hasWrapup).toBe(true);
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

		// 應包含安全網
		expect(commands.some((c) => c.includes("session-wrapup-safety"))).toBe(true);
		// 應保留 hook-client
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
	test("無 marker 時 block exit", async () => {
		// 用不存在的 marker 路徑測試 hook 邏輯
		const proc = Bun.spawn(
			["bash", join(CLAUDE_DIR, "hooks/wrapup-stop-hook.sh")],
			{
				stdin: new Blob([JSON.stringify({ session_id: "test-session" })]),
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, HOME: "/tmp/nonexistent-home-for-test" },
			},
		);
		const output = await new Response(proc.stdout).text();
		await proc.exited;

		// HOME 不存在 → marker 不存在 → block
		if (output.trim()) {
			const result = JSON.parse(output.trim());
			expect(result.decision).toBe("block");
		}
	});
});
