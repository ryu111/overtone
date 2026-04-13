import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { evaluateBash } from "../../../../.claude/hooks/modules/guards.js";
import { writeFileSync, unlinkSync } from "node:fs";

// 透過 cwd 控制 routingFile path：/tmp/nova-routing-level-{basename(cwd)}.txt
const TEST_PROJ = "guards-test-" + Date.now();
const TEST_CWD = `/tmp/${TEST_PROJ}`;
const ROUTING_FILE = `/tmp/nova-routing-level-${TEST_PROJ}.txt`;

beforeEach(() => {
	writeFileSync(ROUTING_FILE, "D1");
});
afterEach(() => {
	try { unlinkSync(ROUTING_FILE); } catch {}
});

describe("guards: evaluateBash 黑名單", () => {
	it("killall 命令 → deny", () => {
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: { command: "killall -9 node" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
	});

	it("git push --force → deny", () => {
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: { command: "git push --force origin main" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
	});

	it("rm --no-preserve-root → deny", () => {
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: { command: "rm --no-preserve-root -rf /" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
	});

	it("sudo rm → deny (privilege escalation)", () => {
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: { command: "sudo rm -rf /etc/hosts" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
	});
});

describe("guards: evaluateBash QUERY 放行", () => {
	it("ls 命令 → allow（QUERY 白名單）", () => {
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: { command: "ls -la /tmp" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});

	it("git log → allow（查詢類 git 細分）", () => {
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: { command: "git log --oneline -5" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});
});

describe("guards: HARD GATE routing file", () => {
	it("無 routing file + 非 QUERY 命令 → deny（強制分類）", () => {
		try { unlinkSync(ROUTING_FILE); } catch {}
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: { command: "bun run build" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("深度分類");
	});

	it("有 routing file + 非 QUERY 命令 → allow（通過 HARD GATE）", () => {
		writeFileSync(ROUTING_FILE, "D2");
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: { command: "bun run test" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});
});

describe("guards: L5 g4 白名單", () => {
	it("L0-L4 專案使用 g4-26b (port 8000) → deny", () => {
		const r = evaluateBash({
			cwd: "/Users/x/projects/nova-server",
			tool_input: { command: "curl http://127.0.0.1:8000/v1/chat/completions" },
		});
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("L0-L4");
	});

	it("L5 專案 (novaplay) 使用 g4-26b → allow", () => {
		writeFileSync("/tmp/nova-routing-level-novaplay.txt", "D1");
		const r = evaluateBash({
			cwd: "/Users/x/projects/novaplay",
			tool_input: { command: "curl http://localhost:8000/v1" },
		});
		// L5 允許，但仍要過其他守衛；assert 不 deny 即可
		expect(r.hookSpecificOutput.permissionDecision).not.toBe("deny");
		try { unlinkSync("/tmp/nova-routing-level-novaplay.txt"); } catch {}
	});
});

describe("guards: fail-open", () => {
	it("null command → allow 不 throw", () => {
		expect(() => evaluateBash({ cwd: TEST_CWD, tool_input: {} })).not.toThrow();
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: {} });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});

	it("null input → allow", () => {
		expect(() => evaluateBash(null)).not.toThrow();
	});
});
