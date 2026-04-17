// self-dispatch-canary.test.js — silent regression canary (P1 xd-1776390260599-jdwg)
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MODULE = join(homedir(), ".claude/hooks/modules/self-dispatch-canary.js");
const HOOK_CLIENT = join(homedir(), ".claude/hooks/hook-client.js");

const { analyzeCanaries, on } = await import(MODULE);

describe("self-dispatch-canary P1", () => {
	test("應該 export SessionStart handler", () => {
		expect(typeof on.SessionStart).toBe("function");
	});

	test("analyzeCanaries 空陣列 → rate=1 (無資料視為 healthy)", () => {
		const r = analyzeCanaries([]);
		expect(r.total).toBe(0);
		expect(r.rate).toBe(1);
		expect(r.consecutive_failed).toBe(0);
	});

	test("analyzeCanaries 全 completed → consecutive_failed=0", () => {
		const now = Date.now();
		const canaries = [
			{ createdAt: now - 1000, status: "completed" },
			{ createdAt: now - 2000, status: "completed" },
		];
		const r = analyzeCanaries(canaries);
		expect(r.closed).toBe(2);
		expect(r.consecutive_failed).toBe(0);
		expect(r.rate).toBe(1);
	});

	test("analyzeCanaries 最近 3 個 delivered → consecutive_failed=3 觸發 warning", () => {
		const now = Date.now();
		const canaries = [
			{ createdAt: now - 1000, status: "delivered" },
			{ createdAt: now - 2000, status: "delivered" },
			{ createdAt: now - 3000, status: "delivered" },
			{ createdAt: now - 4000, status: "completed" },
		];
		const r = analyzeCanaries(canaries);
		expect(r.consecutive_failed).toBe(3);
		expect(r.closed).toBe(1);
		expect(r.rate).toBe(0.25);
	});

	test("SessionStart consecutive_failed < 3 → 不發 warning", () => {
		// 無 env stub 真 curl，fetchRecentCanaries 回 [] → rate=1 → no warning
		const r = on.SessionStart({ cwd: "/tmp/nonexistent-test-cwd" });
		expect(r).toEqual({});
	});

	test("hook-client.js LOCAL_MODULES.SessionStart 含 self-dispatch-canary", () => {
		const src = readFileSync(HOOK_CLIENT, "utf-8");
		expect(src).toContain("self-dispatch-canary.js");
	});

	test("module 含 CANARY_PREFIX 標記讓 wrapup-guard / Manager 可 filter", () => {
		const src = readFileSync(MODULE, "utf-8");
		expect(src).toContain("[canary auto-test]");
	});

	test("sendCanary 是 detached spawn (不 block SessionStart)", () => {
		const src = readFileSync(MODULE, "utf-8");
		expect(src).toMatch(/detached:\s*true/);
		expect(src).toContain("spawn");
	});

	test("LOOKBACK 常數 = 6h", () => {
		const src = readFileSync(MODULE, "utf-8");
		expect(src).toMatch(/6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
	});

	test("warning systemMessage 指向 wrapup-guard.js + ns dispatch-transport.js", () => {
		const src = readFileSync(MODULE, "utf-8");
		expect(src).toContain("wrapup-guard.js");
		expect(src).toContain("dispatch-transport.js");
	});
});
