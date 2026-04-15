// owner-commit-discipline rule 存在性與核心內容鎖 (xd-1aur)
// 動機：2026-04-15 v0.5 event log owner 搶先 commit canonical 事件升級為 Nova 全域 rule
import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const RULE_PATH = join(homedir(), ".claude/rules/協作/owner-commit-discipline.md");

describe("rules/協作/owner-commit-discipline.md (xd-1aur)", () => {
	it("rule 檔存在", () => {
		expect(existsSync(RULE_PATH)).toBe(true);
	});

	const content = existsSync(RULE_PATH) ? readFileSync(RULE_PATH, "utf-8") : "";

	it("含核心禁令（搶先 commit canonical runtime contract）", () => {
		expect(content).toMatch(/MUST.*不得.*搶先\s*commit|禁.*搶先/);
		expect(content).toContain("canonical runtime contract");
	});

	it("含 runtime contract 定義（含 machine-readable config 界定）", () => {
		expect(content).toMatch(/machine-readable|白名單|schema/);
		expect(content).toMatch(/不含.*spec\/討論|不含.*CLAUDE\.md/);
	});

	it("含 passive accept N 小時時限（urgent/normal/low 分級）", () => {
		expect(content).toMatch(/urgent.*6|6.*urgent/);
		expect(content).toMatch(/normal.*24|24.*normal/);
		expect(content).toMatch(/low.*72|72.*low/);
	});

	it("禁「採納即 commit」+ 禁「scope authority 開脫」", () => {
		expect(content).toMatch(/⛔ NEVER.*採納即\s*commit/);
		expect(content).toMatch(/⛔ NEVER.*scope 內 authority|authority 給 commit 權不給時機權/);
	});

	it("含反例正例表 + 派生來源", () => {
		expect(content).toMatch(/反例.*正例|⛔.*✅/);
		expect(content).toMatch(/派生來源|2026-04-15/);
	});

	it("含例外條款（spec 文件 / 使用者明示 / 2-人討論）", () => {
		expect(content).toMatch(/純\s*spec|spec\s*文件/);
		expect(content).toMatch(/使用者明示/);
		expect(content).toMatch(/2-?人討論/);
	});

	it("行數 ≤ 50 符合 rule 行數治理", () => {
		const lines = content.split("\n").length;
		expect(lines).toBeLessThanOrEqual(50);
	});
});
