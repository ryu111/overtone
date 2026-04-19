import { describe, it, expect } from "bun:test";
import {
	spawnBackground,
	stopBackgroundDispatch,
} from "../../../../.claude/hooks/modules/stop-background-spawner.js";

describe("spawnBackground", () => {
	it("script 不存在 → spawned:false", () => {
		const r = spawnBackground("/nonexistent/path/xyz.js");
		expect(r.spawned).toBe(false);
		expect(r.error).toContain("missing");
	});

	it("script 存在 → spawned:true + pid", () => {
		// 用已存在的 review-agent.js 測（dry-run 不影響）
		const r = spawnBackground("/Users/sbu/.claude/scripts/vault-self-heal.js", ["--dry-run"]);
		expect(r.spawned).toBe(true);
		expect(typeof r.pid).toBe("number");
		expect(r.logPath).toMatch(/^\/tmp\//);
	});
});

describe("stopBackgroundDispatch", () => {
	it("無 cwd → allow 不 throw", () => {
		const r = stopBackgroundDispatch({});
		expect(r.decision).toBe("allow");
	});

	it("有 cwd → allow（背景 spawn，不等結果）", () => {
		const r = stopBackgroundDispatch({ cwd: "/Users/sbu/.claude" });
		expect(r.decision).toBe("allow");
	});

	it("fail-open：異常 input 不 throw", () => {
		expect(() => stopBackgroundDispatch(null)).not.toThrow();
		expect(() => stopBackgroundDispatch({ cwd: 12345 })).not.toThrow();
	});
});
