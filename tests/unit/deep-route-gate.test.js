import { describe, test, expect, afterAll, beforeEach } from "bun:test";
import { homedir } from "os";
import { join } from "path";
import { writeFileSync, existsSync, unlinkSync } from "fs";

const { evaluateBash, evaluateTask } = await import(join(homedir(), ".claude/hooks/modules/guards.js"));
const contextInjector = await import(join(homedir(), ".claude/hooks/modules/context-injector.js"));

// 測試環境 cwd 未設 → projName = "unknown"
const ROUTING_FILE = "/tmp/nova-routing-level-unknown.txt";
// compact-recovery file 由 flow-observer PreCompact/PostCompact hook 寫入，
// 在並行測試中可能污染 context-injector UserPromptSubmit 的 compact recovery 分支
const RECOVERY_FILE = "/tmp/nova-compact-recovery-unknown.md";

function clearRouting() {
	if (existsSync(ROUTING_FILE)) unlinkSync(ROUTING_FILE);
	if (existsSync(RECOVERY_FILE)) unlinkSync(RECOVERY_FILE);
}
function setRouting(level = "D1") {
	writeFileSync(ROUTING_FILE, level);
}

describe("深度路由 HARD GATE 三層修復", () => {
	// 每個 test 前重置 routing file（避免並行 worker 干擾）
	beforeEach(() => {
		clearRouting();
	});
	afterAll(() => {
		clearRouting();
	});

	describe("Fix 1: PreToolUse:Task/Agent gate", () => {
		test("routing 未設 → evaluateTask deny", () => {
			clearRouting();
			const result = evaluateTask({ tool_input: { subagent_type: "executor", prompt: "test" } });
			expect(result.hookSpecificOutput?.permissionDecision).toBe("deny");
			expect(result.hookSpecificOutput?.permissionDecisionReason).toContain("深度分類");
		});

		test("routing 設為 D1 → evaluateTask allow", () => {
			setRouting("D1");
			const result = evaluateTask({ tool_input: { subagent_type: "executor", prompt: "test" } });
			expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
		});

		test("evaluateTask 內部錯誤 fail-open", () => {
			// 傳 undefined input 觸發容錯路徑
			const result = evaluateTask(undefined);
			// routing 未設 → deny（非錯誤路徑）
			expect(["allow", "deny"]).toContain(result.hookSpecificOutput?.permissionDecision);
		});
	});

	describe("Fix 2: Bash QUERY_RE 緊縮", () => {
		test("git commit 不在 query 白名單 → 無 routing 時 deny", () => {
			clearRouting();
			const result = evaluateBash({ tool_input: { command: "git commit -m 'test'" } });
			expect(result.hookSpecificOutput?.permissionDecision).toBe("deny");
			expect(result.hookSpecificOutput?.permissionDecisionReason).toContain("深度分類");
		});

		test("git push 不在 query 白名單 → 無 routing 時 deny", () => {
			clearRouting();
			const result = evaluateBash({ tool_input: { command: "git push" } });
			expect(result.hookSpecificOutput?.permissionDecision).toBe("deny");
		});

		test("rm 不在 query 白名單 → 無 routing 時 deny", () => {
			clearRouting();
			const result = evaluateBash({ tool_input: { command: "rm -rf /tmp/test-dir" } });
			expect(result.hookSpecificOutput?.permissionDecision).toBe("deny");
		});

		test("git log 仍在 query 白名單 → 無 routing 時 allow", () => {
			clearRouting();
			const result = evaluateBash({ tool_input: { command: "git log --oneline -5" } });
			expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
		});

		test("git status 仍在 query 白名單 → 無 routing 時 allow", () => {
			clearRouting();
			const result = evaluateBash({ tool_input: { command: "git status" } });
			expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
		});

		test("git diff 仍在 query 白名單", () => {
			clearRouting();
			const result = evaluateBash({ tool_input: { command: "git diff HEAD~1" } });
			expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
		});

		test("tmux capture-pane 仍在 query 白名單", () => {
			clearRouting();
			const result = evaluateBash({ tool_input: { command: "tmux capture-pane -p" } });
			expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
		});

		test("tmux send-keys 不在 query 白名單 → 無 routing 時 deny", () => {
			clearRouting();
			const result = evaluateBash({ tool_input: { command: "tmux send-keys -t foo 'bar' Enter" } });
			expect(result.hookSpecificOutput?.permissionDecision).toBe("deny");
		});
	});

	describe("Fix 3: UserPromptSubmit auto-classify fallback", () => {
		test("routing 未設 → UserPromptSubmit 注入 D 分類提醒", () => {
			clearRouting();
			const result = contextInjector.on.UserPromptSubmit({ cwd: "/tmp/unknown", prompt: "test" });
			const ctx = result?.hookSpecificOutput?.additionalContext || "";
			expect(ctx).toContain("尚未分類深度");
			expect(ctx).toContain("echo DX");
		});

		test("routing 已設 → UserPromptSubmit 不注入 D 分類提醒", () => {
			setRouting("D1");
			const result = contextInjector.on.UserPromptSubmit({ cwd: "/tmp/unknown", prompt: "test" });
			const ctx = result?.hookSpecificOutput?.additionalContext || "";
			expect(ctx).not.toContain("尚未分類深度");
		});
	});
});
