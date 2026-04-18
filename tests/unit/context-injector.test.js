import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const REG_PATH = "/tmp/nova-feedback-registry.json";
const SUG_PATH = "/tmp/nova-feedback-suggestions.json";
const COMP_PATH = "/Users/sbu/.claude/data/session-compliance.jsonl";
const REG_BAK = REG_PATH + ".bak";
const SUG_BAK = SUG_PATH + ".bak";
const COMP_BAK = COMP_PATH + ".bak";

beforeEach(() => {
	if (existsSync(REG_PATH)) writeFileSync(REG_BAK, readFileSync(REG_PATH));
	if (existsSync(SUG_PATH)) writeFileSync(SUG_BAK, readFileSync(SUG_PATH));
	if (existsSync(COMP_PATH)) writeFileSync(COMP_BAK, readFileSync(COMP_PATH));
});

afterEach(() => {
	for (const [bak, orig] of [[REG_BAK, REG_PATH], [SUG_BAK, SUG_PATH], [COMP_BAK, COMP_PATH]]) {
		if (existsSync(bak)) { writeFileSync(orig, readFileSync(bak)); unlinkSync(bak); }
	}
});

describe("context-injector feedback", () => {
	test("injectFeedbackContext 讀到 degraded 元件產出正確格式", async () => {
		writeFileSync(REG_PATH, JSON.stringify({
			components: [
				{ name: "test-hook", type: "hook", health: "degraded" },
				{ name: "test-rule", type: "rule", health: "healthy" },
				{ name: "dead-skill", type: "skill", health: "dead" },
			],
		}));
		writeFileSync(SUG_PATH, JSON.stringify([]));

		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";
		expect(ctx).toContain("Feedback 狀態");
		expect(ctx).toContain("test-hook");
		expect(ctx).toContain("dead-skill");
	});

	test("registry 不存在時不影響 session 啟動", async () => {
		try { unlinkSync(REG_PATH); } catch {}
		try { unlinkSync(SUG_PATH); } catch {}
		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test" });
		expect(result.decision).toBe("allow");
	});

	test("超過 3 個 degraded 只顯示 3 個", async () => {
		writeFileSync(REG_PATH, JSON.stringify({
			components: Array.from({ length: 5 }, (_, i) => ({
				name: `comp-${i}`, type: "hook", health: "degraded",
			})),
		}));
		writeFileSync(SUG_PATH, JSON.stringify([]));

		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";
		// 只應顯示 3 個
		const matches = ctx.match(/comp-\d/g) || [];
		expect(matches.length).toBeLessThanOrEqual(3);
	});

	test("high priority 建議注入", async () => {
		writeFileSync(REG_PATH, JSON.stringify({ components: [] }));
		writeFileSync(SUG_PATH, JSON.stringify([
			{ priority: "high", status: "pending", suggestion: "升級 Hook 自動攔截" },
			{ priority: "low", status: "pending", suggestion: "歸檔舊 skill" },
		]));

		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";
		expect(ctx).toContain("待處理建議");
		expect(ctx).toContain("升級 Hook");
		expect(ctx).not.toContain("歸檔舊");
	});
});

describe("flow-observer compliance", () => {
	test("SessionEnd 持久化 compliance 格式正確", async () => {
		const mod = await import("/Users/sbu/.claude/hooks/modules/flow-observer.js");
		// 模擬一些工作信號
		mod.on.PostToolUse({ tool_name: "Bash", tool_input: { command: "bun test" } });
		mod.on.PostToolUse({ tool_name: "Agent", tool_result: "self-review done" });

		const result = mod.on.SessionEnd({ session_id: "test-123" });
		expect(result.decision).toBe("allow");

		// 檢查 compliance.jsonl
		if (existsSync(COMP_PATH)) {
			const lines = readFileSync(COMP_PATH, "utf-8").trim().split("\n");
			const last = JSON.parse(lines[lines.length - 1]);
			expect(last.session_id).toBe("test-123");
			expect(last).toHaveProperty("selfReviewRate");
			expect(last).toHaveProperty("testRate");
		}
	});

	test("低 selfReviewRate 觸發 compliance_warning", async () => {
		const mod = await import("/Users/sbu/.claude/hooks/modules/flow-observer.js");
		// 模擬多個 agent 完成但無 self-review
		for (let i = 0; i < 5; i++) {
			mod.on.PostToolUse({ tool_name: "Agent", tool_result: "done" });
		}
		const result = mod.on.SessionEnd({ session_id: "low-review" });
		const warnings = result.events.filter((e) => e.type === "compliance_warning");
		expect(warnings.length).toBe(1);
	});
});

// ─────────────────────────────────────────────
// SessionStart handoff pointer（spec/討論/sessionstart-handoff-pointer.md 方案 B）
// iteration 7 TDD baseline + 未來擴充 todo
// 派生自 ralph-loop iteration 2-6 cluster（synthesis-002）
// ─────────────────────────────────────────────

describe("context-injector SessionStart handoff pointer (iter 7 baseline)", () => {
	test("baseline: 現況 SessionStart 不讀 handoff 檔（日後實作 detectHandoffPointer 時此 test 需更新）", async () => {
		const HANDOFF_PATH = "/tmp/nova-handoff-test-iter7.md";
		writeFileSync(HANDOFF_PATH, "## Session Handoff — test-iter7\n日期：2026-04-19\n\n### 最近活動摘要\n這是 handoff 前 5 行內容");

		const mod = await import("/Users/sbu/.claude/hooks/modules/context-injector.js");
		const result = mod.on.SessionStart({ cwd: "/tmp/test-iter7", source: "compact" });
		const ctx = result.hookSpecificOutput?.additionalContext || "";

		// 現況 baseline：不含 handoff 內容（未實作 detectHandoffPointer）
		expect(ctx).not.toContain("handoff 檔");
		expect(ctx).not.toContain("nova-handoff-test-iter7.md");

		try { unlinkSync(HANDOFF_PATH); } catch {}
	});

	test.todo("方案 B 實作後：source=compact + handoff 存在 → 注入 pointer + 前 5 行");
	test.todo("方案 B 實作後：source=clear + handoff 存在 → 注入 pointer + 前 5 行");
	test.todo("方案 B 實作後：source=startup → 不注入（無 handoff 場景）");
	test.todo("方案 B 實作後：handoff 不存在 → 不注入");
	test.todo("方案 B 實作後：注入內容 ≤ 500 bytes（避擠壓 5KB cap）");
	test.todo("方案 B 實作後：pointer 格式含 '📄 handoff 檔：' + 絕對路徑");
});
