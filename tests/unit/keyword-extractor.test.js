// ADR-013 Phase 1 T1 test (3 case)
// 對齊 spec/進行中/adr-013-phase-1-mvp.md §T1
//
// Round 3 Issue 3: quoted-keyword 反向驗證（lib 本身不區分語義，
// 但 caller/T3 需能判斷 — 此 test 驗證 lib 回 index，caller 可據此判斷 context）

import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";

const { extractKeywords } = await import(join(homedir(), ".claude/scripts/lib/keyword-extractor.js"));

describe("keyword-extractor — ADR-013 Phase 1 T1", () => {
	it("normal match: 反思根因文字觸發 keyword", () => {
		const text = "本 session 第 4 次 canonical-verification dogfood 仍漏寫 incident";
		const patterns = [
			{ id: "Nth-time", pattern: "第 \\d+ 次" },
			{ id: "dogfood", pattern: "dogfood" },
		];
		const results = extractKeywords(text, patterns);
		expect(results.length).toBeGreaterThanOrEqual(2);
		expect(results.some((r) => r.id === "Nth-time")).toBe(true);
		expect(results.some((r) => r.id === "dogfood")).toBe(true);
	});

	it("反向：quoted-keyword 在字串 literal 內（lib 仍 match，但提供 index 供 caller 判斷 context）", () => {
		// lib 語義：不區分「根因」vs「引用其他討論」，但回 index 讓 caller 後處理
		const text = 'spec 討論提到 "第 5 次" 的可能性（非當輪實際發生）';
		const patterns = [{ id: "Nth-time", pattern: "第 \\d+ 次" }];
		const results = extractKeywords(text, patterns);
		expect(results.length).toBe(1); // lib 仍 match
		expect(typeof results[0].index).toBe("number"); // 但有 index
		expect(results[0].index).toBeGreaterThan(0);
		// caller（T3）可用 text[index - 1] 判斷是否在引號內
		const char_before = text[results[0].index - 1];
		expect(char_before).toBe('"'); // 驗證 caller 可抓 context
	});

	it("邊界：empty patterns / empty text 不 crash", () => {
		expect(extractKeywords("", [{ id: "x", pattern: "foo" }])).toEqual([]);
		expect(extractKeywords("foo bar", [])).toEqual([]);
		expect(extractKeywords("foo", null)).toEqual([]);
		expect(extractKeywords(null, [{ id: "x", pattern: "foo" }])).toEqual([]);
	});
});
