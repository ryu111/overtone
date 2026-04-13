import { describe, it, expect, beforeEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";

// PostCompact 自動注入接續指令 — 防回歸測試
//
// 修復前：hook-client.js output() 是 if-else if 鏈，systemMessage 優先輸出
// 時會吃掉 hookSpecificOutput.additionalContext，model 看不到 ctx。
// PostCompact handler 也只回 systemMessage，根本沒填 additionalContext。
//
// 修復後：
//   1. flow-observer.js PostCompact handler 同時回 systemMessage 和
//      hookSpecificOutput.additionalContext
//   2. hook-client.js output() 兩者並存時都輸出
//   3. 兜底寫 /tmp/nova-compact-recovery-{project}.md

const HOOK_CLIENT = join(process.env.HOME || "", ".claude/hooks/hook-client.js");

function runPostCompact(input) {
	const r = spawnSync("bun", [HOOK_CLIENT, "PostCompact"], {
		input: JSON.stringify(input),
		encoding: "utf-8",
		timeout: 10000,
	});
	return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

describe("PostCompact 自動注入", () => {
	const testProject = "postcompact-test-" + Date.now();
	const recoveryPath = `/tmp/nova-compact-recovery-${testProject}.md`;

	beforeEach(() => {
		if (existsSync(recoveryPath)) unlinkSync(recoveryPath);
	});

	it("輸出含 systemMessage（給使用者看）", () => {
		const r = runPostCompact({
			cwd: `/Users/test/projects/${testProject}`,
			compact_summary: "目標 X，下一步 Y，無阻塞",
		});
		expect(r.status).toBe(0);
		const out = JSON.parse(r.stdout);
		expect(out.systemMessage).toBeDefined();
		expect(out.systemMessage).toContain("handoff");
		expect(out.systemMessage).toContain(testProject);
	});

	it("輸出同時含 hookSpecificOutput.additionalContext（給 model 看）", () => {
		const r = runPostCompact({
			cwd: `/Users/test/projects/${testProject}`,
			compact_summary: "目標 X，下一步 Y，無阻塞",
		});
		const out = JSON.parse(r.stdout);
		expect(out.hookSpecificOutput).toBeDefined();
		expect(out.hookSpecificOutput.hookEventName).toBe("PostCompact");
		expect(out.hookSpecificOutput.additionalContext).toContain("handoff");
		expect(out.hookSpecificOutput.additionalContext).toContain(testProject);
	});

	it("兜底寫 compact-recovery.md 供 UserPromptSubmit 路徑接力", () => {
		runPostCompact({
			cwd: `/Users/test/projects/${testProject}`,
			compact_summary: "目標 X，下一步 Y，無阻塞",
		});
		expect(existsSync(recoveryPath)).toBe(true);
		const content = readFileSync(recoveryPath, "utf-8");
		expect(content).toContain("context 壓縮");
		expect(content).toContain(testProject);
	});

	it("注入紀錄 log 寫到 /tmp/nova-postcompact-injection.jsonl", () => {
		const logPath = "/tmp/nova-postcompact-injection.jsonl";
		const before = existsSync(logPath) ? readFileSync(logPath, "utf-8").split("\n").length : 0;
		runPostCompact({
			cwd: `/Users/test/projects/${testProject}`,
			compact_summary: "目標 X，下一步 Y，無阻塞",
		});
		expect(existsSync(logPath)).toBe(true);
		const after = readFileSync(logPath, "utf-8").split("\n").length;
		expect(after).toBeGreaterThan(before);
		// 最新一行應包含 project 名稱
		const lines = readFileSync(logPath, "utf-8").trim().split("\n");
		const lastLine = JSON.parse(lines[lines.length - 1]);
		expect(lastLine.project).toBe(testProject);
		expect(lastLine.ctxLength).toBeGreaterThan(0);
	});
});
