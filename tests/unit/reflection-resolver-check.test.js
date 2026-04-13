import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	loadRecent,
	detectBacklog,
	checkResolverBacklog,
} from "../../../../.claude/hooks/modules/reflection-resolver-check.js";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpCwd;
beforeEach(() => {
	tmpCwd = mkdtempSync(join(tmpdir(), "rbacklog-"));
	mkdirSync(join(tmpCwd, "data"), { recursive: true });
});
afterEach(() => { try { rmSync(tmpCwd, { recursive: true, force: true }); } catch {} });

function writeReflections(entries) {
	writeFileSync(join(tmpCwd, "data/reflections.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

describe("detectBacklog", () => {
	const now = Date.parse("2026-04-13T10:00:00Z");
	const oldTs = "2026-04-12T00:00:00Z"; // 34h 前
	const freshTs = "2026-04-13T09:30:00Z"; // 30 分前

	it("≤ 5 筆 unresolved → null", () => {
		const reflections = Array.from({ length: 5 }, () => ({ ts: oldTs, resolved_at: null }));
		expect(detectBacklog(reflections, now)).toBeNull();
	});

	it("> 5 筆 unresolved 但最舊 < 24h → null", () => {
		const reflections = Array.from({ length: 6 }, () => ({ ts: freshTs, resolved_at: null }));
		expect(detectBacklog(reflections, now)).toBeNull();
	});

	it("> 5 筆 unresolved + 最舊 > 24h → warn", () => {
		const reflections = [
			{ ts: oldTs, resolved_at: null },
			{ ts: oldTs, resolved_at: null },
			{ ts: freshTs, resolved_at: null },
			{ ts: freshTs, resolved_at: null },
			{ ts: freshTs, resolved_at: null },
			{ ts: freshTs, resolved_at: null },
		];
		const r = detectBacklog(reflections, now);
		expect(r).not.toBeNull();
		expect(r.unresolved).toBe(6);
		expect(r.message).toContain("積壓");
	});

	it("有 resolved 的不計入", () => {
		const reflections = [
			{ ts: oldTs, resolved_at: "2026-04-13T00:00:00Z" }, // 已解決
			{ ts: oldTs, resolved_at: "2026-04-13T00:00:00Z" },
			{ ts: oldTs, resolved_at: null },
			{ ts: freshTs, resolved_at: null },
			{ ts: freshTs, resolved_at: null },
		];
		expect(detectBacklog(reflections, now)).toBeNull(); // 只 3 筆 unresolved ≤ 5
	});

	it("非陣列 → null", () => {
		expect(detectBacklog(null)).toBeNull();
		expect(detectBacklog(undefined)).toBeNull();
	});
});

describe("loadRecent", () => {
	it("讀最後 10 筆（新到舊）", () => {
		writeReflections(Array.from({ length: 15 }, (_, i) => ({ ts: `t${i}`, resolved_at: null })));
		const r = loadRecent(tmpCwd, 10);
		expect(r.length).toBe(10);
	});

	it("檔案不存在 → []", () => {
		expect(loadRecent("/nonexistent")).toEqual([]);
	});
});

describe("checkResolverBacklog handler", () => {
	const oldTs = "2026-04-12T00:00:00Z";
	const now = Date.parse("2026-04-13T10:00:00Z");

	it("無 cwd → allow", () => {
		expect(checkResolverBacklog({}).decision).toBe("allow");
	});

	it("無檔 → allow", () => {
		expect(checkResolverBacklog({ cwd: tmpCwd }).decision).toBe("allow");
	});

	it("積壓 → allow + systemMessage", () => {
		writeReflections(Array.from({ length: 7 }, () => ({ ts: oldTs, resolved_at: null })));
		const r = checkResolverBacklog({ cwd: tmpCwd }, { now });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toContain("積壓");
	});
});
