import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { on as ralphLoopOn } from "../../../../.claude/hooks/modules/ralph-loop.js";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 防回歸：per-session flag 生命週期
// 5jb1 引入 flag 防覆寫，但副作用是 Stop 正常完成後 flag 保留，
// 導致同 session 後續 prompt 進來不自動重建 r-loop state。
// 修法：正常完成（max_iter / promise 匹配）→ 刪 flag
//       壞檔 / Phase 5 no prompt → 保留 flag（防壞檔被覆寫）

let tmpCwd;
const sessionId = "flag-test-" + Date.now();
const flagPath = `/tmp/nova-ralph-started-${sessionId}.flag`;

function writeState(fm, body = "原始任務清單") {
	const dir = join(tmpCwd, ".claude");
	mkdirSync(dir, { recursive: true });
	const frontmatter = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
	writeFileSync(
		join(dir, "ralph-loop.local.md"),
		`---\n${frontmatter}\n---\n\n${body}\n`,
	);
}

function hasState() {
	return existsSync(join(tmpCwd, ".claude/ralph-loop.local.md"));
}

beforeEach(() => {
	tmpCwd = mkdtempSync(join(tmpdir(), "flag-"));
	try { unlinkSync(flagPath); } catch {}
	writeFileSync(flagPath, new Date().toISOString());
});
afterEach(() => {
	try { rmSync(tmpCwd, { recursive: true, force: true }); } catch {}
	try { unlinkSync(flagPath); } catch {}
});

describe("ralph-loop flag 生命週期", () => {
	it("Phase 3 max_iterations 達成 → 刪 state + 刪 flag", async () => {
		writeState({
			active: "true",
			iteration: 10,
			session_id: sessionId,
			max_iterations: 10,
			completion_promise: `"DONE"`,
		});
		await ralphLoopOn.Stop({ cwd: tmpCwd, session_id: sessionId });
		expect(hasState()).toBe(false);
		expect(existsSync(flagPath)).toBe(false);
	});

	it("Phase 3.5 promise 匹配 → 刪 state + 刪 flag", async () => {
		writeState({
			active: "true",
			iteration: 1,
			session_id: sessionId,
			max_iterations: 100,
			completion_promise: `"DONE"`,
		});
		await ralphLoopOn.Stop({
			cwd: tmpCwd,
			session_id: sessionId,
			last_assistant_message: "工作完成 <promise>DONE</promise>",
		});
		expect(hasState()).toBe(false);
		expect(existsSync(flagPath)).toBe(false);
	});

	it("Phase 5 no prompt → 刪 state 但保留 flag（防覆寫壞檔）", async () => {
		writeState({
			active: "true",
			iteration: 1,
			session_id: sessionId,
			max_iterations: 100,
			completion_promise: `"DONE"`,
		}, ""); // empty body
		await ralphLoopOn.Stop({ cwd: tmpCwd, session_id: sessionId });
		expect(hasState()).toBe(false);
		expect(existsSync(flagPath)).toBe(true); // flag 保留
	});

	it("壞 state 檔 → 刪 state 但保留 flag", async () => {
		const dir = join(tmpCwd, ".claude");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "ralph-loop.local.md"), "no frontmatter here");
		await ralphLoopOn.Stop({ cwd: tmpCwd, session_id: sessionId });
		expect(hasState()).toBe(false);
		expect(existsSync(flagPath)).toBe(true); // flag 保留
	});

	it("整合：DONE → 刪 flag → 下條 prompt 可重建 state", async () => {
		writeState({
			active: "true",
			iteration: 1,
			session_id: sessionId,
			max_iterations: 100,
			completion_promise: `"DONE"`,
		});
		// 1. DONE
		await ralphLoopOn.Stop({
			cwd: tmpCwd,
			session_id: sessionId,
			last_assistant_message: "<promise>DONE</promise>",
		});
		expect(existsSync(flagPath)).toBe(false);
		// 2. 新 prompt 進來 — 應該能重建（flag 不存在、state 不存在）
		ralphLoopOn.UserPromptSubmit({
			cwd: tmpCwd,
			session_id: sessionId,
			prompt: "新的任務開始",
		});
		expect(hasState()).toBe(true);
		expect(existsSync(flagPath)).toBe(true);
	});
});
