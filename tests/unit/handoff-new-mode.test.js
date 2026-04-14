// handoff new mode 靜態測試（xd-izqa/4qcv Round 4）
// slash command trigger 行為是 runtime integration，不在 unit test scope
// 只驗證 handoff.md 和 self-compact.js 的契約存在

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HANDOFF_MD = join(homedir(), ".claude/commands/handoff.md");
const SELF_COMPACT = join(homedir(), ".claude/scripts/self-compact.js");

describe("handoff new mode 契約（xd-izqa Round 4）", () => {
	const handoffContent = readFileSync(HANDOFF_MD, "utf-8");
	const selfCompactContent = readFileSync(SELF_COMPACT, "utf-8");

	it("handoff.md 含 $ARGUMENTS 分支語意（compact vs clear）", () => {
		expect(handoffContent).toContain("$ARGUMENTS");
		expect(handoffContent).toContain("/handoff new");
		expect(handoffContent).toContain("clear mode");
		expect(handoffContent).toContain("compact mode");
	});

	it("handoff.md 指示 clear mode 走 --mode=clear flag", () => {
		expect(handoffContent).toContain("--mode=clear");
	});

	it("self-compact.js 解析 --mode=clear argv flag", () => {
		expect(selfCompactContent).toContain("process.argv.includes(\"--mode=clear\")");
		expect(selfCompactContent).toContain("MODE_CLEAR");
	});

	it("self-compact.js clear mode 走 PreCompact hook + /clear 分支", () => {
		// clear mode 分支必須在 /compact 送出前短路退出
		expect(selfCompactContent).toMatch(/if\s*\(\s*MODE_CLEAR\s*\)/);
		expect(selfCompactContent).toContain("hook-client.js");
		expect(selfCompactContent).toContain('send("/clear")');
	});

	it("self-compact.js clear mode commit message 含 symmetry 推論註解", () => {
		// 確保未來有人看 source 能追溯為何沒做 P0 empirical
		expect(selfCompactContent).toMatch(/symmetry|悖論|self-clear/);
	});

	it("self-compact.js clear mode continuation prompt 指向 handoff 檔", () => {
		expect(selfCompactContent).toContain("/tmp/nova-handoff-${project}.md");
	});

	it("handoff.md warn 提示不要直接對話中送 /compact 或 /clear", () => {
		expect(handoffContent).toContain("不要直接在對話中送");
	});
});
