// ralph-iter-scorer — PRMs 每 iter 自評分 baseline
// 派生：obsidian/semantic/external-references/ai-reflection-patterns-2026.md

import { describe, test, expect, beforeEach } from "bun:test";
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync, appendFileSync } from "node:fs";
import {
	getIteration,
	computeScore,
	checkConsecutiveLow,
	scoreIteration,
	lastReflectionHasExternal,
} from "../../../../.claude/hooks/modules/ralph-iter-scorer.js";

const TMPDIR = "/tmp/ralph-iter-scorer-test";

beforeEach(() => {
	if (existsSync(TMPDIR)) rmSync(TMPDIR, { recursive: true });
	mkdirSync(`${TMPDIR}/.claude`, { recursive: true });
	mkdirSync(`${TMPDIR}/data`, { recursive: true });
});

describe("computeScore — PRMs 公式", () => {
	test("base 50 + 無加分 → 50", () => {
		expect(computeScore({ commitCount: 0, hasExternal: false, testPass: false })).toBe(50);
	});
	test("3 commit + 外部研究 + test pass → 100 上限", () => {
		expect(computeScore({ commitCount: 3, hasExternal: true, testPass: true })).toBe(100);
	});
	test("10 commit × 10 max +30（不無限加分）", () => {
		expect(computeScore({ commitCount: 10, hasExternal: false, testPass: false })).toBe(80);
	});
	test("分數下限 0，上限 100", () => {
		expect(computeScore({ commitCount: -99, hasExternal: false, testPass: false })).toBe(50);
		expect(computeScore({ commitCount: 999, hasExternal: true, testPass: true })).toBe(100);
	});
});

describe("getIteration", () => {
	test("讀 ralph-loop.local.md iteration", () => {
		writeFileSync(`${TMPDIR}/.claude/ralph-loop.local.md`, "---\niteration: 7\n---\n");
		expect(getIteration(TMPDIR)).toBe(7);
	});
	test("檔案不存在回 null", () => {
		expect(getIteration("/tmp/nonexistent-scorer")).toBeNull();
	});
});

describe("lastReflectionHasExternal", () => {
	test("最後一筆含 外部研究 array → true", () => {
		const entry = { ts: "2026-04-19T10:00:00Z", 結論: ["c"], 行動: ["x"], 外部研究: [{ topic: "t", insight: "i" }] };
		appendFileSync(`${TMPDIR}/data/reflections.jsonl`, `${JSON.stringify(entry)}\n`);
		expect(lastReflectionHasExternal(TMPDIR)).toBe(true);
	});
	test("最後一筆行動含 external-references path → true", () => {
		const entry = { ts: "2026-04-19T10:00:00Z", 結論: ["c"], 行動: ["寫 external-references/foo.md"] };
		appendFileSync(`${TMPDIR}/data/reflections.jsonl`, `${JSON.stringify(entry)}\n`);
		expect(lastReflectionHasExternal(TMPDIR)).toBe(true);
	});
	test("無外部研究 → false", () => {
		const entry = { ts: "2026-04-19T10:00:00Z", 結論: ["c"], 行動: ["commit abc1234"] };
		appendFileSync(`${TMPDIR}/data/reflections.jsonl`, `${JSON.stringify(entry)}\n`);
		expect(lastReflectionHasExternal(TMPDIR)).toBe(false);
	});
	test("反思檔不存在 → false", () => {
		expect(lastReflectionHasExternal(TMPDIR)).toBe(false);
	});
});

describe("checkConsecutiveLow", () => {
	test("近 3 筆都 < 50 → true", () => {
		const lines = [40, 30, 45].map((s) => JSON.stringify({ ts: "2026-04-19T10:00:00Z", iter: 1, score: s })).join("\n");
		writeFileSync(`${TMPDIR}/data/iter-scores.jsonl`, lines + "\n");
		expect(checkConsecutiveLow(TMPDIR)).toBe(true);
	});
	test("近 3 筆至少 1 個 >= 50 → false", () => {
		const lines = [40, 60, 30].map((s) => JSON.stringify({ ts: "2026-04-19T10:00:00Z", iter: 1, score: s })).join("\n");
		writeFileSync(`${TMPDIR}/data/iter-scores.jsonl`, lines + "\n");
		expect(checkConsecutiveLow(TMPDIR)).toBe(false);
	});
	test("樣本不足 (< 3) → false", () => {
		writeFileSync(`${TMPDIR}/data/iter-scores.jsonl`, JSON.stringify({ score: 10 }) + "\n");
		expect(checkConsecutiveLow(TMPDIR)).toBe(false);
	});
});

describe("scoreIteration 整合", () => {
	test("非 ralph-loop 中（無 state 檔）回 null", () => {
		expect(scoreIteration({ cwd: TMPDIR })).toBeNull();
	});
	test("ralph-loop 中寫入 iter-scores.jsonl", () => {
		writeFileSync(`${TMPDIR}/.claude/ralph-loop.local.md`, "---\niteration: 2\n---\n");
		scoreIteration({ cwd: TMPDIR });
		expect(existsSync(`${TMPDIR}/data/iter-scores.jsonl`)).toBe(true);
		const c = readFileSync(`${TMPDIR}/data/iter-scores.jsonl`, "utf-8");
		expect(c).toContain('"iter":2');
		expect(c).toContain('"score"');
	});
	test("連續 3 iter 低分 → emit warn", () => {
		writeFileSync(`${TMPDIR}/.claude/ralph-loop.local.md`, "---\niteration: 5\n---\n");
		const low = [40, 45, 30].map((s) => JSON.stringify({ ts: "2026-04-19T10:00:00Z", iter: 1, score: s })).join("\n");
		writeFileSync(`${TMPDIR}/data/iter-scores.jsonl`, low + "\n");
		const r = scoreIteration({ cwd: TMPDIR });
		expect(r?.hookSpecificOutput?.additionalContext).toContain("ralph-iter-scorer");
	});
	test("缺 cwd 不 crash", () => {
		expect(() => scoreIteration({})).not.toThrow();
		expect(scoreIteration({})).toBeNull();
	});
	test("hook-client.js LOCAL_MODULES 有註冊", () => {
		const fs = require("node:fs");
		const os = require("node:os");
		const content = fs.readFileSync(`${os.homedir()}/.claude/hooks/hook-client.js`, "utf-8");
		expect(content).toContain("ralph-iter-scorer.js");
	});
});
