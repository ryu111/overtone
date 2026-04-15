// xd-gbgv P2: core_objective reminder 3 case
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
const { checkCoreObjective } = await import(join(homedir(), ".claude/hooks/modules/core-objective-reminder.js"));

let tmp;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "co-reminder-")); });
afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

describe("core-objective-reminder (xd-gbgv P2)", () => {
	it("無 CLAUDE.md → systemMessage 提醒", () => {
		const r = checkCoreObjective({ cwd: tmp });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toMatch(/CLAUDE\.md/);
	});

	it("有 CLAUDE.md 但缺 core_objective → systemMessage 提醒", () => {
		writeFileSync(join(tmp, "CLAUDE.md"), "# Project\n隨便寫些內容\n");
		const r = checkCoreObjective({ cwd: tmp });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toMatch(/core_objective/);
	});

	it("有 CLAUDE.md 且含 core_objective → 不提醒", () => {
		writeFileSync(join(tmp, "CLAUDE.md"), "# Project\ncore_objective: 某目標\nnon_negotiables: ...");
		const r = checkCoreObjective({ cwd: tmp });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toBeUndefined();
	});
});
