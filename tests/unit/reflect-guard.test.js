import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { on } from "../../../../.claude/hooks/modules/reflect-guard.js";
import { _ws } from "../../../../.claude/hooks/modules/lib/workspace-state.js";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const handler = on.PostToolUse;
let tmpDir;

beforeEach(() => {
	for (const k of Object.keys(_ws)) delete _ws[k];
	tmpDir = mkdtempSync(join(tmpdir(), "reflect-guard-"));
});
afterEach(() => {
	try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe("reflect-guard: commit-without-test", () => {
	it("git commit + testRun=0 + 有 tests 目錄 → warn", () => {
		mkdirSync(join(tmpDir, "tests"), { recursive: true });
		writeFileSync(join(tmpDir, "package.json"), "{}");
		_ws.testRun = 0;
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "git commit -m 'fix bug'" },
			tool_result: { exitCode: 0 },
			cwd: tmpDir,
		});
		expect(r.hookSpecificOutput?.additionalContext).toContain("未跑測試");
	});

	it("git commit + 已跑過測試 → 不 warn", () => {
		mkdirSync(join(tmpDir, "tests"), { recursive: true });
		writeFileSync(join(tmpDir, "package.json"), "{}");
		_ws.testRun = 1;
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "git commit -m 'x'" },
			tool_result: { exitCode: 0 },
			cwd: tmpDir,
		});
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});

	it("git commit 但無 tests 目錄 → 不 warn（repo 無測試）", () => {
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "git commit -m 'x'" },
			tool_result: { exitCode: 0 },
			cwd: tmpDir,
		});
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});

	it("commit 失敗 (exitCode != 0) → 不 warn（hook 失敗 → 非真的 commit）", () => {
		mkdirSync(join(tmpDir, "tests"), { recursive: true });
		writeFileSync(join(tmpDir, "package.json"), "{}");
		_ws.testRun = 0;
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "git commit -m 'x'" },
			tool_result: { exitCode: 1 },
			cwd: tmpDir,
		});
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});
});

describe("reflect-guard: reflection.jsonl 品質守護", () => {
	it("Write reflections.jsonl 行動空 → warn", () => {
		const p = join(tmpDir, "reflections.jsonl");
		const entry = { ts: "2026-04-13", trigger: "test", "行動": [] };
		writeFileSync(p, `${JSON.stringify(entry)}\n`);
		const r = handler({ tool_name: "Write", tool_input: { file_path: p } });
		expect(r.hookSpecificOutput?.additionalContext).toContain("品質不足");
	});

	it("Write reflections.jsonl 行動純散文無 rule/skill/hook → warn", () => {
		const p = join(tmpDir, "reflections.jsonl");
		const entry = { ts: "2026-04-13", trigger: "test", "行動": ["持續觀察"] };
		writeFileSync(p, `${JSON.stringify(entry)}\n`);
		const r = handler({ tool_name: "Write", tool_input: { file_path: p } });
		expect(r.hookSpecificOutput?.additionalContext).toContain("品質不足");
	});

	it("Write reflections.jsonl 含 rule/skill 關鍵詞 → 不 warn", () => {
		const p = join(tmpDir, "reflections.jsonl");
		const entry = { ts: "2026-04-13", trigger: "test", "行動": ["修 rules/核心/核心.md 第 5 條"] };
		writeFileSync(p, `${JSON.stringify(entry)}\n`);
		const r = handler({ tool_name: "Write", tool_input: { file_path: p } });
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});

	it("fail-open：malformed input → allow 不 throw", () => {
		expect(() => handler(null)).not.toThrow();
		expect(handler(null).decision).toBe("allow");
		expect(handler({}).decision).toBe("allow");
	});
});
