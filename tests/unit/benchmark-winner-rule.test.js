// benchmark-winner-selection rule 存在性與核心內容鎖 (xd-lzhn)
// lb Phase B 連續 2 次 class bug 升級為 Nova 全域 rule，本 test 鎖定 rule 存在 + 核心 4 步 + 3 NEVER 條款不可刪。
import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const RULE_PATH = join(homedir(), ".claude/rules/品質/benchmark-winner-selection.md");

describe("rules/品質/benchmark-winner-selection.md (xd-lzhn)", () => {
	it("rule 檔存在", () => {
		expect(existsSync(RULE_PATH)).toBe(true);
	});

	const content = existsSync(RULE_PATH) ? readFileSync(RULE_PATH, "utf-8") : "";

	it("含 Pareto 4 步條款", () => {
		expect(content).toContain("GROUP BY domain");
		expect(content).toMatch(/max\(score\)/);
		expect(content).toMatch(/min\(secondary_metric\)|min\(latency/);
		expect(content).toMatch(/角色|role/);
	});

	it("含 3 條 NEVER 禁忌（argmax / combo_name 模糊 / 跨 domain 平均）", () => {
		const neverLines = content.split("\n").filter((l) => l.includes("⛔ NEVER"));
		expect(neverLines.length).toBeGreaterThanOrEqual(3);
		expect(content).toMatch(/argmax/);
		expect(content).toMatch(/combo_name/);
		expect(content).toMatch(/跨 domain 平均/);
	});

	it("含派生來源指向 lb phase-b-reflection", () => {
		expect(content).toContain("phase-b-reflection.md");
	});

	it("行數 ≤ 50 符合 rule 行數治理", () => {
		const lines = content.split("\n").length;
		expect(lines).toBeLessThanOrEqual(50);
	});
});
