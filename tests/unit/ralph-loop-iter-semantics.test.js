// ralph-loop iter 語義鎖定 test (xd-tnek 方案 C)
//
// iteration 語義：Stop 被擋下後累計恢復次數（stop-recovery count），
// 不是業務迭代進度。
// - promise 匹配 → session 正常結束 → iteration 不變 + ralphFile 被刪
// - promise 未匹配 → iteration++ → ralphFile 被寫回

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { on as ralphLoopOn } from "../../../../.claude/hooks/modules/ralph-loop.js";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpCwd;
const sessionId = "iter-sem-test-" + Date.now();
const flagPath = `/tmp/nova-ralph-started-${sessionId}.flag`;

function writeState(fm, body = "測試任務") {
	const dir = join(tmpCwd, ".claude");
	mkdirSync(dir, { recursive: true });
	const frontmatter = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
	writeFileSync(join(dir, "ralph-loop.local.md"), `---\n${frontmatter}\n---\n\n${body}\n`);
}

function stateFile() {
	return join(tmpCwd, ".claude/ralph-loop.local.md");
}

function readIteration() {
	if (!existsSync(stateFile())) return null;
	const content = readFileSync(stateFile(), "utf-8");
	const m = content.match(/^iteration:\s*(\d+)/m);
	return m ? parseInt(m[1], 10) : null;
}

beforeEach(() => {
	tmpCwd = mkdtempSync(join(tmpdir(), "iter-sem-"));
	try { unlinkSync(flagPath); } catch { /* not exists */ }
	writeFileSync(flagPath, new Date().toISOString());
});
afterEach(() => {
	try { rmSync(tmpCwd, { recursive: true, force: true }); } catch { /* ignore */ }
	try { unlinkSync(flagPath); } catch { /* ignore */ }
});

describe("ralph-loop iteration 語義鎖定 (xd-tnek 方案 C)", () => {
	it("promise 匹配 → session 結束 → iteration 不變 → ralphFile 被刪", async () => {
		writeState({
			active: "true",
			iteration: 5,
			session_id: sessionId,
			max_iterations: 100,
			completion_promise: `"DONE"`,
		});
		const before = readIteration();
		expect(before).toBe(5);

		await ralphLoopOn.Stop({
			cwd: tmpCwd,
			session_id: sessionId,
			last_assistant_message: "任務完成 <promise>DONE</promise>",
		});

		// ralphFile 應被刪除（匹配 promise → session 正常結束）
		expect(existsSync(stateFile())).toBe(false);
		// 這是語義鎖定：iteration 沒機會 ++（因為已匹配）— 透過刪檔驗證不再 recover
	});

	it("promise 未匹配 → iteration++ → ralphFile 被寫回（stop-recovery 累積）", async () => {
		writeState({
			active: "true",
			iteration: 5,
			session_id: sessionId,
			max_iterations: 100,
			completion_promise: `"DONE"`,
		});
		const before = readIteration();
		expect(before).toBe(5);

		// last_assistant_message 無 <promise>DONE</promise> → 視為未完成
		await ralphLoopOn.Stop({
			cwd: tmpCwd,
			session_id: sessionId,
			last_assistant_message: "我還在工作中",
		});

		// ralphFile 應仍存在且 iteration 遞增為 6（stop-recovery count +1）
		expect(existsSync(stateFile())).toBe(true);
		const after = readIteration();
		expect(after).toBe(6);
	});

	it("parseFrontmatter JSDoc 有語義鎖定標記（code-level 守護）", () => {
		const source = readFileSync(
			join(process.env.HOME, ".claude/hooks/modules/ralph-loop.js"),
			"utf-8",
		);
		// JSDoc 必須含明確的 stop-recovery 語義說明
		expect(source).toContain("stop-recovery count");
		expect(source).toContain("不是業務迭代進度");
	});
});
