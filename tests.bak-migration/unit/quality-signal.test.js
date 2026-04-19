import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "node:fs";

const SIGNAL_FILE = "/tmp/nova-quality-signals.jsonl";
const BACKUP_FILE = "/tmp/nova-quality-signals.jsonl.bak";

// 動態 import 避免模組快取影響
let emitSignal, readSignals, truncateSignals;

beforeEach(async () => {
	// 備份現有檔案
	if (existsSync(SIGNAL_FILE)) {
		writeFileSync(BACKUP_FILE, readFileSync(SIGNAL_FILE));
	}
	// 清空測試用檔案
	writeFileSync(SIGNAL_FILE, "");

	// 每次重新 import（避免模組狀態殘留）
	const mod = await import("/Users/sbu/.claude/scripts/lib/quality-signal.js");
	emitSignal = mod.emitSignal;
	readSignals = mod.readSignals;
	truncateSignals = mod.truncateSignals;
});

// 測試結束後恢復
afterEach(() => {
	if (existsSync(BACKUP_FILE)) {
		writeFileSync(SIGNAL_FILE, readFileSync(BACKUP_FILE));
		unlinkSync(BACKUP_FILE);
	}
});

describe("quality-signal", () => {
	test("emit 寫入 JSONL 格式正確", () => {
		const signal = emitSignal({
			source_layer: "L2",
			source_project: "nova-server",
			type: "hook-error",
			severity: "warning",
			payload: { error: "timeout" },
		});

		expect(signal.id).toMatch(/^sig-\d+-[a-z0-9]{4}$/);
		expect(signal.ts).toBeNumber();
		expect(signal.source_layer).toBe("L2");
		expect(signal.severity).toBe("warning");

		// 驗證 JSONL 寫入
		const content = readFileSync(SIGNAL_FILE, "utf-8").trim();
		const parsed = JSON.parse(content);
		expect(parsed.id).toBe(signal.id);
	});

	test("read 按 layer/severity/since 過濾", () => {
		emitSignal({ source_layer: "L1", source_project: "p1", type: "a", severity: "info" });
		emitSignal({ source_layer: "L2", source_project: "p2", type: "b", severity: "warning" });
		emitSignal({ source_layer: "L1", source_project: "p3", type: "c", severity: "critical" });

		// 按 layer 過濾
		const l1 = readSignals({ layer: "L1" });
		expect(l1.length).toBe(2);

		// 按 severity 過濾
		const warnings = readSignals({ severity: "warning" });
		expect(warnings.length).toBe(1);
		expect(warnings[0].source_project).toBe("p2");

		// 按 since 過濾（未來時間 = 無結果）
		const future = readSignals({ since: Date.now() + 100000 });
		expect(future.length).toBe(0);
	});

	test("truncate 保留指定天數", () => {
		// 寫入一個「8 天前」的信號
		const oldSignal = {
			ts: Date.now() - 8 * 24 * 60 * 60 * 1000,
			source_layer: "L1",
			source_project: "old",
			type: "old-event",
			severity: "info",
			payload: {},
			id: "sig-old-xxxx",
		};
		writeFileSync(SIGNAL_FILE, JSON.stringify(oldSignal) + "\n");

		// 寫入一個新信號
		emitSignal({ source_layer: "L1", source_project: "new", type: "new-event" });

		// 截斷保留 7 天
		truncateSignals(7);

		const remaining = readSignals();
		expect(remaining.length).toBe(1);
		expect(remaining[0].source_project).toBe("new");
	});

	test("去重邏輯正確（同 source+type 1h 內）", () => {
		emitSignal({ source_layer: "L1", source_project: "p1", type: "hook-error", payload: { v: 1 } });
		emitSignal({ source_layer: "L1", source_project: "p1", type: "hook-error", payload: { v: 2 } });
		emitSignal({ source_layer: "L1", source_project: "p1", type: "hook-error", payload: { v: 3 } });

		const all = readSignals();
		// 同 source+type 1h 內只保留最新
		const hookErrors = all.filter((s) => s.type === "hook-error" && s.source_project === "p1");
		expect(hookErrors.length).toBe(1);
		expect(hookErrors[0].payload.v).toBe(3);
	});

	test("emit 時 SSE fetch 失敗不 throw", () => {
		// SERVER 可能不在跑或 /broadcast 不存在 — 不應拋錯
		expect(() => {
			emitSignal({ source_layer: "L1", source_project: "test", type: "test-event" });
		}).not.toThrow();
	});

	test("readSignals 空檔案不 crash", () => {
		writeFileSync(SIGNAL_FILE, "");
		const result = readSignals();
		expect(result).toEqual([]);
	});
});
