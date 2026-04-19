import { describe, it, expect } from "bun:test";
import {
	runSubStep,
	runSelfHeal,
	defaultSteps,
} from "../../../../.claude/scripts/vault-self-heal.js";

describe("runSubStep", () => {
	it("成功 cmd → status ok", () => {
		const r = runSubStep("echo-test", "echo hello");
		expect(r.status).toBe("ok");
		expect(r.name).toBe("echo-test");
		expect(r.output).toContain("hello");
		expect(typeof r.ms).toBe("number");
	});

	it("失敗 cmd → status error", () => {
		const r = runSubStep("missing-cmd", "nonexistent-command-xyzzy-9999");
		expect(r.status).toBe("error");
		expect(r.error).toBeTruthy();
	});

	it("exit 非 0 → status error", () => {
		const r = runSubStep("false-cmd", "false");
		expect(r.status).toBe("error");
	});

	it("exit 0 + `; true` 吞掉前段非 0 → status ok", () => {
		const r = runSubStep("wrapped", "false; true");
		expect(r.status).toBe("ok");
	});
});

describe("defaultSteps", () => {
	it("預設 3 steps: distill / backlink_orphans / ref_lint", () => {
		const steps = defaultSteps();
		expect(steps.length).toBe(3);
		expect(steps[0].name).toBe("distill");
		expect(steps[1].name).toBe("backlink_orphans");
		expect(steps[2].name).toBe("ref_lint");
	});
});

describe("runSelfHeal dry-run", () => {
	it("dry-run 跑 mock steps 不 throw", () => {
		const r = runSelfHeal({
			dryRun: true,
			steps: [
				{ name: "a", cmd: "echo a" },
				{ name: "b", cmd: "echo b" },
			],
		});
		expect(r.total).toBe(2);
		expect(r.ok).toBe(2);
		expect(r.errors).toBe(0);
		expect(r.dryRun).toBe(true);
	});

	it("mixed 成功失敗 → 分別計數", () => {
		const r = runSelfHeal({
			dryRun: true,
			steps: [
				{ name: "ok", cmd: "echo ok" },
				{ name: "bad", cmd: "false" },
			],
		});
		expect(r.ok).toBe(1);
		expect(r.errors).toBe(1);
		expect(r.results[0].status).toBe("ok");
		expect(r.results[1].status).toBe("error");
	});

	it("report 結構含 ts / total / ok / errors / results", () => {
		const r = runSelfHeal({ dryRun: true, steps: [{ name: "a", cmd: "echo x" }] });
		expect(typeof r.ts).toBe("string");
		expect(r.total).toBe(1);
		expect(Array.isArray(r.results)).toBe(true);
	});
});
