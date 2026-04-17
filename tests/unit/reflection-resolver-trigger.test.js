// reflection-resolver-trigger.test.js — Wave 1 F1 hook module regression
// xd-1776385791431-r1im + Manager Round 8 B+6h debounce + nm 跳過
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const MODULE = join(homedir(), ".claude/hooks/modules/reflection-resolver-trigger.js");
const HOOK_CLIENT = join(homedir(), ".claude/hooks/hook-client.js");

const {
	readLastRan,
	writeLastRan,
	shouldSkipNovaManager,
	triggerResolveAll,
	on,
} = await import(MODULE);

const LAST_RAN_FILE = "/tmp/nova-reflection-resolver-last-ran.json";
function clearLastRan() {
	try { rmSync(LAST_RAN_FILE, { force: true }); } catch { /* ignore */ }
}

describe("reflection-resolver-trigger F1", () => {
	beforeEach(() => clearLastRan());
	afterEach(() => clearLastRan());

	test("應該 export SessionStart handler", () => {
		expect(typeof on.SessionStart).toBe("function");
	});

	test("nm session（/nova-manager 結尾）應該跳過", () => {
		expect(shouldSkipNovaManager("/Users/sbu/projects/nova-manager")).toBe(true);
		expect(shouldSkipNovaManager("/Users/sbu/projects/nova-brain")).toBe(false);
		expect(shouldSkipNovaManager("")).toBe(false);
	});

	test("readLastRan 無檔案回 {ts:0}", () => {
		clearLastRan();
		expect(readLastRan()).toEqual({ ts: 0 });
	});

	test("writeLastRan 寫入 ts + iso", () => {
		const t = Date.parse("2026-04-17T10:00:00Z");
		writeLastRan(t);
		const read = readLastRan();
		expect(read.ts).toBe(t);
		expect(read.iso).toBe("2026-04-17T10:00:00.000Z");
	});

	test("SessionStart nm cwd → 跳過不寫 last-ran", () => {
		clearLastRan();
		on.SessionStart({ cwd: "/Users/sbu/projects/nova-manager" });
		expect(readLastRan().ts).toBe(0);
	});

	test("SessionStart 6h 內再跑 → debounce 跳過", () => {
		const now = Date.now();
		writeLastRan(now - 1000); // 1 秒前剛跑過
		on.SessionStart({ cwd: "/Users/sbu/projects/nova-brain" });
		// last-ran 應保持 now-1000（未被覆寫），因 debounce 擋住不跑
		expect(readLastRan().ts).toBe(now - 1000);
	});

	test("triggerResolveAll 空目錄回 0", () => {
		const empty = mkdtempSync(join(tmpdir(), "f1-empty-"));
		try {
			expect(triggerResolveAll(empty)).toBe(0);
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});

	test("triggerResolveAll 只計有 data/reflections.jsonl 的 project", () => {
		const tmp = mkdtempSync(join(tmpdir(), "f1-scan-"));
		try {
			// alpha 有 reflections.jsonl
			mkdirSync(join(tmp, "alpha/data"), { recursive: true });
			writeFileSync(join(tmp, "alpha/data/reflections.jsonl"), "{}\n");
			// beta 無
			mkdirSync(join(tmp, "beta"), { recursive: true });
			const count = triggerResolveAll(tmp);
			expect(count).toBe(1);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("hook-client.js LOCAL_MODULES.SessionStart 含 reflection-resolver-trigger", () => {
		const src = readFileSync(HOOK_CLIENT, "utf-8");
		expect(src).toContain("reflection-resolver-trigger.js");
	});

	test("DEBOUNCE 常數 = 6 小時（以 ms 計）", () => {
		const src = readFileSync(MODULE, "utf-8");
		expect(src).toMatch(/6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
	});
});
