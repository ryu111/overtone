import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const { loadPerProjectReflections, computePerProjectResolvedRate } = await import(
	`${homedir()}/.claude/scripts/feedback-audit-health.js`
);

function makeProject(root, name, entries) {
	const dir = join(root, name, "data");
	mkdirSync(dir, { recursive: true });
	const content = entries.map((e) => JSON.stringify(e)).join("\n");
	writeFileSync(join(dir, "reflections.jsonl"), content + (content ? "\n" : ""));
}

describe("feedback-audit-health per-project extension", () => {
	let tmp;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "nb-f3-"));
		makeProject(tmp, "alpha", [
			{ ts: 1, trigger_type: "correction", resolved_at: "2026-04-16T10:00:00Z" },
			{ ts: 2, trigger_type: "autonomous", resolved_at: null },
			{ ts: 3, trigger_type: "scheduled", resolved_at: "2026-04-17T10:00:00Z" },
		]);
		makeProject(tmp, "beta", [
			{ ts: 1, trigger_type: "correction", resolved_at: null },
		]);
		makeProject(tmp, "gamma", []);
	});

	afterEach(() => {
		try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
	});

	test("應該列出所有含 data/reflections.jsonl 的專案", () => {
		const rates = computePerProjectResolvedRate(tmp);
		const names = rates.map((r) => r.project).sort();
		expect(names).toEqual(["alpha", "beta", "gamma"]);
	});

	test("alpha 2 個 resolved / 3 個 total → rate 0.667", () => {
		const rates = computePerProjectResolvedRate(tmp);
		const alpha = rates.find((r) => r.project === "alpha");
		expect(alpha.total).toBe(3);
		expect(alpha.resolved).toBe(2);
		expect(alpha.rate).toBeCloseTo(0.667, 2);
		expect(alpha.last_resolved_at).toBe("2026-04-17T10:00:00Z");
	});

	test("beta 無 resolved → rate 0 且 last_resolved_at null", () => {
		const rates = computePerProjectResolvedRate(tmp);
		const beta = rates.find((r) => r.project === "beta");
		expect(beta.total).toBe(1);
		expect(beta.resolved).toBe(0);
		expect(beta.rate).toBe(0);
		expect(beta.last_resolved_at).toBeNull();
	});

	test("gamma 空 jsonl → total=0 且不 crash", () => {
		const rates = computePerProjectResolvedRate(tmp);
		const gamma = rates.find((r) => r.project === "gamma");
		expect(gamma.total).toBe(0);
		expect(gamma.rate).toBe(0);
	});

	test("loadPerProjectReflections 應該正確載入 entries", () => {
		const data = loadPerProjectReflections(tmp);
		const alpha = data.find((p) => p.project === "alpha");
		expect(alpha.entries.length).toBe(3);
		expect(alpha.entries[0].trigger_type).toBe("correction");
	});

	test("空目錄應該回空陣列", () => {
		const empty = mkdtempSync(join(tmpdir(), "nb-f3-empty-"));
		try {
			const rates = computePerProjectResolvedRate(empty);
			expect(rates).toEqual([]);
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});
});
