// E2E 重演 xd-1usm Round 1 — 若 sub1 pipeline-enforcement 當時存在，Manager D1 誤派會被攔截。
//
// 核心場景驗證（ADR-012 sub1 P1-P3）：
//   1. tag match + diff_lines > 20 → block（Layer B hook）
//   2. tag match + diff_lines <= 20 → allow（escape hatch）
//   3. planner + canonical claim → CoVe gate systemMessage 注入（Layer C）
//   4. NOVA_PIPELINE_ENFORCE=off → passthrough（emergency override）
//
// ROI 推算：xd-1usm 實際 3 Round 壓成 1 Round — 場景 1 會在 Round 1 Layer A block，
//   Manager 被迫升 D2+ 走 planner pipeline，planner Step 0 CoVe 會在輸出 spec 前
//   驗證 canonical path（場景 3），避免 path hallucination。

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";

const ENFORCER_PATH = join(homedir(), ".claude/hooks/modules/pipeline-enforcer.js");
const VERIFIER_PATH = join(homedir(), ".claude/hooks/modules/target-path-verifier.js");

describe("sub1 M3 E2E — xd-1usm Round 1 reenact", () => {
	let savedEnv;
	let enforcer;
	let verifier;

	beforeEach(async () => {
		savedEnv = process.env.NOVA_PIPELINE_ENFORCE;
		delete process.env.NOVA_PIPELINE_ENFORCE;
		// 動態 import 避免 env 變化被 module cache 鎖死
		enforcer = await import(`${ENFORCER_PATH}?t=${Date.now()}`);
		verifier = await import(`${VERIFIER_PATH}?t=${Date.now()}`);
	});
	afterEach(() => {
		if (savedEnv === undefined) delete process.env.NOVA_PIPELINE_ENFORCE;
		else process.env.NOVA_PIPELINE_ENFORCE = savedEnv;
	});

	it("場景 1：tag + diff>20 → Layer B hook block（重演 xd-1usm Round 1 應被擋）", () => {
		const input = {
			cwd: "/tmp/test-xd-1usm-fake",
			tool_name: "Edit",
			tool_input: {
				file_path: "rules/環境/session-啟動紀律.md",
				// 50 行模擬大改
				new_string: Array(50).fill("// rule wording line").join("\n"),
				old_string: "# placeholder",
			},
		};
		const r = enforcer.evaluate(input);
		expect(r).toBeDefined();
		expect(r.decision).toBe("block");
		expect(r.systemMessage).toMatch(/D2\+/);
		expect(r.systemMessage).toMatch(/rule-change/);
	});

	it("場景 2：tag + diff<=20 → escape hatch 放行（typo 修正豁免）", () => {
		const input = {
			cwd: "/tmp/test-xd-1usm-fake",
			tool_name: "Edit",
			tool_input: {
				file_path: "rules/環境/寫作規範.md",
				new_string: "typo fixed line 1\nline 2",
				old_string: "typo fixd line 1\nline 2",
			},
		};
		const r = enforcer.evaluate(input);
		expect(r).toBeUndefined();
	});

	it("場景 3：planner + canonical claim → CoVe gate systemMessage 注入", () => {
		const input = {
			cwd: "/tmp/test-xd-1usm-fake",
			tool_name: "Task",
			tool_input: {
				subagent_type: "planner",
				prompt: "分析 /Users/sbu/projects/nova-manager/scripts/tmux-layout.js 的 addPane 設計，產出 ADR-012 sub1 M3 spec",
			},
		};
		const r = verifier.evaluate(input);
		expect(r).toBeDefined();
		expect(r.systemMessage).toMatch(/CoVe gate/);
		expect(r.systemMessage).toMatch(/second-pattern/);
	});

	it("場景 4：NOVA_PIPELINE_ENFORCE=off → passthrough 全放行", async () => {
		process.env.NOVA_PIPELINE_ENFORCE = "off";
		const fresh = await import(`${ENFORCER_PATH}?t=${Date.now()}-off`);
		const input = {
			cwd: "/tmp/test-xd-1usm-fake",
			tool_name: "Edit",
			tool_input: {
				file_path: "rules/核心/深度路由.md",
				new_string: Array(100).fill("big rule change").join("\n"),
				old_string: "x",
			},
		};
		const r = fresh.evaluate(input);
		expect(r).toBeUndefined();
	});

	it("CoVe CLI mode：verifyCanonicalPaths 正確區分存在 vs 不存在 path", () => {
		const r = verifier.verifyCanonicalPaths({
			paths: [
				join(homedir(), ".claude/config/pipeline-tags.json"),
				"/nonexistent/fake/xd-1usm-never-existed",
			],
			commands: [],
			routes: [],
		});
		expect(r.verified).toBe(false);
		expect(r.failures.length).toBeGreaterThan(0);
		const fake = r.failures.find((f) => /nonexistent/.test(f.claim));
		expect(fake).toBeDefined();
	});
});
