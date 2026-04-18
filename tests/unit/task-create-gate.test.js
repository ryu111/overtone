import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	readRoutingLevel,
	countTaskCreatesInSession,
	checkTaskCreateGate,
} from "../../../../.claude/hooks/modules/task-create-gate.js";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

// 這些 test 會寫 /tmp/nova-routing-level-*.txt 做 fixture，避免污染真實檔
const FIXTURE_PROJECT = "task-create-gate-test-proj";
const ROUTING_PATH = `/tmp/nova-routing-level-${FIXTURE_PROJECT}.txt`;

function setRoutingLevel(level) {
	writeFileSync(ROUTING_PATH, level + "\n");
}

function clearRoutingLevel() {
	try { unlinkSync(ROUTING_PATH); } catch {}
}

// Fixture cwd 要對應 cwdToProject 能回 FIXTURE_PROJECT
// cwdToProject 先讀 data/projects.json，fallback 到 basename — 我們用 basename fallback
const FIXTURE_CWD = `/tmp/${FIXTURE_PROJECT}`;

let tmpDir;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "task-create-gate-"));
	clearRoutingLevel();
});

afterEach(() => {
	try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
	clearRoutingLevel();
});

describe("readRoutingLevel", () => {
	it("routing 檔不存在 → null", () => {
		expect(readRoutingLevel(FIXTURE_CWD)).toBeNull();
	});

	it("讀取 D3 → 回 'D3'", () => {
		setRoutingLevel("D3");
		expect(readRoutingLevel(FIXTURE_CWD)).toBe("D3");
	});

	it("讀取 D0 → 回 'D0'", () => {
		setRoutingLevel("D0");
		expect(readRoutingLevel(FIXTURE_CWD)).toBe("D0");
	});

	it("垃圾內容 → null（只認 D[0-4]）", () => {
		setRoutingLevel("abc123");
		expect(readRoutingLevel(FIXTURE_CWD)).toBeNull();
	});
});

describe("countTaskCreatesInSession", () => {
	it("無 cwd / sessionId → 0", () => {
		expect(countTaskCreatesInSession(null, null)).toBe(0);
		expect(countTaskCreatesInSession(FIXTURE_CWD, null)).toBe(0);
	});

	it("jsonl 不存在 → 0", () => {
		expect(countTaskCreatesInSession(FIXTURE_CWD, "missing-session")).toBe(0);
	});

	it("jsonl 有 2 次 TaskCreate → 2", () => {
		const sessionId = "count-test";
		const cwd = "/Users/sbu/projects/tcg-fixture";
		const encoded = cwd.replace(/\//g, "-");
		const projDir = join(homedir(), ".claude/projects", encoded);
		mkdirSync(projDir, { recursive: true });
		const jsonlPath = join(projDir, `${sessionId}.jsonl`);
		writeFileSync(jsonlPath, `{"message":{"content":[{"type":"tool_use","name":"TaskCreate"}]}}\n{"message":{"content":[{"type":"tool_use","name":"TaskCreate"}]}}\n`);
		expect(countTaskCreatesInSession(cwd, sessionId)).toBe(2);
		try { rmSync(projDir, { recursive: true, force: true }); } catch {}
	});
});

describe("checkTaskCreateGate", () => {
	it("無 cwd → allow 不 warn", () => {
		const r = checkTaskCreateGate({});
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toBeUndefined();
	});

	it("無 routing level → allow 不 warn", () => {
		const r = checkTaskCreateGate({ cwd: FIXTURE_CWD, session_id: "x" });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toBeUndefined();
	});

	it("D0 + 無 task → allow 不 warn（D0/D1 跳過）", () => {
		setRoutingLevel("D0");
		const r = checkTaskCreateGate({ cwd: FIXTURE_CWD, session_id: "none" });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toBeUndefined();
	});

	it("D1 + 無 task → allow 不 warn", () => {
		setRoutingLevel("D1");
		const r = checkTaskCreateGate({ cwd: FIXTURE_CWD, session_id: "none" });
		expect(r.systemMessage).toBeUndefined();
	});

	it("D2 + 無 task → allow + warn systemMessage", () => {
		setRoutingLevel("D2");
		const r = checkTaskCreateGate({ cwd: FIXTURE_CWD, session_id: "no-jsonl" });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toContain("D2");
		expect(r.systemMessage).toContain("TaskCreate");
	});

	it("D3 + 無 task → allow + warn systemMessage", () => {
		setRoutingLevel("D3");
		const r = checkTaskCreateGate({ cwd: FIXTURE_CWD, session_id: "no-jsonl" });
		expect(r.systemMessage).toContain("D3");
	});

	it("D4 + 無 task → allow + warn systemMessage", () => {
		setRoutingLevel("D4");
		const r = checkTaskCreateGate({ cwd: FIXTURE_CWD, session_id: "no-jsonl" });
		expect(r.systemMessage).toContain("D4");
	});

	it("D3 + 有 task → allow 不 warn", () => {
		setRoutingLevel("D3");
		const sessionId = "has-task";
		const cwd = "/Users/sbu/projects/tcg-with-task";
		const encoded = cwd.replace(/\//g, "-");
		// 寫到 FIXTURE cwd basename 匹配的 routing，同時 jsonl 也要匹配 cwd
		// 但 readRoutingLevel 用的 project 是 FIXTURE_CWD (tcg-with-task)
		const projDir = join(homedir(), ".claude/projects", encoded);
		mkdirSync(projDir, { recursive: true });
		const jsonlPath = join(projDir, `${sessionId}.jsonl`);
		writeFileSync(jsonlPath, `{"message":{"content":[{"type":"tool_use","name":"TaskCreate"}]}}\n`);
		// 這個 cwd 對應 basename "tcg-with-task"
		writeFileSync(`/tmp/nova-routing-level-tcg-with-task.txt`, "D3\n");
		const r = checkTaskCreateGate({ cwd, session_id: sessionId });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toBeUndefined();
		try { rmSync(projDir, { recursive: true, force: true }); } catch {}
		try { unlinkSync(`/tmp/nova-routing-level-tcg-with-task.txt`); } catch {}
	});
});
