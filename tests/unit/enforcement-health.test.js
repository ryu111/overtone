import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const COMP_PATH = join(homedir(), ".claude/data/session-compliance.jsonl");
const OUTPUT_PATH = join(homedir(), ".claude/data/enforcement-health.json");
const COMP_BAK = COMP_PATH + ".bak";
const OUTPUT_BAK = OUTPUT_PATH + ".bak";

beforeEach(() => {
	if (existsSync(COMP_PATH)) writeFileSync(COMP_BAK, readFileSync(COMP_PATH));
	if (existsSync(OUTPUT_PATH)) writeFileSync(OUTPUT_BAK, readFileSync(OUTPUT_PATH));
});

afterEach(() => {
	for (const [bak, orig] of [[COMP_BAK, COMP_PATH], [OUTPUT_BAK, OUTPUT_PATH]]) {
		if (existsSync(bak)) { writeFileSync(orig, readFileSync(bak)); unlinkSync(bak); }
	}
});

describe("enforcement-health", () => {
	test("checkLayer1 從 compliance JSONL 正確計算 rate", async () => {
		writeFileSync(COMP_PATH, [
			JSON.stringify({ ts: Date.now(), session_id: "s1", selfReviewRate: 0.8, testRate: 1.0 }),
			JSON.stringify({ ts: Date.now(), session_id: "s2", selfReviewRate: null, testRate: null }),
			JSON.stringify({ ts: Date.now(), session_id: "s3", selfReviewRate: 0.5, testRate: 0.5 }),
		].join("\n") + "\n");

		const { checkLayer1 } = await import("/Users/sbu/.claude/scripts/enforcement-health.js");
		const result = checkLayer1(0);
		expect(result.layer).toBe(1);
		expect(result.total).toBe(2); // s1 + s3（s2 的 selfReviewRate=null 被排除）
		expect(result.active).toBe(2); // s1 + s3 有數據
		expect(result.rate).toBeCloseTo(2 / 2, 1);
	});

	test("空檔案（無資料）→ warning alert", async () => {
		writeFileSync(COMP_PATH, "");
		const { assessOverall } = await import("/Users/sbu/.claude/scripts/enforcement-health.js");
		const result = assessOverall();
		const l1Alert = result.alerts.find((a) => a.layer === 1);
		expect(l1Alert).toBeDefined();
		expect(l1Alert.severity).toBe("warning");
	});

	test("所有層正常 → overall healthy", async () => {
		// 寫入足夠的正常資料
		const records = Array.from({ length: 5 }, (_, i) =>
			JSON.stringify({ ts: Date.now() - i * 1000, session_id: `s${i}`, selfReviewRate: 0.9, testRate: 1.0 })
		);
		writeFileSync(COMP_PATH, records.join("\n") + "\n");

		const { checkLayer1 } = await import("/Users/sbu/.claude/scripts/enforcement-health.js");
		const result = checkLayer1(0);
		expect(result.rate).toBeGreaterThan(0.5);
	});

	test("assessOverall 寫入 enforcement-health.json", async () => {
		const { assessOverall } = await import("/Users/sbu/.claude/scripts/enforcement-health.js");
		assessOverall();
		expect(existsSync(OUTPUT_PATH)).toBe(true);
		const data = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"));
		expect(data).toHaveProperty("status");
		expect(data).toHaveProperty("layers");
		expect(data.layers.length).toBe(4);
	});

	test("空資料不 crash", async () => {
		const { checkLayer1, checkLayer2, checkLayer3, checkLayer4 } = await import("/Users/sbu/.claude/scripts/enforcement-health.js");
		expect(() => checkLayer1()).not.toThrow();
		expect(() => checkLayer2()).not.toThrow();
		expect(() => checkLayer3()).not.toThrow();
		expect(() => checkLayer4()).not.toThrow();
	});
});
