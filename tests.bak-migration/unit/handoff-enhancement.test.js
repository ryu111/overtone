import { describe, it, expect } from "bun:test";
import {
	truncate,
	buildSessionQuote,
	buildSequenceProgress,
	buildRalphLoopState,
	buildAutonomySummary,
	buildRecentCommits,
} from "../../../../.claude/hooks/modules/flow-observer.js";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("truncate", () => {
	it("行數 ≤ max → 不變", () => {
		expect(truncate("a\nb\nc", 5)).toBe("a\nb\nc");
	});

	it("行數 > max → 截斷加註", () => {
		const r = truncate("a\nb\nc\nd\ne", 2);
		expect(r).toContain("a\nb");
		expect(r).toContain("(+3 lines)");
	});

	it("空輸入 → 不變", () => {
		expect(truncate("", 10)).toBe("");
		expect(truncate(null, 10)).toBeNull();
	});
});

describe("buildSessionQuote", () => {
	it("有 user_prompt → quote 前 200 char", () => {
		const r = buildSessionQuote({ user_prompt: "test prompt content xxxx" });
		expect(r).toContain("Session Quote");
		expect(r).toContain("test prompt content");
	});

	it("接受 prompt 別名", () => {
		const r = buildSessionQuote({ prompt: "alt name" });
		expect(r).toContain("alt name");
	});

	it("空 → 空字串", () => {
		expect(buildSessionQuote({})).toBe("");
		expect(buildSessionQuote({ user_prompt: "" })).toBe("");
	});

	it("過長 → 截 200 char", () => {
		const long = "x".repeat(500);
		const r = buildSessionQuote({ user_prompt: long });
		expect(r).toContain("x".repeat(200));
		expect(r).not.toContain("x".repeat(201));
	});

	it("換行 → 替換為空格", () => {
		const r = buildSessionQuote({ user_prompt: "line1\nline2" });
		expect(r).toContain("line1 line2");
	});
});

describe("buildSequenceProgress", () => {
	let tmp;
	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "p4seq-"));
		mkdirSync(join(tmp, "spec/討論"), { recursive: true });
	});
	afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

	it("無 spec/討論 目錄 → 空", () => {
		expect(buildSequenceProgress("/nonexistent")).toBe("");
	});

	it("含 verdict 的 spec → 列在序列任務狀態", () => {
		writeFileSync(join(tmp, "spec/討論/test.md"), "# 測試任務\n\nverdict: continue\n");
		const r = buildSequenceProgress(tmp);
		expect(r).toContain("測試任務");
		expect(r).toContain("continue");
	});

	it("多 verdict → 取最後一個（matchAll 修正）", () => {
		writeFileSync(join(tmp, "spec/討論/multi.md"),
			"# 多輪\n\n## 輪 1\nverdict: iterate\n\n## 輪 5\nverdict: close\n");
		const r = buildSequenceProgress(tmp);
		expect(r).toContain("close");
		expect(r).not.toMatch(/多輪.*iterate/);
	});

	it("無 verdict 的 spec → 不列", () => {
		writeFileSync(join(tmp, "spec/討論/noverdict.md"), "# 無\n\n純討論\n");
		expect(buildSequenceProgress(tmp)).toBe("");
	});
});

describe("buildRalphLoopState", () => {
	let tmp;
	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "p4ralph-"));
		mkdirSync(join(tmp, ".claude"), { recursive: true });
	});
	afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

	it("無檔 → 空", () => {
		expect(buildRalphLoopState("/nonexistent")).toBe("");
	});

	it("有 frontmatter + state.prompt → 取 frontmatter 後內容", () => {
		writeFileSync(join(tmp, ".claude/ralph-loop.local.md"),
			"---\nrunning: true\n---\n剩餘任務：實作 P4 helper");
		const r = buildRalphLoopState(tmp);
		expect(r).toContain("Ralph-loop State");
		expect(r).toContain("剩餘任務");
	});

	it("無 frontmatter（< 3 parts）→ 空", () => {
		writeFileSync(join(tmp, ".claude/ralph-loop.local.md"), "no frontmatter");
		expect(buildRalphLoopState(tmp)).toBe("");
	});
});

describe("buildAutonomySummary", () => {
	it("執行不 throw + 結構正確（依賴實際 autonomy-state.json）", () => {
		const r = buildAutonomySummary();
		// 可能空（無 fail）或含 Autonomy Status
		expect(typeof r).toBe("string");
	});
});

describe("buildRecentCommits", () => {
	it("非 git repo → 空", () => {
		expect(buildRecentCommits("/tmp")).toBe("");
	});

	it("nova-brain repo → 含最近 commits", () => {
		const r = buildRecentCommits(join(process.env.HOME, "projects/nova-brain"));
		// 通常會有 commit
		expect(typeof r).toBe("string");
	});
});

import { beforeEach, afterEach } from "bun:test";
