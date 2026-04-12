import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { homedir } from "os";
import { join } from "path";
import { writeFileSync, unlinkSync } from "fs";

const { evaluateBash } = await import(join(homedir(), ".claude/hooks/modules/guards.js"));

// 以 cwd 區分 project — guards 透過 cwd.split("/").pop() 推 project 名
const L5_CWD = { "novaplay": "/Users/test/projects/novaplay", "ai-media": "/Users/test/projects/ai-media", "block-world": "/Users/test/projects/block-world", "discord-raffle": "/Users/test/projects/discord-raffle" };
const L04_CWD = { "nova-brain": "/Users/test/projects/nova-brain", "nova-server": "/Users/test/projects/nova-server", "nova-control": "/Users/test/projects/nova-control", "nova-manager": "/Users/test/projects/nova-manager", ".claude": "/Users/test/.claude" };

// routing file 必須存在才能通過 HARD GATE（我們測的是 G4 gate 而非 D-gate）
const routingFileFor = (cwd) => `/tmp/nova-routing-level-${cwd.split("/").pop()}.txt`;

describe("Layer-based g4 gate", () => {
	beforeEach(() => {
		// 為每個測試 project 寫 routing file（繞過 HARD GATE 進到 g4 gate 檢查）
		for (const cwd of [...Object.values(L5_CWD), ...Object.values(L04_CWD)]) {
			writeFileSync(routingFileFor(cwd), "D1");
		}
	});
	afterAll(() => {
		for (const cwd of [...Object.values(L5_CWD), ...Object.values(L04_CWD)]) {
			try { unlinkSync(routingFileFor(cwd)); } catch {}
		}
	});

	describe("L5 專案允許 g4", () => {
		for (const [name, cwd] of Object.entries(L5_CWD)) {
			test(`${name}: curl localhost:8000 允許`, () => {
				const result = evaluateBash({
					cwd,
					tool_input: { command: "curl -s http://127.0.0.1:8000/v1/chat/completions -d '{\"model\":\"g4-26b\"}'" },
				});
				expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
			});
			test(`${name}: askLocal g 允許`, () => {
				const result = evaluateBash({
					cwd,
					tool_input: { command: "askLocal g '分類這段文字'" },
				});
				expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
			});
		}
	});

	describe("L0-L4 專案禁用 g4", () => {
		for (const [name, cwd] of Object.entries(L04_CWD)) {
			test(`${name}: curl localhost:8000 被 deny`, () => {
				const result = evaluateBash({
					cwd,
					tool_input: { command: "curl -s http://127.0.0.1:8000/v1/chat/completions" },
				});
				expect(result.hookSpecificOutput?.permissionDecision).toBe("deny");
				expect(result.hookSpecificOutput?.permissionDecisionReason).toContain("L0-L4 禁用 g4");
			});
			test(`${name}: askLocalModel 被 deny`, () => {
				const result = evaluateBash({
					cwd,
					tool_input: { command: "bun -e 'askLocalModel(\"g4-26b\", prompt)'" },
				});
				expect(result.hookSpecificOutput?.permissionDecision).toBe("deny");
			});
		}
	});

	describe("非 g4 命令不受 gate 影響", () => {
		test("L0-L4 可正常跑 git log（routing 已設）", () => {
			const result = evaluateBash({
				cwd: L04_CWD["nova-brain"],
				tool_input: { command: "git log --oneline -5" },
			});
			expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
		});

		test("L0-L4 可正常跑 curl 非 localhost:8000", () => {
			const result = evaluateBash({
				cwd: L04_CWD["nova-brain"],
				tool_input: { command: "curl -s http://127.0.0.1:3457/api/sessions/active" },
			});
			expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
		});
	});
});
