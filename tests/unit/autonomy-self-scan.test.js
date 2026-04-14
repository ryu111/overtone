import { describe, it, expect } from "bun:test";
import {
	checkDispatchPollerWired,
	checkOrphanRuntimeScripts,
	checkRecentResolvedRatio,
	runAllSentinels,
	buildState,
	loadConfig,
} from "../../../../.claude/scripts/autonomy-self-scan.js";
import {
	loadAutonomyState,
	shouldTriggerScan,
	buildFailMessage,
	onSessionStart,
} from "../../../../.claude/hooks/modules/autonomy-scan-trigger.js";

describe("loadConfig", () => {
	it("讀 component-lifecycle.json 含 autonomy_sentinels", () => {
		const cfg = loadConfig();
		expect(cfg.autonomy_sentinels).toBeDefined();
		expect(typeof cfg.autonomy_sentinels.recent_resolved_ratio_floor).toBe("number");
	});
});

describe("checkDispatchPollerWired sentinel", () => {
	it("dispatch-poller 已接 UserPromptSubmit + SessionStart → passed=true", () => {
		const r = checkDispatchPollerWired();
		expect(r.passed).toBe(true);
		expect(r.dimension).toBe("自主推進");
		expect(r.evidence).toContain("wired");
	});
});

describe("checkOrphanRuntimeScripts sentinel", () => {
	it("執行不 throw + 結構完整", () => {
		const r = checkOrphanRuntimeScripts();
		expect(r).toHaveProperty("passed");
		expect(r).toHaveProperty("evidence");
		expect(r.dimension).toBe("元件接線健康");
	});
});

describe("checkRecentResolvedRatio sentinel", () => {
	it("執行不 throw + 結構完整", () => {
		const r = checkRecentResolvedRatio();
		expect(r).toHaveProperty("passed");
		expect(r.dimension).toBe("自我校準");
		expect(r.evidence).toMatch(/\d+\/\d+/);
	});
});

describe("runAllSentinels", () => {
	it("回傳 3 個 sentinel 結果", () => {
		const sentinels = runAllSentinels();
		expect(sentinels).toHaveLength(3);
		for (const s of sentinels) {
			expect(s).toHaveProperty("passed");
			expect(s).toHaveProperty("dimension");
			expect(s).toHaveProperty("name");
		}
	});
});

describe("buildState", () => {
	it("建立有效 state 含 _meta + sentinels + _summary", () => {
		const sentinels = [
			{ dimension: "A", name: "a", passed: true, evidence: "ok", duration_ms: 1 },
			{ dimension: "B", name: "b", passed: false, evidence: "fail", duration_ms: 2 },
		];
		const state = buildState(sentinels);
		expect(state._meta.scan_ts).toBeDefined();
		expect(state.sentinels).toHaveLength(2);
		expect(state._summary.total).toBe(2);
		expect(state._summary.passed).toBe(1);
		expect(state._summary.failed).toBe(1);
		expect(state._summary.fail_dimensions).toEqual(["B"]);
	});
});

describe("autonomy-scan-trigger hook", () => {
	it("loadAutonomyState 讀現有 state 不 crash", () => {
		const s = loadAutonomyState();
		// 可能 null 或 object
		expect(s === null || (s && s._meta)).toBeTruthy();
	});

	it("shouldTriggerScan: 檔案不存在 → true", () => {
		// 假時間極遠未來 → 真實檔不會比這還新
		expect(shouldTriggerScan(Date.now() + 30 * 86400000)).toBe(true);
	});

	it("buildFailMessage: 無 fail → null", () => {
		expect(buildFailMessage(null)).toBeNull();
		expect(buildFailMessage({ _summary: { failed: 0 } })).toBeNull();
	});

	it("buildFailMessage: 含 fail → 訊息含 sentinel name", () => {
		const state = {
			_meta: { scan_ts: "2026-04-14T00:00:00Z" },
			_summary: { failed: 1, total: 3, fail_dimensions: ["X"] },
			sentinels: [
				{ name: "test_sentinel", dimension: "X", passed: false, evidence: "ratio 25%" },
				{ name: "ok", dimension: "Y", passed: true, evidence: "fine" },
			],
		};
		const msg = buildFailMessage(state);
		expect(msg).toContain("test_sentinel");
		expect(msg).toContain("ratio 25%");
		expect(msg).not.toContain("ok"); // 只列 fail
	});

	it("onSessionStart: 不 throw", () => {
		expect(() => onSessionStart({})).not.toThrow();
	});
});
