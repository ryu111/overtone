import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { evaluateBash, evaluateEdit, evaluateTask, evaluateOsControl } from "../../../../.claude/hooks/modules/guards.js";
import { writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

	it("git -C ~/.claude status → allow（git -C path 前綴支援）", () => {
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: { command: "git -C ~/.claude status" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});

	it("git -C /tmp/foo log --oneline → allow（git -C path 前綴 + log）", () => {
		const r = evaluateBash({ cwd: TEST_CWD, tool_input: { command: "git -C /tmp/foo log --oneline" } });
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

// ─────────────────────────────────────────────
// evaluateEdit 系列
// ─────────────────────────────────────────────

const EDIT_PROJ = "guards-edit-test-" + Date.now();
const EDIT_CWD = `/tmp/${EDIT_PROJ}`;
const EDIT_ROUTING = `/tmp/nova-routing-level-${EDIT_PROJ}.txt`;
const CLAUDE_DIR = join(homedir(), ".claude");

describe("guards: evaluateEdit HARD GATE", () => {
	afterEach(() => {
		try { unlinkSync(EDIT_ROUTING); } catch {}
	});

	it("無 routing file + filePath 在 ~/.claude → deny（HARD GATE）", () => {
		try { unlinkSync(EDIT_ROUTING); } catch {}
		const filePath = join(CLAUDE_DIR, "test-foo.md");
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: "hello" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("HARD GATE");
	});

	it("有 routing file + filePath 在 ~/.claude → 不因 HARD GATE deny", () => {
		writeFileSync(EDIT_ROUTING, "D1");
		const filePath = join(CLAUDE_DIR, "test-foo.md");
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: "hello" } });
		expect(r.hookSpecificOutput.permissionDecisionReason ?? "").not.toContain("HARD GATE");
	});
});

describe("guards: evaluateEdit Rule 行數限制", () => {
	beforeEach(() => { writeFileSync(EDIT_ROUTING, "D1"); });
	afterEach(() => { try { unlinkSync(EDIT_ROUTING); } catch {} });

	it("rules/.../X.md 內容 51 行 → deny（超過 50 行上限）", () => {
		const filePath = join(CLAUDE_DIR, "rules/品質/X.md");
		const content = Array.from({ length: 51 }, (_, i) => `行 ${i + 1}`).join("\n");
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("50 行上限");
	});

	it("rules/.../X.md 內容 50 行 → 不因行數限制 deny", () => {
		const filePath = join(CLAUDE_DIR, "rules/品質/X.md");
		const content = Array.from({ length: 50 }, (_, i) => `行 ${i + 1}`).join("\n");
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content } });
		expect(r.hookSpecificOutput.permissionDecisionReason ?? "").not.toContain("50 行上限");
	});
});

describe("guards: evaluateEdit 危險內容偵測", () => {
	beforeEach(() => { writeFileSync(EDIT_ROUTING, "D1"); });
	afterEach(() => { try { unlinkSync(EDIT_ROUTING); } catch {} });

	it("非 hooks/modules/ 路徑 + content 含 eval 呼叫 → deny（eval()）", () => {
		const filePath = "/tmp/some-project/src/util.js";
		// 用 string concat 避免觸發 guard 本身；guards.js 只掃 tool_input.content，不掃 test 程式碼
		const dangerous = "const x = " + "ev" + "al" + "(code);";
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: dangerous } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("eval()");
	});

	it("非 hooks/modules/ 路徑 + content 含 .innerHTML = → deny", () => {
		const filePath = "/tmp/some-project/src/dom.js";
		const dangerous = "el.innerH" + "TML = userInput;";
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: dangerous } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("innerHTML");
	});

	it("hooks/modules/ 路徑 + 危險內容 → reason 不含 eval()（豁免路徑，改走保護元件）", () => {
		const filePath = join(CLAUDE_DIR, "hooks/modules/foo.js");
		const dangerous = "const x = " + "ev" + "al" + "(code);";
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: dangerous } });
		expect(r.hookSpecificOutput.permissionDecisionReason ?? "").not.toContain("eval()");
	});

	it("非 hooks/modules/ 路徑 + 正常 content → allow", () => {
		const filePath = "/tmp/some-project/src/normal.js";
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: "const x = 1 + 2;" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});
});

describe("guards: evaluateEdit test.skip 守衛", () => {
	beforeEach(() => { writeFileSync(EDIT_ROUTING, "D1"); });
	afterEach(() => { try { unlinkSync(EDIT_ROUTING); } catch {} });

	it("tests/foo.test.js 含 test.skip( → deny（test.skip()）", () => {
		const filePath = "/tmp/some-project/tests/foo.test.js";
		const skipContent = 'test' + '.skip("broken", () => {});';
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: skipContent } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("test.skip()");
	});

	it("非 test 路徑 + 含 test.skip 字串 → 不因此 deny", () => {
		const filePath = "/tmp/some-project/src/util.js";
		const skipContent = '// test' + '.skip("example");';
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: skipContent } });
		expect(r.hookSpecificOutput.permissionDecisionReason ?? "").not.toContain("test.skip()");
	});

	it("tests/foo.test.js + 正常 content → allow", () => {
		const filePath = "/tmp/some-project/tests/foo.test.js";
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: 'it("should work", () => { expect(1).toBe(1); });' } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});
});

// iter 12 新增：nova session PROTECTED_PATHS 豁免 baseline
// 使用者授權 commit 9477678 2026-04-19：nova (cwd ∈ ~/.claude/) 為全域核心，豁免 PROTECTED_PATHS
// 防回歸：若未來誤刪 bypass，本 test 立即失敗
describe("guards: evaluateEdit nova session PROTECTED_PATHS 豁免 (iter 12)", () => {
	const NOVA_ROUTING = `/tmp/nova-routing-level-.claude.txt`;
	beforeEach(() => { writeFileSync(NOVA_ROUTING, "D1"); });
	afterEach(() => { try { unlinkSync(NOVA_ROUTING); } catch {} });

	it("nova cwd (~/.claude) + hooks/modules/ 保護路徑 → allow（nova 豁免）", () => {
		const filePath = join(CLAUDE_DIR, "hooks/modules/foo.js");
		const r = evaluateEdit({ cwd: CLAUDE_DIR, tool_input: { file_path: filePath, content: "// ok" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
		expect(r.hookSpecificOutput.additionalContext).toContain("nova session");
		expect(r.hookSpecificOutput.additionalContext).toContain("PROTECTED_PATHS 豁免");
	});

	it("nova 子目錄 (~/.claude/scripts) + skills/ 保護路徑 → allow", () => {
		writeFileSync(`/tmp/nova-routing-level-scripts.txt`, "D1");
		const filePath = join(CLAUDE_DIR, "skills/foo/SKILL.md");
		const r = evaluateEdit({ cwd: join(CLAUDE_DIR, "scripts"), tool_input: { file_path: filePath, content: "# skill" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
		try { unlinkSync(`/tmp/nova-routing-level-scripts.txt`); } catch {}
	});

	it("非 nova cwd (/tmp) + 保護路徑 → deny（原行為保留）", () => {
		writeFileSync(EDIT_ROUTING, "D1");
		const filePath = join(CLAUDE_DIR, "hooks/modules/foo.js");
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: "// ok" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("保護元件");
		try { unlinkSync(EDIT_ROUTING); } catch {}
	});

	it("nova cwd 相似但非根路徑 (/Users/sbu/.claude-fake) → 不 allow（精準前綴守護）", () => {
		writeFileSync(`/tmp/nova-routing-level-.claude-fake.txt`, "D1");
		const fakeDir = `${homedir()}/.claude-fake`;
		const filePath = join(CLAUDE_DIR, "hooks/modules/foo.js");
		const r = evaluateEdit({ cwd: fakeDir, tool_input: { file_path: filePath, content: "// ok" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		try { unlinkSync(`/tmp/nova-routing-level-.claude-fake.txt`); } catch {}
	});
});

describe("guards: evaluateEdit PROTECTED_PATHS", () => {
	beforeEach(() => { writeFileSync(EDIT_ROUTING, "D1"); });
	afterEach(() => { try { unlinkSync(EDIT_ROUTING); } catch {} });

	it("hooks/modules/foo.js → deny（保護元件）含 CLI hint", () => {
		const filePath = join(CLAUDE_DIR, "hooks/modules/foo.js");
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: "// ok" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("保護元件");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("CLI");
	});

	it("skills/foo/SKILL.md → deny（保護元件）含 CLI hint", () => {
		const filePath = join(CLAUDE_DIR, "skills/foo/SKILL.md");
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: "# skill" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("保護元件");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("CLI");
	});

	it("agents/foo.md → deny（保護元件）含 CLI hint", () => {
		const filePath = join(CLAUDE_DIR, "agents/foo.md");
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: "# agent" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("保護元件");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("CLI");
	});

	it("commands/foo.md → deny（保護元件）", () => {
		const filePath = join(CLAUDE_DIR, "commands/foo.md");
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: "# cmd" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("保護元件");
	});

	it("~/.claude 外的路徑 → 跳過 PROTECTED_PATHS，allow", () => {
		const filePath = "/tmp/some-other-project/foo.js";
		const r = evaluateEdit({ cwd: EDIT_CWD, tool_input: { file_path: filePath, content: "// ok" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});
});

// ─────────────────────────────────────────────
// evaluateTask 系列
// ─────────────────────────────────────────────

const TASK_PROJ = "guards-task-test-" + Date.now();
const TASK_CWD = `/tmp/${TASK_PROJ}`;
const TASK_ROUTING = `/tmp/nova-routing-level-${TASK_PROJ}.txt`;

describe("guards: evaluateTask HARD GATE", () => {
	afterEach(() => {
		try { unlinkSync(TASK_ROUTING); } catch {}
	});

	it("無 routing file → deny（HARD GATE：Agent 委派）", () => {
		try { unlinkSync(TASK_ROUTING); } catch {}
		const r = evaluateTask({ cwd: TASK_CWD, tool_input: { prompt: "do something" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
		expect(r.hookSpecificOutput.permissionDecisionReason).toContain("HARD GATE");
	});

	it("有 routing file → allow", () => {
		writeFileSync(TASK_ROUTING, "D2");
		const r = evaluateTask({ cwd: TASK_CWD, tool_input: { prompt: "do something" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});

	it("null input → allow 不 throw（fail-open）", () => {
		expect(() => evaluateTask(null)).not.toThrow();
		const r = evaluateTask(null);
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});
});

// ─────────────────────────────────────────────
// evaluateOsControl 系列（iter 13 補 SessionStart 建議 baseline）
// ─────────────────────────────────────────────

describe("guards: evaluateOsControl", () => {
	it("非 os-control 命令 → null（不處理 fall-through）", () => {
		const r = evaluateOsControl({ tool_input: { command: "ls /tmp" } });
		expect(r).toBeNull();
	});

	it("os-control + password 字串 → block（密碼欄位偵測）", () => {
		const r = evaluateOsControl({ tool_input: { command: "os-control click password field" } });
		expect(r?.decision).toBe("block");
		expect(r?.reason).toContain("密碼");
	});

	it("cliclick + 密碼中文 → block", () => {
		const r = evaluateOsControl({ tool_input: { command: "cliclick 輸入 密碼" } });
		expect(r?.decision).toBe("block");
	});

	it("vision-loop + keychain → block（keychain 關鍵字）", () => {
		const r = evaluateOsControl({ tool_input: { command: "vision-loop tap keychain access" } });
		expect(r?.decision).toBe("block");
	});

	it("os-control 無密碼無 app 參數 → null（通過）", () => {
		const r = evaluateOsControl({ tool_input: { command: "os-control screenshot" } });
		expect(r).toBeNull();
	});

	it("null input → 不 throw（fail-open）", () => {
		expect(() => evaluateOsControl(null)).not.toThrow();
		expect(() => evaluateOsControl({})).not.toThrow();
		expect(() => evaluateOsControl({ tool_input: {} })).not.toThrow();
	});

	// iter 13 治本：substring → command 開頭動詞 + bun/node 呼叫 pattern
	// 自驅發現：commit message 含「cliclick」字面誤 block
	it("git commit message 含 cliclick 字面 → null（不誤 block）", () => {
		const msg = 'git commit -m "test: cliclick + password case"';
		const r = evaluateOsControl({ tool_input: { command: msg } });
		expect(r).toBeNull();
	});

	it("bun scripts/os/os-control.js click 呼叫 → 觸發偵測（真呼叫不放過）", () => {
		const r = evaluateOsControl({ tool_input: { command: "bun scripts/os/os-control.js click password" } });
		expect(r?.decision).toBe("block");
	});

	it("echo 內含 vision-loop 字面 → null（docstring 不誤 block）", () => {
		const r = evaluateOsControl({ tool_input: { command: 'echo "docs: vision-loop workflow with password"' } });
		expect(r).toBeNull();
	});
});
