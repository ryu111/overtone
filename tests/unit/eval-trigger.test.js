import { describe, it, expect } from "bun:test";
import { evaluatePostEdit, isWatchedFile, on } from "../../../../.claude/hooks/modules/eval-trigger.js";
import { homedir } from "node:os";
import { join } from "node:path";

const CLAUDE = join(homedir(), ".claude");

describe("eval-trigger: isWatchedFile", () => {
	it("rules/ 下檔案 → watched", () => {
		expect(isWatchedFile(join(CLAUDE, "rules/核心/x.md"))).toBe(true);
	});

	it("skills/ 下 SKILL.md → watched", () => {
		expect(isWatchedFile(join(CLAUDE, "skills/auto/SKILL.md"))).toBe(true);
	});

	it("hooks/modules/ 下 .js → watched", () => {
		expect(isWatchedFile(join(CLAUDE, "hooks/modules/guards.js"))).toBe(true);
	});

	it("~/.claude/projects/ → NOT watched（per-session 資料非全域元件）", () => {
		expect(isWatchedFile(join(CLAUDE, "projects/x/memory/y.md"))).toBe(false);
	});

	it("非 ~/.claude/ 路徑 → NOT watched", () => {
		expect(isWatchedFile("/Users/x/projects/nova-server/src/a.js")).toBe(false);
	});

	it("空值 → NOT watched", () => {
		expect(isWatchedFile("")).toBe(false);
		expect(isWatchedFile(null)).toBe(false);
	});
});

describe("eval-trigger: evaluatePostEdit handler", () => {
	it("非 Edit/Write/MultiEdit → allow，不 spawn", () => {
		const r = evaluatePostEdit({ tool_name: "Bash", tool_input: { command: "ls" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});

	it("Edit 但檔案不在 watched 目錄 → allow，不 spawn", () => {
		const r = evaluatePostEdit({
			tool_name: "Edit",
			tool_input: { file_path: "/tmp/unrelated.js" },
		});
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});

	it("Edit watched 檔案 → allow（spawn 是背景 best-effort）", () => {
		const r = evaluatePostEdit({
			tool_name: "Edit",
			tool_input: { file_path: join(CLAUDE, "rules/x.md") },
		});
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});

	it("fail-open：null input → allow 不 throw", () => {
		expect(() => evaluatePostEdit(null)).not.toThrow();
		expect(evaluatePostEdit(null).hookSpecificOutput.permissionDecision).toBe("allow");
	});

	it("on.PostToolUse 與 evaluatePostEdit 為同函式", () => {
		expect(on.PostToolUse).toBe(evaluatePostEdit);
	});
});
