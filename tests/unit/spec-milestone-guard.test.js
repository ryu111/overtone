// xd-gbgv P1: Spec 切割防護 5 case
import { describe, it, expect } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
const { evaluateSpecMilestone } = await import(join(homedir(), ".claude/hooks/modules/spec-milestone-guard.js"));

function mkInput(summary) {
	const body = JSON.stringify({ id: "xd-test", summary });
	return {
		tool_input: {
			command: `curl -s -X POST http://127.0.0.1:3457/api/cross-dispatch/complete -H 'Content-Type: application/json' -d '${body}'`,
		},
	};
}

describe("spec-milestone-guard (xd-gbgv P1)", () => {
	it("完整交付 M1+M2+M3 → pass", () => {
		const r = evaluateSpecMilestone(mkInput("完成 M1 + M2 + M3 三 milestone 全部實作"));
		expect(r.decision).toBe("allow");
	});

	it("只交 M1 無理由 → block", () => {
		const r = evaluateSpecMilestone(mkInput("只完成 M1 milestone，實作 scope"));
		expect(r.decision).toBe("block");
		expect(r.systemMessage).toMatch(/Spec 切割防護/);
	});

	it("只交 M1 有量化理由 → pass", () => {
		const r = evaluateSpecMilestone(mkInput("只完成 M1，量化理由：>1500 行需拆分 follow-up M2/M3"));
		expect(r.decision).toBe("allow");
	});

	it("無 milestone 字樣 → 不觸發", () => {
		const r = evaluateSpecMilestone(mkInput("修好 bug，commit abc1234 + test pass"));
		expect(r.decision).toBe("allow");
	});

	it("escape hatch 使用者明示 → pass", () => {
		const r = evaluateSpecMilestone(mkInput("只做 M1，使用者明示授權拆分"));
		expect(r.decision).toBe("allow");
	});

	it("非 complete endpoint 的 curl 不觸發", () => {
		const r = evaluateSpecMilestone({
			tool_input: { command: "curl http://google.com" },
		});
		expect(r.decision).toBe("allow");
	});
});
