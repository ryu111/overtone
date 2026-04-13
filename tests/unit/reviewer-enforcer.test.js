import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	parseCompleteNotification,
	trackCompleteOnPrompt,
	trackReviewerSpawn,
	enforceOnStop,
	loadState,
	saveState,
} from "../../../../.claude/hooks/modules/reviewer-enforcer.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";

const SID = "reviewer-test-" + Date.now();
const STATE_PATH = join(homedir(), ".claude/state", `reviewer-counts-${SID}.json`);

beforeEach(() => {
	try { unlinkSync(STATE_PATH); } catch {}
});
afterEach(() => {
	try { unlinkSync(STATE_PATH); } catch {}
});

describe("parseCompleteNotification", () => {
	it("匹配 ✅ {project} 回報 + commit 關鍵字", () => {
		const r = parseCompleteNotification("✅ nova-brain 回報：修復完成 Commit: abc1234");
		expect(r).not.toBeNull();
		expect(r.project).toBe("nova-brain");
	});

	it("抓取 dispatch id", () => {
		const r = parseCompleteNotification("✅ nova-server 回報：完成 commit xd-1776000-abc1 ok");
		expect(r.dispatch_id).toBe("xd-1776000-abc1");
	});

	it("無 ✅ 不匹配", () => {
		expect(parseCompleteNotification("nova-brain 回報：完成 commit")).toBeNull();
	});

	it("無 commit 關鍵字不匹配", () => {
		expect(parseCompleteNotification("✅ nova-brain 回報：進度更新")).toBeNull();
	});

	it("空值安全", () => {
		expect(parseCompleteNotification(null)).toBeNull();
		expect(parseCompleteNotification("")).toBeNull();
	});
});

describe("trackCompleteOnPrompt", () => {
	it("complete 通知 → state.complete_seen +1", () => {
		trackCompleteOnPrompt({ session_id: SID, prompt: "✅ nova-brain 回報：ok commit abc1234" });
		const s = loadState(SID);
		expect(s.complete_seen.length).toBe(1);
		expect(s.complete_seen[0].reviewed).toBe(false);
	});

	it("一般 prompt → 不變", () => {
		trackCompleteOnPrompt({ session_id: SID, prompt: "一般對話" });
		const s = loadState(SID);
		expect(s.complete_seen.length).toBe(0);
	});

	it("無 session_id → fail-open", () => {
		expect(trackCompleteOnPrompt({}).decision).toBe("allow");
	});
});

describe("trackReviewerSpawn", () => {
	it("subagent_type=reviewer → +1", () => {
		trackReviewerSpawn({ session_id: SID, tool_input: { subagent_type: "reviewer" } });
		const s = loadState(SID);
		expect(s.reviewer_spawned.length).toBe(1);
	});

	it("subagent_type=executor → 不變", () => {
		trackReviewerSpawn({ session_id: SID, tool_input: { subagent_type: "executor" } });
		const s = loadState(SID);
		expect(s.reviewer_spawned.length).toBe(0);
	});

	it("回 allow permissionDecision", () => {
		const r = trackReviewerSpawn({ session_id: SID, tool_input: { subagent_type: "reviewer" } });
		expect(r.hookSpecificOutput.permissionDecision).toBe("allow");
	});
});

describe("enforceOnStop", () => {
	it("無 unreviewed → allow", () => {
		expect(enforceOnStop({ session_id: SID }).decision).toBe("allow");
	});

	it("有 unreviewed + 無 spawned → block", () => {
		saveState(SID, {
			complete_seen: [{ dispatch_id: "xd-1", project: "p", ts: 1, reviewed: false }],
			reviewer_spawned: [],
			block_count: 0,
		});
		const r = enforceOnStop({ session_id: SID });
		expect(r.decision).toBe("block");
		expect(r.reason).toContain("未驗收");
	});

	it("unreviewed=2 spawned=1 → 標記 1 reviewed 剩 1 unreviewed → block", () => {
		saveState(SID, {
			complete_seen: [
				{ dispatch_id: "xd-1", project: "p", ts: 1, reviewed: false },
				{ dispatch_id: "xd-2", project: "p", ts: 2, reviewed: false },
			],
			reviewer_spawned: [{ ts: 3 }],
			block_count: 0,
		});
		const r = enforceOnStop({ session_id: SID });
		expect(r.decision).toBe("block");
		// 第一條被配對
		const s = loadState(SID);
		expect(s.complete_seen[0].reviewed).toBe(true);
		expect(s.complete_seen[1].reviewed).toBe(false);
	});

	it("連續 block 3 次後改 warn 不 block", () => {
		saveState(SID, {
			complete_seen: [{ dispatch_id: "xd-1", project: "p", ts: 1, reviewed: false }],
			reviewer_spawned: [],
			block_count: 2, // 這次會是第 3 次
		});
		const r = enforceOnStop({ session_id: SID });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toContain("fail-open");
	});

	it("fail-open：無 session_id → allow 不 crash", () => {
		expect(enforceOnStop({}).decision).toBe("allow");
	});
});
