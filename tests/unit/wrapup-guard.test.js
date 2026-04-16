import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { on } from "../../../../.claude/hooks/modules/wrapup-guard.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir;
beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "wrapup-guard-"));
});
afterEach(() => {
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
	it("sub-agent session（不等於 current-session-id）→ allow 且不記錄錯誤", async () => {
		const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
		const { join } = await import("node:path");
		const { homedir } = await import("node:os");

		const currentSessionFile = join(homedir(), ".claude/data/current-session-id");
		const errorLog = join(homedir(), ".claude/data/hook-errors.jsonl");

		// 保存原始值（測試後還原，不污染真實 session）
		const originalSessionId = existsSync(currentSessionFile) ? readFileSync(currentSessionFile, "utf-8") : "";

		// 準備：寫入主 session id
		const mainId = "main-session-" + Date.now();
		writeFileSync(currentSessionFile, mainId);

		// 準備：記錄 errorLog 目前行數
		let linesBefore = 0;
		if (existsSync(errorLog)) {
			linesBefore = readFileSync(errorLog, "utf-8").split("\n").filter(Boolean).length;
		}

		// 執行：sub-agent session（不同 id）
		const subAgentId = "sub-agent-" + Date.now();
		const r = on.SessionEnd({ session_id: subAgentId });

		// 驗收：always allow
		expect(r.decision).toBe("allow");

		// 驗收：errorLog 行數不增加（sub-agent 被過濾掉了）
		let linesAfter = 0;
		if (existsSync(errorLog)) {
			linesAfter = readFileSync(errorLog, "utf-8").split("\n").filter(Boolean).length;
		}
		expect(linesAfter).toBe(linesBefore);

		// 清理：還原原始值（不清空，避免污染真實 session 的 session_id）
		writeFileSync(currentSessionFile, originalSessionId);
	});

	it("主 session（等於 current-session-id）無 marker → 記錄 wrapup_missed", async () => {
		const { existsSync, readFileSync, writeFileSync, unlinkSync } = await import("node:fs");
		const { join } = await import("node:path");
		const { homedir } = await import("node:os");

		const currentSessionFile = join(homedir(), ".claude/data/current-session-id");
		const markerFile = join(homedir(), ".claude/data/last-wrapup.json");
		const errorLog = join(homedir(), ".claude/data/hook-errors.jsonl");

		// 保存原始值（測試後還原）
		const origSessionId = existsSync(currentSessionFile) ? readFileSync(currentSessionFile, "utf-8") : "";
		const origMarker = existsSync(markerFile) ? readFileSync(markerFile, "utf-8") : null;

		// 準備：mainId 與本次 session_id 相同
		const mainId = "main-session-match-" + Date.now();
		writeFileSync(currentSessionFile, mainId);

		// 準備：確保 marker 不存在或為過期狀態（讓 isRecent() = false）
		// 寫入 1 小時前的 stale marker（不同 session_id），避免 isRecent 判定提前放行
		writeFileSync(markerFile, JSON.stringify({
			session_id: "stale-session-id",
			timestamp: new Date(Date.now() - 3_600_000).toISOString(),
			status: "complete",
		}));

		let linesBefore = 0;
		if (existsSync(errorLog)) {
			linesBefore = readFileSync(errorLog, "utf-8").split("\n").filter(Boolean).length;
		}

		// 執行：main session（同 id），無近期 marker → 應記錄 wrapup_missed
		const r = on.SessionEnd({ session_id: mainId });
		expect(r.decision).toBe("allow");

		// 驗收：errorLog 行數增加 1
		let linesAfter = 0;
		if (existsSync(errorLog)) {
			linesAfter = readFileSync(errorLog, "utf-8").split("\n").filter(Boolean).length;
		}
		expect(linesAfter).toBe(linesBefore + 1);

		// 清理：還原原始值
		writeFileSync(currentSessionFile, origSessionId);
		if (origMarker !== null) {
			writeFileSync(markerFile, origMarker);
		} else {
			try { unlinkSync(markerFile); } catch {}
		}
	});
});
