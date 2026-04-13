import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	readRecentReflections,
	triggerPrefix,
	detectFatigue,
	checkReflectionFatigue,
} from "../../../../.claude/hooks/modules/reflection-counter.js";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpCwd;
beforeEach(() => {
	tmpCwd = mkdtempSync(join(tmpdir(), "rcounter-"));
	mkdirSync(join(tmpCwd, "data"), { recursive: true });
});
afterEach(() => { try { rmSync(tmpCwd, { recursive: true, force: true }); } catch {} });

function writeReflections(entries) {
	const path = join(tmpCwd, "data/reflections.jsonl");
	writeFileSync(path, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

describe("triggerPrefix", () => {
	it("取前 10 字元", () => {
		expect(triggerPrefix("這是一個很長的 trigger 訊息")).toBe("這是一個很長的 tr");
	});
	it("短字串原樣", () => {
		expect(triggerPrefix("abc")).toBe("abc");
	});
	it("空值回空字串", () => {
		expect(triggerPrefix(null)).toBe("");
		expect(triggerPrefix("")).toBe("");
	});
});

describe("readRecentReflections", () => {
	it("讀最後 N 筆（新到舊反轉回新到舊）", () => {
		writeReflections([
			{ ts: "t1", trigger: "A", 行動: ["x"] },
			{ ts: "t2", trigger: "B", 行動: [] },
			{ ts: "t3", trigger: "C", 行動: [] },
		]);
		const r = readRecentReflections(tmpCwd, 5);
		expect(r.length).toBe(3);
		expect(r[r.length - 1].ts).toBe("t3");
	});

	it("max 限制", () => {
		writeReflections(Array.from({ length: 10 }, (_, i) => ({ ts: `t${i}`, trigger: "A", 行動: ["x"] })));
		expect(readRecentReflections(tmpCwd, 3).length).toBe(3);
	});

	it("檔案不存在 → []", () => {
		expect(readRecentReflections("/nonexistent")).toEqual([]);
	});

	it("壞 JSON 行跳過", () => {
		writeFileSync(join(tmpCwd, "data/reflections.jsonl"), "bad json\n" + JSON.stringify({ ts: "t1", trigger: "A", 行動: ["x"] }) + "\n");
		const r = readRecentReflections(tmpCwd);
		expect(r.length).toBe(1);
	});
});

describe("detectFatigue", () => {
	it("連續 2 筆同前綴 + 空行動 → warn", () => {
		const r = detectFatigue([
			{ trigger: "Manager 又", 行動: [] },
			{ trigger: "Manager 又", 行動: [] },
		]);
		expect(r).not.toBeNull();
		expect(r.count).toBe(2);
	});

	it("連續但不同 trigger prefix → 不 warn", () => {
		const r = detectFatigue([
			{ trigger: "AAA 不同問題", 行動: [] },
			{ trigger: "BBB 另個問題", 行動: [] },
		]);
		expect(r).toBeNull();
	});

	it("最後一筆有行動 → 不 warn", () => {
		const r = detectFatigue([
			{ trigger: "Manager 又", 行動: [] },
			{ trigger: "Manager 又", 行動: ["commit abc"] },
		]);
		expect(r).toBeNull();
	});

	it("<2 筆 → 不 warn", () => {
		expect(detectFatigue([{ trigger: "a", 行動: [] }])).toBeNull();
		expect(detectFatigue([])).toBeNull();
	});

	it("非陣列 → null", () => {
		expect(detectFatigue(null)).toBeNull();
	});
});

describe("checkReflectionFatigue handler", () => {
	it("無 cwd → allow", () => {
		expect(checkReflectionFatigue({}).decision).toBe("allow");
	});

	it("無 reflections 檔 → allow", () => {
		expect(checkReflectionFatigue({ cwd: tmpCwd }).decision).toBe("allow");
	});

	it("觸發疲勞 → allow + systemMessage", () => {
		writeReflections([
			{ ts: "t1", trigger: "Manager 又", 行動: [] },
			{ ts: "t2", trigger: "Manager 又", 行動: [] },
		]);
		const r = checkReflectionFatigue({ cwd: tmpCwd });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toContain("反思疲勞");
	});
});
