import { describe, it, expect, beforeEach } from "bun:test";
import { on } from "../../../../.claude/hooks/modules/verify-guard.js";
import { _ws } from "../../../../.claude/hooks/modules/lib/workspace-state.js";

const handler = on.PostToolUse;

beforeEach(() => {
	for (const k of Object.keys(_ws)) delete _ws[k];
});

describe("verify-guard", () => {
	it("非 Bash tool → allow 不動 ws", () => {
		const r = handler({ tool_name: "Write", tool_input: { content: "x" } });
		expect(r.decision).toBe("allow");
		expect(_ws.lastVerifyTs).toBeUndefined();
	});

	it("bun test 命令 → 記錄 lastVerifyTs", () => {
		const before = Date.now();
		handler({ tool_name: "Bash", tool_input: { command: "bun test tests/unit/x.test.js" } });
		expect(_ws.lastVerifyTs).toBeGreaterThanOrEqual(before);
	});

	it("git log 命令 → 記錄 lastVerifyTs（支援 git -C path 格式）", () => {
		handler({ tool_name: "Bash", tool_input: { command: "git -C ~/projects/x log --oneline -5" } });
		expect(_ws.lastVerifyTs).toBeDefined();
	});

	it("cross-dispatch/complete 後 10+ 分鐘無驗證 → warn", () => {
		_ws.lastVerifyTs = Date.now() - 15 * 60 * 1000;
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: `curl -X POST /api/cross-dispatch/complete -d '{"id":"xd-x","summary":"long text here absolutely not ack case over twenty chars"}'` },
		});
		expect(r.hookSpecificOutput?.additionalContext).toContain("10 分鐘無驗證");
	});

	it("cross-dispatch/complete 後近期有驗證 → 不 warn", () => {
		_ws.lastVerifyTs = Date.now() - 2 * 60 * 1000;
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: `curl -X POST /api/cross-dispatch/complete -d '{"id":"xd-x","summary":"long enough summary over twenty characters done"}'` },
		});
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});

	it("ack 類短 summary complete → 跳過警告", () => {
		_ws.lastVerifyTs = Date.now() - 999 * 60 * 1000;
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: `curl -X POST /api/cross-dispatch/complete -d '{"id":"xd-x","summary":"ack"}'` },
		});
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});

	it("fail-open：malformed input → allow 不 throw", () => {
		expect(() => handler(null)).not.toThrow();
		expect(handler(null).decision).toBe("allow");
		expect(handler({}).decision).toBe("allow");
	});
});
