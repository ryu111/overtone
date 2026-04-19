import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { on as ralphLoopOn } from "../../../../.claude/hooks/modules/ralph-loop.js";
import { mkdtempSync, rmSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 防回歸：ralph-loop.local.md 被 Stop 刪除後，下一輪 UserPromptSubmit 不該
// 自動重建（會覆寫原始任務清單，違反 rules/環境/ralph-loop.md）。
// 用 per-session flag 限制一個 session 只能 auto-create 一次。

let tmpCwd;
const TEST_SESSION_ID = "test-ralph-" + Date.now();
const FLAG_PATH = `/tmp/nova-ralph-started-${TEST_SESSION_ID}.flag`;

beforeEach(() => {
	tmpCwd = mkdtempSync(join(tmpdir(), "ralph-test-"));
	try { unlinkSync(FLAG_PATH); } catch {}
});
afterEach(() => {
	try { rmSync(tmpCwd, { recursive: true, force: true }); } catch {}
	try { unlinkSync(FLAG_PATH); } catch {}
});

describe("ralph-loop UserPromptSubmit no-recreate", () => {
	it("第一次 UserPromptSubmit 建檔 + 寫 started flag", () => {
		ralphLoopOn.UserPromptSubmit({
			cwd: tmpCwd,
			session_id: TEST_SESSION_ID,
			prompt: "8 項任務清單原始內容",
		});
		const ralphFile = join(tmpCwd, ".claude/ralph-loop.local.md");
		expect(existsSync(ralphFile)).toBe(true);
		expect(readFileSync(ralphFile, "utf-8")).toContain("8 項任務清單原始內容");
		expect(existsSync(FLAG_PATH)).toBe(true);
	});

	it("第二次 UserPromptSubmit 不覆寫（檔案還在）", () => {
		ralphLoopOn.UserPromptSubmit({
			cwd: tmpCwd,
			session_id: TEST_SESSION_ID,
			prompt: "原始任務",
		});
		const before = readFileSync(join(tmpCwd, ".claude/ralph-loop.local.md"), "utf-8");
		ralphLoopOn.UserPromptSubmit({
			cwd: tmpCwd,
			session_id: TEST_SESSION_ID,
			prompt: "後續追問訊息",
		});
		const after = readFileSync(join(tmpCwd, ".claude/ralph-loop.local.md"), "utf-8");
		expect(after).toBe(before);
		expect(after).toContain("原始任務");
		expect(after).not.toContain("後續追問訊息");
	});

	it("Stop 刪檔後第二次 UserPromptSubmit 也不重建（防本 bug）", () => {
		// 1. 首次建檔
		ralphLoopOn.UserPromptSubmit({
			cwd: tmpCwd,
			session_id: TEST_SESSION_ID,
			prompt: "原始 8 項任務清單",
		});
		const ralphFile = join(tmpCwd, ".claude/ralph-loop.local.md");
		expect(existsSync(ralphFile)).toBe(true);

		// 2. 模擬 Stop hook 刪檔（promise 匹配 / max 達成 / phase 5）
		unlinkSync(ralphFile);
		expect(existsSync(ralphFile)).toBe(false);

		// 3. 後續使用者訊息 — 關鍵測試：不該重建
		ralphLoopOn.UserPromptSubmit({
			cwd: tmpCwd,
			session_id: TEST_SESSION_ID,
			prompt: "你之前問我 ask 我用了全短期跟全中期",
		});
		expect(existsSync(ralphFile)).toBe(false);
	});

	it("不同 session 可以各自 auto-create（session 隔離）", () => {
		const sessionA = "session-A-" + Date.now();
		const sessionB = "session-B-" + Date.now();
		const flagA = `/tmp/nova-ralph-started-${sessionA}.flag`;
		const flagB = `/tmp/nova-ralph-started-${sessionB}.flag`;
		try { unlinkSync(flagA); } catch {}
		try { unlinkSync(flagB); } catch {}

		const tmpA = mkdtempSync(join(tmpdir(), "ralph-A-"));
		const tmpB = mkdtempSync(join(tmpdir(), "ralph-B-"));
		try {
			ralphLoopOn.UserPromptSubmit({ cwd: tmpA, session_id: sessionA, prompt: "A 的任務" });
			ralphLoopOn.UserPromptSubmit({ cwd: tmpB, session_id: sessionB, prompt: "B 的任務" });
			expect(readFileSync(join(tmpA, ".claude/ralph-loop.local.md"), "utf-8")).toContain("A 的任務");
			expect(readFileSync(join(tmpB, ".claude/ralph-loop.local.md"), "utf-8")).toContain("B 的任務");
		} finally {
			rmSync(tmpA, { recursive: true, force: true });
			rmSync(tmpB, { recursive: true, force: true });
			try { unlinkSync(flagA); } catch {}
			try { unlinkSync(flagB); } catch {}
		}
	});

	it("slash command 不觸發 auto-create（既有行為保留）", () => {
		ralphLoopOn.UserPromptSubmit({
			cwd: tmpCwd,
			session_id: TEST_SESSION_ID,
			prompt: "/ralph-loop 啟動新迴圈",
		});
		expect(existsSync(join(tmpCwd, ".claude/ralph-loop.local.md"))).toBe(false);
		expect(existsSync(FLAG_PATH)).toBe(false);
	});

	it("dispatch 通知訊息不觸發 auto-create（既有行為保留）", () => {
		ralphLoopOn.UserPromptSubmit({
			cwd: tmpCwd,
			session_id: TEST_SESSION_ID,
			prompt: "你有來自 nova-manager 的跨專案任務",
		});
		expect(existsSync(join(tmpCwd, ".claude/ralph-loop.local.md"))).toBe(false);
	});
});
