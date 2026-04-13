import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import {
	computeWaitS,
	readSpawnLock,
	writeSpawnLock,
	clearSpawnLock,
	MODEL_LOAD_TIMEOUT_MS,
	isPidAlive,
	shouldSkipSpawn,
} from "../../../../.claude/scripts/llm-watchdog.js";

const LOCK_FILE = "/tmp/nova-llm-spawning.json";

beforeEach(() => {
	try { if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE); } catch {}
});
afterEach(() => {
	try { if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE); } catch {}
});

describe("computeWaitS 指數退避", () => {
	test("failures=0 無等待", () => { expect(computeWaitS(0)).toBe(0); });
	test("failures=1 60s", () => { expect(computeWaitS(1)).toBe(60); });
	test("failures=2 120s", () => { expect(computeWaitS(2)).toBe(120); });
	test("failures=3 240s", () => { expect(computeWaitS(3)).toBe(240); });
	test("failures=5 960s", () => { expect(computeWaitS(5)).toBe(960); });
	test("failures=6 capped 1800s", () => { expect(computeWaitS(6)).toBe(1800); });
	test("failures=20 capped 1800s", () => { expect(computeWaitS(20)).toBe(1800); });
	test("負數 0", () => { expect(computeWaitS(-1)).toBe(0); });
});

describe("spawn lock 讀寫", () => {
	test("無 lockfile → readSpawnLock 回 null", () => {
		expect(readSpawnLock()).toBeNull();
	});

	test("寫入後讀取正確值", () => {
		writeSpawnLock({ pid: 12345, startedAt: 1776091000000 });
		const lock = readSpawnLock();
		expect(lock).not.toBeNull();
		expect(lock.pid).toBe(12345);
		expect(lock.startedAt).toBe(1776091000000);
	});

	test("lockfile JSON 壞掉 → 回 null（fail-safe）", () => {
		Bun.write(LOCK_FILE, "not json");
		expect(readSpawnLock()).toBeNull();
	});

	test("lockfile 缺欄位 → 回 null", () => {
		Bun.write(LOCK_FILE, JSON.stringify({ pid: 123 }));
		expect(readSpawnLock()).toBeNull();
	});

	test("clearSpawnLock 刪檔", () => {
		writeSpawnLock({ pid: 1, startedAt: 1 });
		expect(existsSync(LOCK_FILE)).toBe(true);
		clearSpawnLock();
		expect(existsSync(LOCK_FILE)).toBe(false);
	});

	test("clearSpawnLock 於無檔時不 throw", () => {
		expect(() => clearSpawnLock()).not.toThrow();
	});
});

describe("shouldSkipSpawn 決策 (xd-mfm0 改為純 age timeout)", () => {
	const now = 1776092000000;

	test("無 lock → 不 skip", () => {
		expect(shouldSkipSpawn(null, now)).toBe(false);
	});

	test("lock age 30s → skip (還在載入)", () => {
		const lock = { pid: 99999, startedAt: now - 30_000 };
		expect(shouldSkipSpawn(lock, now)).toBe(true);
	});

	test("lock age 60s → skip (xd-mfm0 bug 修復：不再因 pid 誤判而 kill)", () => {
		const lock = { pid: 99999, startedAt: now - 60_000 };
		expect(shouldSkipSpawn(lock, now)).toBe(true);
	});

	test("lock age 90s → skip (31B 載入中)", () => {
		const lock = { pid: 99999, startedAt: now - 90_000 };
		expect(shouldSkipSpawn(lock, now)).toBe(true);
	});

	test("lock age 179s → skip (尚未超時)", () => {
		const lock = { pid: 99999, startedAt: now - 179_000 };
		expect(shouldSkipSpawn(lock, now)).toBe(true);
	});

	test("lock age 180s 剛好 → 不 skip (當成載入失敗 allow retry)", () => {
		const lock = { pid: 99999, startedAt: now - 180_000 };
		expect(shouldSkipSpawn(lock, now)).toBe(false);
	});

	test("lock age 300s → 不 skip (超時當失敗)", () => {
		const lock = { pid: 99999, startedAt: now - 300_000 };
		expect(shouldSkipSpawn(lock, now)).toBe(false);
	});

	test("自訂 timeout 120s + age 100s → skip", () => {
		const lock = { pid: 99999, startedAt: now - 100_000 };
		expect(shouldSkipSpawn(lock, now, 120_000)).toBe(true);
	});
});

describe("MODEL_LOAD_TIMEOUT_MS 預設", () => {
	test("是 180 秒 (31B 4bit 載入 60s + 3x safety margin)", () => {
		expect(MODEL_LOAD_TIMEOUT_MS).toBe(180_000);
	});
});

describe("isPidAlive 邊界", () => {
	test("process.pid 是自己 → alive", () => {
		expect(isPidAlive(process.pid)).toBe(true);
	});

	test("極大 pid 不存在 → not alive", () => {
		expect(isPidAlive(999_999_999)).toBe(false);
	});

	test("spawn throw → 不 throw 而回 false", () => {
		const fakeSpawn = () => { throw new Error("ENOENT"); };
		expect(isPidAlive(123, fakeSpawn)).toBe(false);
	});
});
