// post-compact-ctx-flag.test.js — Bug 3 延伸（xd-1776395500000-ctxflag）
// PostCompact 寫 /tmp/nova-just-compacted-<project>.flag
// ctx-tracker.onUserPromptSubmit 偵測 flag 時優先讀 /tmp/nova-usage.json sessions[project].context
// 並刪 flag（one-shot），避免 transcript stale 讀導致壓縮後仍顯示壓縮前 ctx%
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FLOW_OBSERVER = join(homedir(), ".claude/hooks/modules/flow-observer.js");
const CTX_TRACKER = join(homedir(), ".claude/hooks/modules/ctx-tracker.js");
const USAGE_PATH = "/tmp/nova-usage.json";
const USAGE_BACKUP = "/tmp/nova-usage.json.ctxflag-backup";
const TEST_PROJECT = "test-proj-ctxflag";
const FLAG_PATH = `/tmp/nova-just-compacted-${TEST_PROJECT}.flag`;

function backup() {
	if (existsSync(USAGE_PATH)) writeFileSync(USAGE_BACKUP, readFileSync(USAGE_PATH, "utf-8"));
}
function restore() {
	if (existsSync(USAGE_BACKUP)) {
		writeFileSync(USAGE_PATH, readFileSync(USAGE_BACKUP, "utf-8"));
		rmSync(USAGE_BACKUP, { force: true });
	}
	rmSync(FLAG_PATH, { force: true });
}

describe("PostCompact ctx flag (Bug 3 延伸)", () => {
	beforeEach(() => backup());
	afterEach(() => restore());

	test("flow-observer.js 原始碼含 flag 寫入標記", () => {
		const src = readFileSync(FLOW_OBSERVER, "utf-8");
		expect(src).toContain("nova-just-compacted-");
		// flag 必須在 PostCompact handler 內
		const postCompactSection = src.substring(src.indexOf("PostCompact: (input)"));
		expect(postCompactSection.indexOf("nova-just-compacted-")).toBeGreaterThan(-1);
	});

	test("ctx-tracker.js 原始碼含 flag 讀取邏輯", () => {
		const src = readFileSync(CTX_TRACKER, "utf-8");
		expect(src).toContain("nova-just-compacted-");
		expect(src).toContain("/tmp/nova-usage.json");
	});

	test("PostCompact 觸發後 flag 檔案存在", async () => {
		writeFileSync(USAGE_PATH, JSON.stringify({
			fiveHour: 1,
			sessions: { [TEST_PROJECT]: { context: 55, ts: 1 } },
		}, null, 2));
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}flag1`);
		mod.on.PostCompact({ cwd: `/Users/test/projects/${TEST_PROJECT}`, compact_summary: "test" });
		expect(existsSync(FLAG_PATH)).toBe(true);
	});

	test("ctx-tracker flag 存在時優先讀 usage.json，並刪 flag（one-shot）", async () => {
		// 模擬壓縮後狀態：usage.json=0（PostCompact 已 reset）+ flag 存在
		writeFileSync(USAGE_PATH, JSON.stringify({
			fiveHour: 1,
			sessions: { [TEST_PROJECT]: { context: 0, ts: Math.floor(Date.now() / 1000) } },
		}, null, 2));
		writeFileSync(FLAG_PATH, String(Date.now()));

		// 假 transcript 用 tmpfile（內容模擬壓縮前高 usage）
		const tmpTranscript = `/tmp/test-transcript-${TEST_PROJECT}.jsonl`;
		writeFileSync(tmpTranscript, JSON.stringify({
			message: { usage: { input_tokens: 500000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
		}) + "\n");

		const mod = await import(`${CTX_TRACKER}?t=${Date.now()}flag2`);
		const result = mod.onUserPromptSubmit({
			transcript_path: tmpTranscript,
			cwd: `/Users/test/projects/${TEST_PROJECT}`,
			model: { display_name: "Claude Opus 4.7 (1M context)" },
		});

		// flag 存在時應讀 usage.json（0）而非 transcript（50%）
		// 0% < 30% → return undefined（silent tier）
		expect(result).toBeUndefined();
		// flag 應被刪（one-shot）
		expect(existsSync(FLAG_PATH)).toBe(false);

		rmSync(tmpTranscript, { force: true });
	});

	test("flag 不存在時走 transcript fallback（原行為）", async () => {
		rmSync(FLAG_PATH, { force: true });
		const tmpTranscript = `/tmp/test-transcript-${TEST_PROJECT}-nofallback.jsonl`;
		// 50% ctx @ 1M
		writeFileSync(tmpTranscript, JSON.stringify({
			message: { usage: { input_tokens: 500000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
		}) + "\n");

		const mod = await import(`${CTX_TRACKER}?t=${Date.now()}flag3`);
		const result = mod.onUserPromptSubmit({
			transcript_path: tmpTranscript,
			cwd: `/Users/test/projects/${TEST_PROJECT}`,
			model: { display_name: "Claude Opus 4.7 (1M context)" },
		});

		// transcript-based 計算 50% → 30-60% tier
		expect(result?.hookSpecificOutput?.additionalContext).toContain("ctx 使用率");
		expect(result?.hookSpecificOutput?.additionalContext).toMatch(/50/);

		rmSync(tmpTranscript, { force: true });
	});

	test("flag 存在但 usage.json 不存在 → 不 throw，走 fallback", async () => {
		writeFileSync(FLAG_PATH, String(Date.now()));
		if (existsSync(USAGE_PATH)) rmSync(USAGE_PATH, { force: true });

		const tmpTranscript = `/tmp/test-transcript-${TEST_PROJECT}-noUsage.jsonl`;
		writeFileSync(tmpTranscript, JSON.stringify({
			message: { usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
		}) + "\n");

		const mod = await import(`${CTX_TRACKER}?t=${Date.now()}flag4`);
		expect(() => mod.onUserPromptSubmit({
			transcript_path: tmpTranscript,
			cwd: `/Users/test/projects/${TEST_PROJECT}`,
			model: { display_name: "Claude Opus 4.7 (1M context)" },
		})).not.toThrow();

		rmSync(tmpTranscript, { force: true });
	});
});
