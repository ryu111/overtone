import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	parseContextSize,
	computeCtxPct,
	buildTierMessage,
	loadState,
	saveState,
	clearPendingCompact,
	readLastUsage,
	onUserPromptSubmit,
} from "../../../../.claude/hooks/modules/ctx-tracker.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { unlinkSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";

const REPO = "test-ctx-" + Date.now();
const STATE_PATH = join(homedir(), ".claude/state", `ctx-tracker-${REPO}.json`);

beforeEach(() => { try { unlinkSync(STATE_PATH); } catch {} });
afterEach(() => { try { unlinkSync(STATE_PATH); } catch {} });

describe("parseContextSize", () => {
	it("'Claude Opus 4.6 (1M context)' → 1000000", () => {
		expect(parseContextSize("Claude Opus 4.6 (1M context)")).toBe(1_000_000);
	});

	it("'200K context' → 200000", () => {
		expect(parseContextSize("Sonnet 4.5 (200K context)")).toBe(200_000);
	});

	it("無格式 → default 200000", () => {
		expect(parseContextSize("unknown")).toBe(200_000);
		expect(parseContextSize(null)).toBe(200_000);
		expect(parseContextSize(undefined)).toBe(200_000);
	});
});

describe("computeCtxPct", () => {
	it("正常 token sum / size", () => {
		const usage = { input_tokens: 100, cache_creation_input_tokens: 200, cache_read_input_tokens: 700 };
		// total = 1000 / 10000 = 10%
		expect(computeCtxPct(usage, 10_000)).toBe(10);
	});

	it("缺 cache 欄位 → 視為 0", () => {
		const usage = { input_tokens: 50 };
		expect(computeCtxPct(usage, 1_000)).toBe(5);
	});

	it("空 usage → null", () => {
		expect(computeCtxPct(null, 100)).toBeNull();
	});

	it("size 0 → null", () => {
		expect(computeCtxPct({ input_tokens: 100 }, 0)).toBeNull();
	});
});

describe("buildTierMessage 三階梯", () => {
	it("< 30 → null", () => {
		expect(buildTierMessage(15)).toBeNull();
		expect(buildTierMessage(0)).toBeNull();
	});

	it("30-60 → 提醒", () => {
		const m = buildTierMessage(45);
		expect(m).toContain("45%");
		expect(m).toContain("可考慮");
	});

	it("60-80 → 強烈建議", () => {
		const m = buildTierMessage(70);
		expect(m).toContain("70%");
		expect(m).toContain("強烈建議");
	});

	it("> 80 → 強警告 + SessionStart", () => {
		const m = buildTierMessage(85);
		expect(m).toContain("85%");
		expect(m).toContain("80%");
		expect(m).toContain("SessionStart");
	});

	it("null → null", () => {
		expect(buildTierMessage(null)).toBeNull();
	});
});

describe("state pending_compact", () => {
	it("無 state → default false", () => {
		const s = loadState("nonexistent-" + Date.now());
		expect(s.pending_compact).toBe(false);
	});

	it("save + load 往返", () => {
		saveState(REPO, { pending_compact: true, ctx_pct_at_trigger: 85 });
		const s = loadState(REPO);
		expect(s.pending_compact).toBe(true);
		expect(s.ctx_pct_at_trigger).toBe(85);
	});

	it("clearPendingCompact 重置 flag", () => {
		saveState(REPO, { pending_compact: true });
		clearPendingCompact(REPO);
		expect(loadState(REPO).pending_compact).toBe(false);
	});
});

describe("readLastUsage transcript 解析", () => {
	let tmpDir, transcript;
	beforeEach(() => {
		tmpDir = mkdtempSync(join(homedir(), ".claude/state", "ctx-test-"));
		transcript = join(tmpDir, "session.jsonl");
	});
	afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

	it("檔案不存在 → null", () => {
		expect(readLastUsage("/nonexistent.jsonl")).toBeNull();
	});

	it("含 message.usage → 取最後一個", () => {
		const lines = [
			JSON.stringify({ message: { usage: { input_tokens: 10, cache_read_input_tokens: 100 } } }),
			JSON.stringify({ message: { usage: { input_tokens: 20, cache_read_input_tokens: 200 } } }),
		].join("\n");
		writeFileSync(transcript, lines);
		const u = readLastUsage(transcript);
		expect(u.input_tokens).toBe(20);
		expect(u.cache_read_input_tokens).toBe(200);
	});

	it("無 usage 欄位 → null", () => {
		writeFileSync(transcript, JSON.stringify({ type: "user", message: { content: "hi" } }));
		expect(readLastUsage(transcript)).toBeNull();
	});
});

describe("onUserPromptSubmit", () => {
	it("空 input 不 throw", () => {
		expect(() => onUserPromptSubmit({})).not.toThrow();
	});

	it("無 transcript_path → undefined（silent）", () => {
		expect(onUserPromptSubmit({})).toBeUndefined();
	});

	it("80% pct 寫 pending_compact flag", () => {
		// 假 transcript usage 觸發 80%
		const dir = mkdtempSync(join(homedir(), ".claude/state", "ctx-flag-"));
		const tp = join(dir, "t.jsonl");
		// 1M context, 800k tokens = 80%
		writeFileSync(tp, JSON.stringify({ message: { usage: { input_tokens: 800_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }));
		const r = onUserPromptSubmit({ transcript_path: tp, model: { display_name: "Claude Opus 4.6 (1M context)" }, cwd: homedir() });
		expect(r?.hookSpecificOutput?.additionalContext).toContain("80%");
		try { rmSync(dir, { recursive: true, force: true }); } catch {}
	});
});
