import { describe, it, expect } from "bun:test";
import { parseFrontmatter } from "../../../../.claude/hooks/modules/ralph-loop.js";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// 防回歸：completion_promise 缺失或 null 時 Phase 3.5/4 promise 匹配永遠 skip，
// 導致 Stop hook 被困在 block loop。修法是 parseFrontmatter 內 fallback
// 為 "DONE"。

describe("ralph-loop completion_promise fallback", () => {
	it("正常 frontmatter 含 DONE 直接讀出", () => {
		const content = `---\niteration: 1\ncompletion_promise: "DONE"\n---\nbody`;
		expect(parseFrontmatter(content).completion_promise).toBe("DONE");
	});

	it("USER_EXPLICIT_STOP 等其他 promise 值保留", () => {
		const content = `---\niteration: 1\ncompletion_promise: "USER_EXPLICIT_STOP"\n---\nbody`;
		expect(parseFrontmatter(content).completion_promise).toBe("USER_EXPLICIT_STOP");
	});

	it("缺欄位 fallback 為 DONE", () => {
		const content = `---\niteration: 27\nstatus: all-complete\n---\nbody`;
		expect(parseFrontmatter(content).completion_promise).toBe("DONE");
	});

	it("欄位值為 null 字串 fallback 為 DONE", () => {
		const content = `---\niteration: 1\ncompletion_promise: null\n---\nbody`;
		expect(parseFrontmatter(content).completion_promise).toBe("DONE");
	});

	it("欄位值為空字串 fallback 為 DONE", () => {
		const content = `---\niteration: 1\ncompletion_promise: \n---\nbody`;
		expect(parseFrontmatter(content).completion_promise).toBe("DONE");
	});

	it("無 frontmatter 回 null（不該觸發 fallback 邏輯）", () => {
		expect(parseFrontmatter("沒有 frontmatter 的內容")).toBeNull();
	});
});

describe("現有 ralph-loop.local.md 檔案稽核", () => {
	const projects = [
		"nova-brain", "nova-manager", "nova-control", "novaplay",
		"discord-raffle", "block-world", "company-work", "company-mbp",
		"claude-workflow",
	];

	for (const p of projects) {
		const path = join(homedir(), "projects", p, ".claude/ralph-loop.local.md");
		if (!existsSync(path)) continue;
		it(`${p}: 解析後有有效 completion_promise（fallback 兜底）`, () => {
			const fm = parseFrontmatter(readFileSync(path, "utf-8"));
			expect(fm).not.toBeNull();
			expect(fm.completion_promise).toBeTruthy();
			expect(fm.completion_promise).not.toBe("null");
			expect(fm.completion_promise).not.toBe("undefined");
		});
	}
});
