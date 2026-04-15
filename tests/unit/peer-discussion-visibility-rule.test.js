// peer-discussion-visibility rule 存在性與核心內容鎖 (xd-aado)
// 動機：2026-04-15 hub-and-spoke 反模式事件升級為 Nova 全域 rule
import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const RULE_PATH = join(homedir(), ".claude/rules/協作/peer-discussion-visibility.md");

describe("rules/協作/peer-discussion-visibility.md (xd-aado)", () => {
	it("rule 檔存在", () => {
		expect(existsSync(RULE_PATH)).toBe(true);
	});

	const content = existsSync(RULE_PATH) ? readFileSync(RULE_PATH, "utf-8") : "";

	it("含 peer visibility 核心條款", () => {
		expect(content).toContain("peer visibility");
		expect(content).toMatch(/Round 1 原文/);
		expect(content).toMatch(/直接\s*cross-dispatch\s*對方|peer dispatch/);
	});

	it("禁 Manager hub-and-spoke 獨裁", () => {
		expect(content).toContain("hub-and-spoke");
		expect(content).toMatch(/Manager.*獨裁|Manager.*不是 judge|moderator/);
		expect(content).toMatch(/⛔ NEVER Manager.*未收齊.*裁決|non-authoritative/);
	});

	it("含死鎖升級條款（3 輪無新資訊）", () => {
		expect(content).toMatch(/3\s*輪.*無新資訊|升級使用者/);
	});

	it("含 Manager 撤銷裁決權（事後發現反模式）", () => {
		expect(content).toMatch(/撤銷.*裁決|主動撤銷/);
	});

	it("例外含 trivial / 2-人討論可省", () => {
		expect(content).toContain("trivial");
		expect(content).toMatch(/2-?人|兩方/);
	});

	it("行數 ≤ 50 符合 rule 行數治理", () => {
		const lines = content.split("\n").length;
		expect(lines).toBeLessThanOrEqual(50);
	});
});
