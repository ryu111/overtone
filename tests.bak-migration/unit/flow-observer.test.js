import { describe, it, expect, beforeAll } from "bun:test";
import { on } from "../../../../.claude/hooks/modules/flow-observer.js";

// flow-observer SessionStart 有寫入 ~/.claude/data/current-session-id 的副作用。
// 在 bun test 環境下須透過 NOVA_HOOK_TEST=1 opt-out 以避免污染真實 session 檔
// （見 ~/.claude/hooks/modules/flow-observer.js 的 IS_TEST guard）。
beforeAll(() => {
	process.env.NOVA_HOOK_TEST = "1";
});

describe("flow-observer: 事件 handler 存在", () => {
	it("註冊所有必要 lifecycle handlers", () => {
		expect(typeof on.SessionStart).toBe("function");
		expect(typeof on.SessionEnd).toBe("function");
		expect(typeof on.UserPromptSubmit).toBe("function");
		expect(typeof on.SubagentStart).toBe("function");
		expect(typeof on.PostToolUse).toBe("function");
		expect(typeof on.Stop).toBe("function");
		expect(typeof on.PreCompact).toBe("function");
	});
});

describe("flow-observer: fail-open 錯誤處理", () => {
	it("SessionStart null input → 不 throw", () => {
		expect(() => on.SessionStart(null)).not.toThrow();
	});

	it("SessionEnd null input → 不 throw", () => {
		expect(() => on.SessionEnd(null)).not.toThrow();
	});

	it("UserPromptSubmit null input → 不 throw", () => {
		expect(() => on.UserPromptSubmit(null)).not.toThrow();
	});

	it("PostToolUse null input → 不 throw", () => {
		expect(() => on.PostToolUse(null)).not.toThrow();
	});

	it("Stop null input → 不 throw", () => {
		expect(() => on.Stop(null)).not.toThrow();
	});

	it("PreCompact null input → 不 throw", () => {
		expect(() => on.PreCompact(null)).not.toThrow();
	});
});

describe("flow-observer: handler 回傳合法結構", () => {
	it("SessionStart 回傳物件含 hookSpecificOutput 或 decision", () => {
		const r = on.SessionStart({ session_id: "test-" + Date.now(), cwd: "/tmp" });
		expect(r).toBeDefined();
		expect(typeof r).toBe("object");
	});

	it("UserPromptSubmit 含 prompt → 回合法結構", () => {
		const r = on.UserPromptSubmit({
			session_id: "test-" + Date.now(),
			cwd: "/tmp",
			prompt: "test prompt",
		});
		expect(r).toBeDefined();
	});

	it("PostToolUse 含 tool_name → 回合法結構", () => {
		const r = on.PostToolUse({
			session_id: "test-" + Date.now(),
			cwd: "/tmp",
			tool_name: "Bash",
			tool_input: { command: "echo test" },
			tool_result: { exitCode: 0, stdout: "test" },
		});
		expect(r).toBeDefined();
	});

	it("Stop 有效 input → 回合法結構", () => {
		const r = on.Stop({
			session_id: "test-" + Date.now(),
			cwd: "/tmp",
		});
		expect(r).toBeDefined();
	});
});

describe("flow-observer: SubagentStart handler", () => {
	it("SubagentStart null → 不 throw", () => {
		expect(() => on.SubagentStart(null)).not.toThrow();
	});

	it("SubagentStart with tool_input → 不 throw", () => {
		expect(() => on.SubagentStart({
			session_id: "s1",
			cwd: "/tmp",
			tool_input: { subagent_type: "executor", prompt: "test" },
		})).not.toThrow();
	});
});
