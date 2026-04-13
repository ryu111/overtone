import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MODULE_PATH = join(homedir(), ".claude/hooks/modules/task-dispatch-guard.js");

const TEST_CWD = "/tmp/nova-manager-task-dispatch-test";
const TEST_SESSION_ID = "test-session-abc";
const ENCODED = TEST_CWD.replace(/\//g, "-");
const SESSION_DIR = join(homedir(), ".claude/projects", ENCODED);
const JSONL_PATH = join(SESSION_DIR, `${TEST_SESSION_ID}.jsonl`);

const COMPACT_MARKER = '"content":"This session is being continued from a previous conversation"';

beforeEach(() => {
	mkdirSync(SESSION_DIR, { recursive: true });
	// 清空 task-reminder 計數器（每測試獨立）
	try { rmSync(`/tmp/nova-task-reminder-${TEST_SESSION_ID}.txt`); } catch {}
});
afterEach(() => {
	try { rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
	try { rmSync(`/tmp/nova-task-reminder-${TEST_SESSION_ID}.txt`); } catch {}
});

function writeJsonl(content) {
	writeFileSync(JSONL_PATH, content);
}

function dispatchLine(id) {
	// 模擬 API 回應中的 dispatch id（jsonl tool_result 是 escaped 形式）
	return `{"type":"tool_result","content":"{\\"ok\\":true,\\"id\\":\\"${id}\\"}"}`;
}

function rawDispatchLine(id) {
	// 模擬直接寫到 jsonl 的 raw 形式
	return `{"id":"${id}","status":"pending"}`;
}

describe("task-dispatch-guard", () => {
	test("非 nova-manager cwd 直接放行（不強制 TaskCreate）", async () => {
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const result = mod.checkDispatchTaskBalance("/tmp/other-project", "any-session");
		expect(result.shouldBlock).toBe(false);
		expect(result.dispatchCount).toBe(0);
	});

	test("純對話 session（dispatch=0）放行", async () => {
		writeJsonl('{"name":"Read"}\n{"name":"Grep"}\n');
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const result = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(result.decision).toBe("allow");
	});

	test("dispatch === taskCreate（平衡）放行", async () => {
		writeJsonl(
			`${dispatchLine("xd-1775729535985-abcd")}\n` +
			`${dispatchLine("xd-1775729535986-efgh")}\n` +
			`{"name":"TaskCreate"}\n{"name":"TaskCreate"}\n`
		);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const check = mod.checkDispatchTaskBalance(TEST_CWD, TEST_SESSION_ID);
		expect(check.dispatchCount).toBe(2);
		expect(check.taskCreateCount).toBe(2);
		expect(check.shouldBlock).toBe(false);
	});

	test("dispatch > taskCreate block 並給出原因", async () => {
		writeJsonl(
			`${dispatchLine("xd-1775729535985-a001")}\n` +
			`${dispatchLine("xd-1775729535986-a002")}\n` +
			`${dispatchLine("xd-1775729535987-a003")}\n`
		);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const result = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(result.decision).toBe("block");
		expect(result.reason).toContain("3 個 cross-dispatch");
		expect(result.reason).toContain("0 個 TaskCreate");
	});

	test("重複的 xd-ID 去重（唯一計數）", async () => {
		// 同一個 dispatch id 在 jsonl 出現多次（delivered、review、complete 三階段各寫一次）
		const id = "xd-1775729535985-dup1";
		writeJsonl(
			`${dispatchLine(id)}\n` +
			`${dispatchLine(id)}\n` +
			`${dispatchLine(id)}\n` +
			`{"name":"TaskCreate"}\n`
		);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const check = mod.checkDispatchTaskBalance(TEST_CWD, TEST_SESSION_ID);
		expect(check.dispatchCount).toBe(1);
		expect(check.shouldBlock).toBe(false);
	});

	test("compact marker 之前的 dispatch 不計入", async () => {
		// 歷史：5 個 dispatch + 0 task → compact → 1 dispatch + 1 task
		// 舊邏輯：6 dispatch / 1 task → block
		// 新邏輯：只計 compact 後 → 1 / 1 → allow
		const history = Array.from({ length: 5 }, (_, i) => dispatchLine(`xd-1775729500000-h00${i}`)).join("\n");
		const afterCompact = `{"type":"user","message":{${COMPACT_MARKER}}}\n` +
			`${dispatchLine("xd-1775729900000-new1")}\n` +
			`{"name":"TaskCreate"}\n`;
		writeJsonl(history + "\n" + afterCompact);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const check = mod.checkDispatchTaskBalance(TEST_CWD, TEST_SESSION_ID);
		expect(check.dispatchCount).toBe(1);
		expect(check.taskCreateCount).toBe(1);
		expect(check.shouldBlock).toBe(false);
	});

	test("無 compact marker 時計算全檔", async () => {
		writeJsonl(
			`${dispatchLine("xd-1775729535985-all1")}\n` +
			`${dispatchLine("xd-1775729535986-all2")}\n`
		);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const check = mod.checkDispatchTaskBalance(TEST_CWD, TEST_SESSION_ID);
		expect(check.dispatchCount).toBe(2);
	});

	test("raw 和 escaped 形式都能計數", async () => {
		writeJsonl(
			`${rawDispatchLine("xd-1775729535985-raw1")}\n` +
			`${dispatchLine("xd-1775729535986-esc1")}\n`
		);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const check = mod.checkDispatchTaskBalance(TEST_CWD, TEST_SESSION_ID);
		expect(check.dispatchCount).toBe(2);
	});

	test("cwd 或 session_id 缺失放行（fail-open）", async () => {
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		expect(mod.on.Stop({}).decision).toBe("allow");
		expect(mod.on.Stop({ cwd: TEST_CWD }).decision).toBe("allow");
		expect(mod.on.Stop({ session_id: "x" }).decision).toBe("allow");
	});

	test("jsonl 檔不存在放行（fail-open）", async () => {
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const result = mod.on.Stop({ cwd: "/nonexistent", session_id: "missing" });
		expect(result.decision).toBe("allow");
	});

	test("checkAskUserQuestionUsage: askCount=0 + optionPatterns>3 → warn=true", async () => {
		// 5 行 × 3 個字面 \n 列表 = 15 次，用 String.raw 產生字面 \n（模擬 jsonl JSON encoded 內容）
		const one = String.raw`{"content":"要不要做這個？\nA. 方案一\nB. 方案二\nC. 方案三"}`;
		writeJsonl(Array.from({ length: 5 }, () => one).join("\n"));
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const r = mod.checkAskUserQuestionUsage(TEST_CWD, TEST_SESSION_ID);
		expect(r.askCount).toBe(0);
		expect(r.optionPatterns).toBeGreaterThan(3);
		expect(r.warn).toBe(true);
	});

	test("checkAskUserQuestionUsage: askCount>=1 → warn=false（有用工具就放過）", async () => {
		const one = String.raw`{"content":"要不要做這個？\nA. 方案一\nB. 方案二\nC. 方案三"}`;
		const lines =
			`{"name":"AskUserQuestion"}\n` +
			Array.from({ length: 5 }, () => one).join("\n");
		writeJsonl(lines);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const r = mod.checkAskUserQuestionUsage(TEST_CWD, TEST_SESSION_ID);
		expect(r.askCount).toBeGreaterThanOrEqual(1);
		expect(r.warn).toBe(false);
	});

	test("checkAskUserQuestionUsage: 低於門檻（optionPatterns<=3）→ warn=false", async () => {
		writeJsonl(String.raw`{"content":"A. 方案一\nB. 方案二"}` + "\n"); // 1 次 match
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const r = mod.checkAskUserQuestionUsage(TEST_CWD, TEST_SESSION_ID);
		expect(r.optionPatterns).toBeLessThanOrEqual(3);
		expect(r.warn).toBe(false);
	});
});

describe("memory/行為替代結構修復的反模式偵測", () => {
	function assistantLine(text) {
		return JSON.stringify({ message: { role: "assistant", content: text } });
	}

	test("行為層面落地 → Stop 時應該有 systemMessage warn", async () => {
		writeJsonl(assistantLine("行為層面落地就好，不需要補進 rule。") + "\n" + `{"name":"TaskCreate"}\n`);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const r = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toContain("memory/行為替代結構修復");
	});

	test("先記著這個 → 應該偵測到反模式", async () => {
		writeJsonl(assistantLine("先記著這個問題。") + "\n" + `{"name":"TaskCreate"}\n`);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const r = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r.systemMessage).toContain("memory/行為替代結構修復");
	});

	test("要不要補進 rule → 應該偵測到反模式", async () => {
		writeJsonl(assistantLine("要不要補進 rule？") + "\n" + `{"name":"TaskCreate"}\n`);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const r = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r.systemMessage).toContain("memory/行為替代結構修復");
	});

	test("正常對話無反模式 → 不應該 warn", async () => {
		writeJsonl(assistantLine("已修改 rule 完成。") + "\n" + `{"name":"TaskCreate"}\n`);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const r = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage ?? "").not.toContain("memory/行為替代結構修復");
	});
});

describe("跳過 completed 直接 deleted 的偵測", () => {
	function taskUpdateLine(taskId, status) {
		return JSON.stringify({ name: "TaskUpdate", input: { taskId, status } });
	}

	test("直接 deleted 未經 completed → 應該 warn", async () => {
		writeJsonl(
			`{"name":"TaskCreate"}\n` +
			taskUpdateLine("42", "deleted") + "\n"
		);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const r = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r.systemMessage).toContain("跳過 completed 直接 deleted");
	});

	test("先 completed 再 deleted → 不應該 warn", async () => {
		writeJsonl(
			`{"name":"TaskCreate"}\n` +
			taskUpdateLine("42", "completed") + "\n" +
			taskUpdateLine("42", "deleted") + "\n"
		);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const r = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r.systemMessage ?? "").not.toContain("跳過 completed 直接 deleted");
	});

	test("無 TaskUpdate → 不應該 warn", async () => {
		writeJsonl(`{"name":"TaskCreate"}\n`);
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const r = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r.systemMessage ?? "").not.toContain("跳過 completed 直接 deleted");
	});
});

describe("task-reminder escalation (mrg5)", () => {
	// 模擬 5 次 Edit + 0 TaskCreate 的 jsonl
	function editsOnlyJsonl(n) {
		return Array.from({ length: n }, () => `{"name":"Edit","input":{}}`).join("\n");
	}

	test("substantiveWork ≥3 + 0 TaskCreate 第 1/2 次仍是 warn（systemMessage 含進度提示）", async () => {
		writeJsonl(editsOnlyJsonl(5));
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		// 第 1 次 Stop
		const r1 = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r1.decision).toBe("allow");
		expect(r1.systemMessage).toContain("第 1/3 次");
		// 第 2 次 Stop
		const r2 = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r2.decision).toBe("allow");
		expect(r2.systemMessage).toContain("第 2/3 次");
	});

	test("substantiveWork ≥3 + 0 TaskCreate 第 3 次升級為 block", async () => {
		// 對 jsonl 路徑用 nova-brain 模擬：必須讓 reminderCount 機制走完
		// 寫入 mock jsonl 並連續觸發 3 次 Stop
		writeJsonl(editsOnlyJsonl(5));
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		// 1
		mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		// 2
		mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		// 3 → block
		const r3 = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r3.decision).toBe("block");
		expect(r3.reason).toContain("連續 3 次實質工作");
		expect(r3.reason).toContain("Plan-First");
	});

	test("出現 TaskCreate 後計數器重置（之後又 substantiveWork=5 才從 1 開始計）", async () => {
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		// 第 1 次：5 Edits 0 TaskCreate → count=1
		writeJsonl(editsOnlyJsonl(5));
		mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(mod.getReminderCount(TEST_SESSION_ID)).toBe(1);
		// 第 2 次：5 Edits + 1 TaskCreate → reset
		writeJsonl(editsOnlyJsonl(5) + '\n{"name":"TaskCreate","input":{}}');
		mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(mod.getReminderCount(TEST_SESSION_ID)).toBe(0);
		// 第 3 次：又退回 5 Edits 0 TaskCreate → 從 0 開始 → count=1（不是 2）
		writeJsonl(editsOnlyJsonl(5));
		const r3 = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
		expect(r3.decision).toBe("allow");
		expect(r3.systemMessage).toContain("第 1/3 次");
	});

	test("Read/Grep only session 永遠不觸發累計（substantiveWork=0）", async () => {
		writeJsonl([
			'{"name":"Read","input":{}}',
			'{"name":"Grep","input":{}}',
			'{"name":"Read","input":{}}',
			'{"name":"Grep","input":{}}',
			'{"name":"Bash","input":{"command":"git log --oneline"}}',
			'{"name":"Bash","input":{"command":"cat /tmp/x"}}',
		].join("\n"));
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		// 連跑 5 次都不該累計
		for (let i = 0; i < 5; i++) {
			const r = mod.on.Stop({ cwd: TEST_CWD, session_id: TEST_SESSION_ID });
			expect(r.decision).toBe("allow");
		}
		expect(mod.getReminderCount(TEST_SESSION_ID)).toBe(0);
	});

	test("getReminderCount/incrementReminderCount/resetReminderCount 純函式行為", async () => {
		const mod = await import(`${MODULE_PATH}?t=${Date.now()}`);
		const sid = `unit-${Date.now()}`;
		expect(mod.getReminderCount(sid)).toBe(0);
		expect(mod.incrementReminderCount(sid)).toBe(1);
		expect(mod.incrementReminderCount(sid)).toBe(2);
		expect(mod.getReminderCount(sid)).toBe(2);
		mod.resetReminderCount(sid);
		expect(mod.getReminderCount(sid)).toBe(0);
		// 缺 sessionId 安全
		expect(mod.getReminderCount(null)).toBe(0);
		expect(mod.incrementReminderCount(null)).toBe(0);
	});
});
