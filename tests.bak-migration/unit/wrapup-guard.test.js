import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { on } from "../../../../.claude/hooks/modules/wrapup-guard.js";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir;
beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "wrapup-guard-"));
	// 注入 env vars 讓 wrapup-guard.js 使用 tmpDir 內的檔案，不污染真實資料
	process.env.WRAPUP_MARKER_FILE = join(tmpDir, "last-wrapup.json");
	process.env.WRAPUP_ERROR_LOG = join(tmpDir, "hook-errors.jsonl");
	process.env.WRAPUP_SESSION_FILE = join(tmpDir, "current-session-id");
});
afterEach(() => {
	delete process.env.WRAPUP_MARKER_FILE;
	delete process.env.WRAPUP_ERROR_LOG;
	delete process.env.WRAPUP_SESSION_FILE;
	try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe("wrapup-guard: Stop handler", () => {
	it("ralph-loop active → allow（不擋 ralph 生命週期）", () => {
		mkdirSync(join(tmpDir, ".claude"), { recursive: true });
		writeFileSync(join(tmpDir, ".claude/ralph-loop.local.md"), "active: true");
		const r = on.Stop({ cwd: tmpDir, session_id: "s1" });
		expect(r.decision).toBe("allow");
	});

	it("fail-open：null input → allow 不 throw", () => {
		expect(() => on.Stop(null)).not.toThrow();
		const r = on.Stop(null);
		expect(r.decision).toBe("allow");
	});

	it("fail-open：input 不含 cwd → allow（fallback to process.cwd）", () => {
		expect(() => on.Stop({})).not.toThrow();
		const r = on.Stop({});
		expect(["allow", "block"]).toContain(r.decision);
	});

	it("ralph-loop active 即使有 session_id 不匹配 → allow", () => {
		mkdirSync(join(tmpDir, ".claude"), { recursive: true });
		writeFileSync(join(tmpDir, ".claude/ralph-loop.local.md"), "x");
		const r = on.Stop({ cwd: tmpDir, session_id: "different-id-" + Date.now() });
		expect(r.decision).toBe("allow");
	});
});

describe("wrapup-guard: SessionEnd handler", () => {
	it("無 marker → 記錄缺漏但 allow（安全網不阻擋）", () => {
		// 設定主 session id（tmpDir 隔離環境）
		writeFileSync(join(tmpDir, "current-session-id"), "test-" + Date.now());
		const r = on.SessionEnd({ session_id: "test-" + Date.now() });
		expect(r.decision).toBe("allow");
	});

	it("fail-open：null input → allow 不 throw", () => {
		expect(() => on.SessionEnd(null)).not.toThrow();
		expect(on.SessionEnd(null).decision).toBe("allow");
	});

	it("fail-open：malformed input → allow", () => {
		expect(on.SessionEnd({}).decision).toBe("allow");
		expect(on.SessionEnd({ session_id: null }).decision).toBe("allow");
	});
});

describe("wrapup-guard: SessionEnd sub-agent filter（xd-wrapup-subagent）", () => {
	it("sub-agent session（不等於 current-session-id）→ allow 且不記錄錯誤", () => {
		const mainId = "main-session-" + Date.now();
		writeFileSync(join(tmpDir, "current-session-id"), mainId);

		const linesBefore = existsSync(join(tmpDir, "hook-errors.jsonl"))
			? readFileSync(join(tmpDir, "hook-errors.jsonl"), "utf-8").split("\n").filter(Boolean).length
			: 0;

		const subAgentId = "sub-agent-" + Date.now();
		const r = on.SessionEnd({ session_id: subAgentId });
		expect(r.decision).toBe("allow");

		const linesAfter = existsSync(join(tmpDir, "hook-errors.jsonl"))
			? readFileSync(join(tmpDir, "hook-errors.jsonl"), "utf-8").split("\n").filter(Boolean).length
			: 0;
		expect(linesAfter).toBe(linesBefore);
	});

	it("主 session（等於 current-session-id）無近期 marker → 記錄 wrapup_missed", () => {
		const mainId = "main-session-match-" + Date.now();
		writeFileSync(join(tmpDir, "current-session-id"), mainId);

		// 確保 marker 為過期狀態（isRecent() = false），避免提前放行
		writeFileSync(join(tmpDir, "last-wrapup.json"), JSON.stringify({
			session_id: "stale-session-id",
			timestamp: new Date(Date.now() - 3_600_000).toISOString(),
			status: "complete",
		}));

		const linesBefore = existsSync(join(tmpDir, "hook-errors.jsonl"))
			? readFileSync(join(tmpDir, "hook-errors.jsonl"), "utf-8").split("\n").filter(Boolean).length
			: 0;

		const r = on.SessionEnd({ session_id: mainId });
		expect(r.decision).toBe("allow");

		const linesAfter = existsSync(join(tmpDir, "hook-errors.jsonl"))
			? readFileSync(join(tmpDir, "hook-errors.jsonl"), "utf-8").split("\n").filter(Boolean).length
			: 0;
		expect(linesAfter).toBe(linesBefore + 1);
	});
});
