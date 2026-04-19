// self-compact-event-flow.test.js — spec/進行中/self-compact-event-driven.md
// 驗 flow-observer.js 5 個 handler 寫入事件 flag 供 scripts/self-compact.js 等待
// Stop / SessionEnd / SessionStart / PostCompact → 各自寫 /tmp/nova-session-*-<project>.flag
// UserPromptSubmit → 清除 4 個 flag（one-shot）

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FLOW_OBSERVER = join(homedir(), ".claude/hooks/modules/flow-observer.js");
const TEST_PROJECT = "test-event-flow";
const TEST_CWD = `/Users/test/projects/${TEST_PROJECT}`;

const FLAGS = {
	stopped: `/tmp/nova-session-stopped-${TEST_PROJECT}.flag`,
	ended: `/tmp/nova-session-ended-${TEST_PROJECT}.flag`,
	started: `/tmp/nova-session-started-${TEST_PROJECT}.flag`,
	compactDone: `/tmp/nova-session-compact-done-${TEST_PROJECT}.flag`,
};

function cleanAll() {
	for (const f of Object.values(FLAGS)) rmSync(f, { force: true });
}

describe("self-compact event flag 寫入", () => {
	beforeEach(() => cleanAll());
	afterEach(() => cleanAll());

	test("Stop handler 寫 stopped flag，payload 含 ts + session_id + stop_reason", async () => {
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}stop`);
		mod.on.Stop({ cwd: TEST_CWD, session_id: "sid-stop-1", stop_reason: "end_turn" });
		expect(existsSync(FLAGS.stopped)).toBe(true);
		const p = JSON.parse(readFileSync(FLAGS.stopped, "utf-8"));
		expect(typeof p.ts).toBe("number");
		expect(p.session_id).toBe("sid-stop-1");
		expect(p.stop_reason).toBe("end_turn");
	});

	test("SessionEnd handler 寫 ended flag，payload 含 ts + session_id", async () => {
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}end`);
		mod.on.SessionEnd({ cwd: TEST_CWD, session_id: "sid-end-1" });
		expect(existsSync(FLAGS.ended)).toBe(true);
		const p = JSON.parse(readFileSync(FLAGS.ended, "utf-8"));
		expect(typeof p.ts).toBe("number");
		expect(p.session_id).toBe("sid-end-1");
	});

	test("SessionStart handler 寫 started flag，payload 含 source 辨別觸發源", async () => {
		delete process.env.NOVA_HOOK_TEST; // flag 寫入在 !_isTest 分支
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}start`);
		mod.on.SessionStart({ cwd: TEST_CWD, session_id: "sid-start-1", source: "clear" });
		expect(existsSync(FLAGS.started)).toBe(true);
		const p = JSON.parse(readFileSync(FLAGS.started, "utf-8"));
		expect(p.source).toBe("clear");
		expect(p.session_id).toBe("sid-start-1");
	});

	test("SessionStart handler 無 source 時 payload.source 為 startup fallback", async () => {
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}fallback`);
		mod.on.SessionStart({ cwd: TEST_CWD, session_id: "sid-start-2" });
		expect(existsSync(FLAGS.started)).toBe(true);
		const p = JSON.parse(readFileSync(FLAGS.started, "utf-8"));
		expect(p.source).toBe("startup");
	});

	test("PostCompact handler 寫 compact-done flag", async () => {
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}post`);
		mod.on.PostCompact({ cwd: TEST_CWD, session_id: "sid-post-1", compact_summary: "test" });
		expect(existsSync(FLAGS.compactDone)).toBe(true);
		const p = JSON.parse(readFileSync(FLAGS.compactDone, "utf-8"));
		expect(typeof p.ts).toBe("number");
		expect(p.session_id).toBe("sid-post-1");
	});
});

describe("UserPromptSubmit flag 清除（one-shot 避 stale）", () => {
	beforeEach(() => cleanAll());
	afterEach(() => cleanAll());

	test("UserPromptSubmit 觸發時清除 4 個 flag", async () => {
		// 預先寫 4 個 flag
		for (const f of Object.values(FLAGS)) {
			writeFileSync(f, JSON.stringify({ ts: Date.now(), session_id: "stale" }));
		}
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}ups`);
		mod.on.UserPromptSubmit({ cwd: TEST_CWD, prompt: "hello" });
		for (const [name, path] of Object.entries(FLAGS)) {
			expect({ flag: name, exists: existsSync(path) }).toEqual({ flag: name, exists: false });
		}
	});

	test("UserPromptSubmit 無 cwd 時不崩潰（fail-safe）", async () => {
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}ups2`);
		expect(() => mod.on.UserPromptSubmit({ prompt: "hi" })).not.toThrow();
	});
});

describe("self-compact.js waitForFlag stale 過濾", () => {
	test("scripts/self-compact.js 原始碼含 stale 過濾邏輯（flag.ts ≥ scriptStartMs）", () => {
		const src = readFileSync(join(homedir(), ".claude/scripts/self-compact.js"), "utf-8");
		expect(src).toContain("payload.ts < scriptStartMs");
		expect(src).toContain("waitForFlag");
		expect(src).toContain("fs.watch") || expect(src).toContain("watch(dirname");
	});

	test("self-compact.js 含 lock flag 取代時間冷卻", () => {
		const src = readFileSync(join(homedir(), ".claude/scripts/self-compact.js"), "utf-8");
		expect(src).toContain("nova-compact-lock-");
		expect(src).toContain("acquireLock");
		expect(src).toContain("releaseLock");
		// 不應再用 COOLDOWN_MS 時間窗
		expect(src).not.toContain("COOLDOWN_MS");
	});

	test("self-compact.js 刪除所有 time-based polling / idle heuristic", () => {
		const src = readFileSync(join(homedir(), ".claude/scripts/self-compact.js"), "utf-8");
		expect(src).not.toContain("IDLE_THRESHOLD_MS");
		expect(src).not.toContain("waitForIdle");
		expect(src).not.toContain("waitForCtxUpdate");
	});

	test("self-compact.js S7 使用 session_id 配對而非時間", () => {
		const src = readFileSync(join(homedir(), ".claude/scripts/self-compact.js"), "utf-8");
		expect(src).toContain("preExitSid");
		expect(src).toContain("p.session_id === preExitSid");
	});
});

describe("reviewer blocking 修復（2026-04-19）", () => {
	const flowObserverSrc = readFileSync(join(homedir(), ".claude/hooks/modules/flow-observer.js"), "utf-8");
	const selfCompactSrc = readFileSync(join(homedir(), ".claude/scripts/self-compact.js"), "utf-8");

	test("B1. PostCompact 讀 LOCK_FILE 存在判斷 self-compact（不再用 dead cooldown 檔）", () => {
		// 原：讀 /tmp/nova-compact-cooldown-<project>.txt + time window
		// 新：讀 /tmp/nova-compact-lock-<project>.flag existsSync
		expect(flowObserverSrc).toContain("nova-compact-lock-");
		expect(flowObserverSrc).toContain("existsSync(lockPath)");
		// 不應再讀 cooldown 檔
		const postCompactSection = flowObserverSrc.substring(flowObserverSrc.indexOf("PostCompact: (input)"));
		expect(postCompactSection).not.toContain("nova-compact-cooldown-");
	});

	test("B2. S4b 消耗 STARTED_FLAG 避免 S7 讀殘留", () => {
		// S4b 成功後 unlinkSync(STARTED_FLAG)
		const s4bIdx = selfCompactSrc.indexOf("S4b ✓ /clear processed");
		expect(s4bIdx).toBeGreaterThan(-1);
		const afterS4b = selfCompactSrc.slice(s4bIdx, s4bIdx + 500);
		expect(afterS4b).toMatch(/unlinkSync\s*\(\s*STARTED_FLAG/);
	});

	test("B2. S7 第二次 waitForFlag STARTED_FLAG 含 validate（session_id !== preExitSid）", () => {
		const s7Idx = selfCompactSrc.indexOf("S7 ✓ new session started");
		expect(s7Idx).toBeGreaterThan(-1);
		const s7Block = selfCompactSrc.slice(Math.max(0, s7Idx - 500), s7Idx);
		expect(s7Block).toMatch(/session_id\s*!==\s*preExitSid/);
	});

	test("B3+B4. 所有 flag 寫入使用 atomic rename（writeFlagAtomic helper）", () => {
		expect(flowObserverSrc).toContain("function writeFlagAtomic");
		expect(flowObserverSrc).toContain("renameSync");
		// helper 內部：writeFileSync(tmp) + renameSync(tmp, path)
		const helperIdx = flowObserverSrc.indexOf("function writeFlagAtomic");
		const helperEnd = flowObserverSrc.indexOf("}", helperIdx + 100);
		const helperSrc = flowObserverSrc.slice(helperIdx, helperEnd);
		expect(helperSrc).toMatch(/writeFileSync\s*\(\s*tmp/);
		expect(helperSrc).toMatch(/renameSync\s*\(\s*tmp/);
	});

	test("B3+B4. Stop / SessionEnd / SessionStart / PostCompact 4 handler 皆用 writeFlagAtomic", () => {
		// Stop
		const stopIdx = flowObserverSrc.indexOf("Stop: (input)");
		const stopEnd = flowObserverSrc.indexOf("InstructionsLoaded:", stopIdx);
		const stopBlock = flowObserverSrc.slice(stopIdx, stopEnd);
		expect(stopBlock).toMatch(/writeFlagAtomic\s*\([^)]*nova-session-stopped-/);

		// SessionEnd
		const endIdx = flowObserverSrc.indexOf("SessionEnd: (input)");
		const endBlock = flowObserverSrc.slice(endIdx, endIdx + 2000);
		expect(endBlock).toMatch(/writeFlagAtomic\s*\([^)]*nova-session-ended-/);

		// SessionStart
		const startIdx = flowObserverSrc.indexOf("SessionStart: (input)");
		const startBlock = flowObserverSrc.slice(startIdx, startIdx + 2000);
		expect(startBlock).toMatch(/writeFlagAtomic\s*\([^)]*nova-session-started-/);

		// PostCompact
		const postIdx = flowObserverSrc.indexOf("PostCompact: (input)");
		const postBlock = flowObserverSrc.slice(postIdx, postIdx + 2000);
		expect(postBlock).toMatch(/writeFlagAtomic\s*\([^)]*nova-session-compact-done-/);
	});

	test("B5. self-compact.js 加 uncaughtException + unhandledRejection handler 釋放 lock", () => {
		expect(selfCompactSrc).toMatch(/process\.on\s*\(\s*["']uncaughtException["']/);
		expect(selfCompactSrc).toMatch(/process\.on\s*\(\s*["']unhandledRejection["']/);
		// 兩個 handler 內都呼叫 releaseLock
		const uncaughtIdx = selfCompactSrc.indexOf('"uncaughtException"');
		const uncaughtBlock = selfCompactSrc.slice(uncaughtIdx, uncaughtIdx + 200);
		expect(uncaughtBlock).toContain("releaseLock()");
	});

	test("B7. SessionStart flag 寫入在 !_isTest guard **外**（不受 NOVA_HOOK_TEST 影響）", () => {
		const startIdx = flowObserverSrc.indexOf("SessionStart: (input)");
		const isTestIdx = flowObserverSrc.indexOf("if (input?.session_id && !_isTest)", startIdx);
		const flagWriteIdx = flowObserverSrc.indexOf("nova-session-started-", startIdx);
		// flag 寫入必須在 _isTest guard 之前（line 較小）
		expect(flagWriteIdx).toBeGreaterThan(-1);
		expect(flagWriteIdx).toBeLessThan(isTestIdx);
	});

	test("acquireLock: pid alive 時無條件退出（不看 age）", () => {
		const lockIdx = selfCompactSrc.indexOf("function acquireLock");
		const lockEnd = selfCompactSrc.indexOf("function releaseLock");
		const lockBlock = selfCompactSrc.slice(lockIdx, lockEnd);
		// 不應有「if (age < LOCK_STALE_MS)」實際判斷邏輯（`//` 註解引用歷史 OK）
		// 過濾註解行再驗
		const codeOnly = lockBlock.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
		expect(codeOnly).not.toMatch(/age\s*<\s*LOCK_STALE_MS/);
		// pid alive 分支必含 return false
		expect(lockBlock).toMatch(/process\.kill\s*\(\s*payload\.pid\s*,\s*0\s*\)[\s\S]*?return\s+false/);
		// LOCK_STALE_MS 常數應已刪除（檔頂不宣告）
		const topDecl = selfCompactSrc.slice(0, selfCompactSrc.indexOf("function acquireLock"));
		expect(topDecl).not.toMatch(/^const\s+LOCK_STALE_MS\s*=/m);
	});
});
