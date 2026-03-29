import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const WATCH_FILE = "/tmp/nova-regression-watches.json";
const WATCH_BACKUP = "/tmp/nova-regression-watches.json.bak";

let mod;

beforeEach(async () => {
	if (existsSync(WATCH_FILE)) writeFileSync(WATCH_BACKUP, readFileSync(WATCH_FILE));
	writeFileSync(WATCH_FILE, "[]");
	mod = await import("/Users/sbu/.claude/scripts/lib/regression-watch.js");
});

afterEach(() => {
	if (existsSync(WATCH_BACKUP)) {
		writeFileSync(WATCH_FILE, readFileSync(WATCH_BACKUP));
		unlinkSync(WATCH_BACKUP);
	}
});

describe("regression-watch", () => {
	test("createWatch 建立記錄正確", () => {
		const w = mod.createWatch({ fix_id: "fix-001", target_signal_type: "hook-error" });
		expect(w.fix_id).toBe("fix-001");
		expect(w.target_signal_type).toBe("hook-error");
		expect(w.status).toBe("watching");
		expect(w).toHaveProperty("created_at");
		expect(w).toHaveProperty("expires_at");
	});

	test("createWatch 重複 fix_id 不建新記錄", () => {
		mod.createWatch({ fix_id: "fix-dup", target_signal_type: "test" });
		mod.createWatch({ fix_id: "fix-dup", target_signal_type: "test" });
		const all = mod.loadWatches();
		expect(all.filter((w) => w.fix_id === "fix-dup").length).toBe(1);
	});

	test("checkRegressions 偵測到重新出現的 signal", () => {
		const w = mod.createWatch({ fix_id: "fix-reg", target_signal_type: "memory-leak" });
		const signals = [{ type: "memory-leak", ts: Date.now() }];
		const results = mod.checkRegressions(signals);
		expect(results.length).toBe(1);
		expect(results[0].status).toBe("regressed");
	});

	test("監控期過後自動標記 clear", () => {
		// 手動寫入一個已過期的 watch
		const expired = [{
			fix_id: "fix-old",
			target_signal_type: "test",
			created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
			expires_at: new Date(Date.now() - 1000).toISOString(),
			status: "watching",
		}];
		writeFileSync(WATCH_FILE, JSON.stringify(expired));
		const results = mod.checkRegressions([]);
		expect(results.length).toBe(1);
		expect(results[0].status).toBe("clear");
	});

	test("clearWatch 正確標記", () => {
		mod.createWatch({ fix_id: "fix-clear", target_signal_type: "test" });
		const result = mod.clearWatch("fix-clear");
		expect(result.status).toBe("clear");
	});

	test("空記錄不 crash", () => {
		writeFileSync(WATCH_FILE, "[]");
		const results = mod.checkRegressions([]);
		expect(results).toEqual([]);
	});

	test("clearWatch 不存在的 fix_id 回傳 null", () => {
		expect(mod.clearWatch("nonexistent")).toBeNull();
	});
});
