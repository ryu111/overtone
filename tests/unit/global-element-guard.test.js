import { describe, it, expect } from "bun:test";
import { on } from "../../../../.claude/hooks/modules/global-element-guard.js";
import { homedir } from "node:os";
import { join } from "node:path";

const handler = on["PreToolUse:Write"];
const CLAUDE = join(homedir(), ".claude");

describe("global-element-guard", () => {
	it("非 nova-brain session 修改 ~/.claude/rules/ → block", () => {
		const r = handler({
			cwd: "/Users/x/projects/nova-server",
			tool_input: { file_path: join(CLAUDE, "rules/核心/核心.md") },
		});
		expect(r.decision).toBe("block");
		expect(r.reason).toContain("nova-brain");
	});

	it("nova-brain session 修改 ~/.claude/ → allow", () => {
		const r = handler({
			cwd: "/Users/x/projects/nova-brain",
			tool_input: { file_path: join(CLAUDE, "hooks/modules/x.js") },
		});
		expect(r.decision).toBe("allow");
	});

	it("非 ~/.claude/ 路徑 → allow（無論 cwd）", () => {
		const r = handler({
			cwd: "/Users/x/projects/nova-server",
			tool_input: { file_path: "/Users/x/projects/nova-server/src/a.js" },
		});
		expect(r.decision).toBe("allow");
	});

	it("~/.claude/projects/ 下 auto-memory → allow（非全域元件）", () => {
		const r = handler({
			cwd: "/Users/x/projects/nova-server",
			tool_input: { file_path: join(CLAUDE, "projects/abc/memory/x.md") },
		});
		expect(r.decision).toBe("allow");
	});

	it("Edit handler 與 Write handler 行為一致", () => {
		const edit = on["PreToolUse:Edit"];
		const r = edit({
			cwd: "/Users/x/projects/nova-manager",
			tool_input: { file_path: join(CLAUDE, "skills/foo/SKILL.md") },
		});
		expect(r.decision).toBe("block");
	});

	it("fail-open：malformed input → allow 不 throw", () => {
		expect(() => handler(null)).not.toThrow();
		expect(handler(null).decision).toBe("allow");
		expect(handler({}).decision).toBe("allow");
	});

	it("cwd 為空字串 + ~/.claude/ 路徑 → block（安全 default）", () => {
		const r = handler({
			cwd: "",
			tool_input: { file_path: join(CLAUDE, "rules/x.md") },
		});
		expect(r.decision).toBe("block");
	});
});
