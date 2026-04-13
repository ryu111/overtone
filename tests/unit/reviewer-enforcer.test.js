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

	it("短形式報告：無 xd- id 時 fallback 到 commit hash", () => {
		const r = parseCompleteNotification("✅ nova-brain 回報：fix commit 9b9e03c");
		expect(r).not.toBeNull();
		expect(r.dispatch_id).toBe("commit-9b9e03c");
	});

	it("短形式報告：完整 40 字元 hash 截短為 7 字元", () => {
		const r = parseCompleteNotification("✅ nova-brain 回報：commit abcdef0123456789abcdef0123456789abcdef01");
		expect(r.dispatch_id).toBe("commit-abcdef0");
	});

	it("優先 xd- id 而非 commit hash（兩者同時存在）", () => {
		const r = parseCompleteNotification("✅ nova-brain 回報：xd-1776-xyz1 commit 9b9e03c");
		expect(r.dispatch_id).toBe("xd-1776-xyz1");
	});

	it("兩者皆無時 return null（xd-qrql：廢除 unknown-ts fallback 避免 SSE 回聲汙染）", () => {
		// 含 commit 字樣但無 xd id 也無 7-40 hex hash → 視為無效通知
		const r = parseCompleteNotification("✅ nova-brain 回報：修好了 commit 已完成");
		expect(r).toBeNull();
	});

	it("prompt 過長（> 2000 chars）→ 不匹配（使用者對話/log 排除，xd-texh）", () => {
		const long = "使用者閒聊".repeat(500) + "✅ nova-brain 回報：commit abc1234";
		expect(parseCompleteNotification(long)).toBeNull();
	});

	it("✅ 出現在 prompt 中後段（> 120 char）→ 不匹配（quote 排除，xd-texh）", () => {
		const mid = "a".repeat(200) + "✅ nova-brain 回報：commit abc1234";
		expect(parseCompleteNotification(mid)).toBeNull();
	});

	it("✅ 出現在 prompt 前段（< 120 char）→ 正常匹配", () => {
		const notice = "\n\n✅ nova-brain 回報：fix commit 9b9e03c 完成";
		const r = parseCompleteNotification(notice);
		expect(r).not.toBeNull();
		expect(r.project).toBe("nova-brain");
		expect(r.dispatch_id).toBe("commit-9b9e03c");
	});

	it("短訊息但無 commit → 不匹配（既有行為）", () => {
		const r = parseCompleteNotification("✅ nova-brain 回報：進度更新 xd-abc1");
		expect(r).toBeNull();
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

	// xd-1xos：討論式 dispatch 持久化守護
	// xd-qrql：DISCUSSION_HINT_RE 收緊 — 只匹配強訊號 Clarifying Questions/討論回覆/待討論/需要你的看法
	it("討論式 dispatch + 含 .md 路徑 → is_discussion=true, missing_discussion_file=false", () => {
		const notice = "✅ nova-brain 回報：討論回覆 xd-zq6a Clarifying Questions 已答，已寫 spec/討論/ralph-loop-iter.md";
		const r = parseCompleteNotification(notice);
		expect(r).not.toBeNull();
		expect(r.is_discussion).toBe(true);
		expect(r.missing_discussion_file).toBe(false);
	});

	it("討論式 dispatch + 缺 .md 路徑 → missing_discussion_file=true", () => {
		const notice = "✅ nova-brain 回報：討論回覆 xd-zq6a 含 Clarifying Questions，3 個方案";
		const r = parseCompleteNotification(notice);
		expect(r).not.toBeNull();
		expect(r.is_discussion).toBe(true);
		expect(r.missing_discussion_file).toBe(true);
	});

	it("實作式 dispatch（無討論 hint）→ is_discussion=false", () => {
		const notice = "✅ nova-brain 回報：修復完成 commit abc1234";
		const r = parseCompleteNotification(notice);
		expect(r).not.toBeNull();
		expect(r.is_discussion).toBe(false);
		expect(r.missing_discussion_file).toBe(false);
	});

	// xd-qrql：false positive 修復 test case
	it("方案 C 字樣但是真實 complete（含 xd id + commit）→ 不誤觸 missing_discussion_file", () => {
		const notice = "✅ nova-brain 回報：ralph-loop iter 實作完成採納方案 C xd-tnek commit abc1234";
		const r = parseCompleteNotification(notice);
		expect(r).not.toBeNull();
		expect(r.is_discussion).toBe(false);
		expect(r.missing_discussion_file).toBe(false);
	});

	it("SSE 回聲 prompt（無 xd id + 無 commit hash）→ return null", () => {
		const notice = "✅ nova-brain 回報：一些訊息但沒有 dispatch id 也沒有 hash";
		// 無 xd- / 無 7-40 hex commit → fallback 不再 unknown-<timestamp>，直接 null
		const r = parseCompleteNotification(notice);
		expect(r).toBeNull();
	});

	it("正常 complete（含 xd id + commit hash）→ 正常 parse", () => {
		const notice = "✅ nova-brain 回報：完成 xd-abc-def commit 9b9e03c";
		const r = parseCompleteNotification(notice);
		expect(r).not.toBeNull();
		expect(r.dispatch_id).toBe("xd-abc-def");
		expect(r.project).toBe("nova-brain");
	});

	// xd-jzjj: 完成即討論 next_action_proposal 偵測
	it("含 next_action_proposal + verdict=continue → has_next_proposal=true, verdict=continue", () => {
		const notice = "✅ nova-brain 回報：完成 xd-abc-def commit 9b9e03c next_action_proposal verdict:continue";
		const r = parseCompleteNotification(notice);
		expect(r).not.toBeNull();
		expect(r.has_next_proposal).toBe(true);
		expect(r.verdict).toBe("continue");
	});

	it("verdict=close 解析正確", () => {
		const notice = '✅ nova-brain 回報：完成 xd-xxx commit abc1234 verdict: "close"';
		const r = parseCompleteNotification(notice);
		expect(r.verdict).toBe("close");
		expect(r.has_next_proposal).toBe(true);
	});

	it("verdict=escalate 解析正確", () => {
		const notice = "✅ nova-brain 回報：完成 xd-xxx commit abc1234 verdict=escalate";
		const r = parseCompleteNotification(notice);
		expect(r.verdict).toBe("escalate");
	});

	it("無 next_action_proposal → has_next_proposal=false, verdict=null", () => {
		const notice = "✅ nova-brain 回報：完成 xd-abc-def commit 9b9e03c";
		const r = parseCompleteNotification(notice);
		expect(r.has_next_proposal).toBe(false);
		expect(r.verdict).toBeNull();
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

	it("成功驗收後 reset block_count（避免單調遞增失守護）", () => {
		saveState(SID, {
			complete_seen: [{ dispatch_id: "xd-1", project: "p", ts: 1, reviewed: true }],
			reviewer_spawned: [],
			block_count: 2,
		});
		const r = enforceOnStop({ session_id: SID });
		expect(r.decision).toBe("allow");
		const s = loadState(SID);
		expect(s.block_count).toBe(0);
	});
});
