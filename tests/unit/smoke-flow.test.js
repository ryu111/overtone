import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const RESULT_PATH = "/tmp/nova-flow-health.json";
const RESULT_BACKUP = "/tmp/nova-flow-health.json.bak";

beforeEach(() => {
	if (existsSync(RESULT_PATH)) writeFileSync(RESULT_BACKUP, readFileSync(RESULT_PATH));
});

afterEach(() => {
	if (existsSync(RESULT_BACKUP)) {
		writeFileSync(RESULT_PATH, readFileSync(RESULT_BACKUP));
		unlinkSync(RESULT_BACKUP);
	}
});

describe("smoke-flow", () => {
	test("runCheckpoints 回傳 10 個 checkpoint", async () => {
		const { runCheckpoints } = await import("/Users/sbu/.claude/scripts/smoke-flow.js");
		const result = await runCheckpoints(false);
		expect(result.checkpoints.length).toBe(10);
		expect(result).toHaveProperty("passed");
		expect(result).toHaveProperty("total");
		expect(result).toHaveProperty("score");
		expect(result.total).toBe(10);
	});

	test("flow-health 分數計算正確", async () => {
		const { runCheckpoints } = await import("/Users/sbu/.claude/scripts/smoke-flow.js");
		const result = await runCheckpoints(false);
		expect(result.passed).toBeGreaterThanOrEqual(0);
		expect(result.passed).toBeLessThanOrEqual(10);
		expect(result.score).toBe(`${result.passed}/${result.total}`);
	});

	test("結果寫入 /tmp/nova-flow-health.json", async () => {
		const { runCheckpoints } = await import("/Users/sbu/.claude/scripts/smoke-flow.js");
		await runCheckpoints(false);
		expect(existsSync(RESULT_PATH)).toBe(true);
		const onDisk = JSON.parse(readFileSync(RESULT_PATH, "utf-8"));
		expect(onDisk).toHaveProperty("score");
		expect(onDisk).toHaveProperty("checkpoints");
	});
});

describe("trace-flow", () => {
	test("traceFlow 回傳 summary + events", async () => {
		const { traceFlow } = await import("/Users/sbu/.claude/scripts/trace-flow.js");
		const result = traceFlow(Date.now() - 24 * 60 * 60 * 1000);
		expect(result).toHaveProperty("summary");
		expect(result).toHaveProperty("events");
		expect(result).toHaveProperty("breakpoints");
		expect(Array.isArray(result.events)).toBe(true);
	});

	test("events 按時間排序", async () => {
		const { traceFlow } = await import("/Users/sbu/.claude/scripts/trace-flow.js");
		const result = traceFlow(0);
		for (let i = 1; i < result.events.length; i++) {
			expect(result.events[i].ts).toBeGreaterThanOrEqual(result.events[i - 1].ts);
		}
	});

	test("空資料不 crash", async () => {
		const { traceFlow } = await import("/Users/sbu/.claude/scripts/trace-flow.js");
		// 用未來時間確保所有資料都被過濾掉
		const result = traceFlow(Date.now() + 999999999);
		expect(result.events.length).toBe(0);
	});
});
