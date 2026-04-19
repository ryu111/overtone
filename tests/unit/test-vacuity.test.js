// test-vacuity.test.js — Vacuity 軸自動標記（斷鏈 3 修復 2026-04-20）
//
// 動機：regression-prevention skill 定義 arch test 三軸（vacuity / coverage /
// redundancy），vacuity = 「測試什麼都不測」的無效斷言。此前無自動掃描 →
// 無用測試持續累積。使用者 mental model：收尾 = 刪無用測試 = 避免熵累積。
//
// 範圍：~/projects/nova-brain/tests/ 下所有 *.test.{js,ts}
// 消費者：scripts/converge.js（寫 /tmp/nova-vacuity-candidates.json）+ 本 test fail
//
// 策略：第一版 exempt-list 鎖當前 baseline（避免一次性大量清理），新增 vacuity
// 必 fail。清理減量由 converge phase 下一 iter 消化。

import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";

const TEST_ROOT = join(homedir(), "projects/nova-brain/tests");
const VACUITY_PATTERNS = [
	{ name: "true-toBe-true", re: /expect\(\s*true\s*\)\s*\.\s*toBe\(\s*true\s*\)/ },
	{ name: "1-toBe-1", re: /expect\(\s*1\s*\)\s*\.\s*toBe\(\s*1\s*\)/ },
	{ name: "empty-toEqual-empty", re: /expect\(\s*\{\s*\}\s*\)\s*\.\s*toEqual\(\s*\{\s*\}\s*\)/ },
];

// Baseline exempt — 當前已有 vacuity test 容許清單（2026-04-20 snapshot）
// converge phase 消化後從此清單移除。新增 vacuity 禁止加入此清單。
const EXEMPT = new Set([
	// guards.test.js line 218：`expect(1).toBe(1)` 出現在字串 literal 內部
	// 作為 evaluateEdit 的 tool_input content 模擬 — 非真斷言。
	"unit/guards.test.js",
]);

function walk(dir, cb) {
	for (const entry of readdirSync(dir)) {
		if (entry.startsWith(".") || entry === "node_modules") continue;
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) walk(full, cb);
		else if (/\.test\.(js|ts)$/.test(entry)) cb(full);
	}
}

function scanVacuity() {
	const candidates = [];
	walk(TEST_ROOT, (file) => {
		// skip self — 本檔含 regex 字串易自指
		if (file.endsWith("test-vacuity.test.js")) return;
		const rel = relative(TEST_ROOT, file);
		if (EXEMPT.has(rel)) return;
		const content = readFileSync(file, "utf-8");
		for (const { name, re } of VACUITY_PATTERNS) {
			if (re.test(content)) {
				candidates.push({ file: rel, pattern: name });
				break;
			}
		}
	});
	return candidates;
}

describe("Test Vacuity 軸（斷鏈 3）", () => {
	it("nova-brain tests/ 無 vacuity 斷言（常數 expect，exempt 外）", () => {
		const candidates = scanVacuity();
		if (candidates.length > 0) {
			console.warn(
				"[vacuity] 發現候選，converge phase 將列入 convergence-report：\n" +
					JSON.stringify(candidates, null, 2),
			);
		}
		expect(candidates.length).toBe(0);
	});
});
