// xd-g390: SSE echo double-count dedup 鎖
// 動機：cross-dispatch/complete 廣播 SSE → Manager session 收到當 prompt → trackComplete 二次觸發
// 同事件第一次記 xd-id、第二次 SSE echo 只剩 commit hash → orphan 永久 block
import { describe, it, expect, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NOVA_REVIEWER_STATE_DIR = mkdtempSync(join(tmpdir(), "rev-dedup-"));
import { homedir } from "node:os";
const { trackCompleteOnPrompt, loadState } = await import(join(homedir(), ".claude/hooks/modules/reviewer-enforcer.js"));

const SESSION = "test-session-dedup";

function makePrompt({ project = "nova-server", id = null, hash = null } = {}) {
	const tail = [id, hash ? `commit ${hash}` : null].filter(Boolean).join(" ");
	return `✅ ${project} 回報：完成 ${tail}`;
}

describe("reviewer-enforcer dedup (xd-g390)", () => {
	beforeEach(() => {
		try { rmSync(process.env.NOVA_REVIEWER_STATE_DIR, { recursive: true, force: true }); } catch {}
	});

	it("同 xd-id 連續 trigger 兩次只記一條", () => {
		const p = makePrompt({ id: "xd-sbnb1234", hash: "6942018" });
		trackCompleteOnPrompt({ session_id: SESSION, prompt: p });
		trackCompleteOnPrompt({ session_id: SESSION, prompt: p });
		const state = loadState(SESSION);
		expect(state.complete_seen.length).toBe(1);
		expect(state.complete_seen[0].dispatch_id).toBe("xd-sbnb1234");
	});

	it("xd-id 後 SSE echo 只剩 commit hash → 視為別名跳過", () => {
		trackCompleteOnPrompt({ session_id: SESSION, prompt: makePrompt({ id: "xd-sbnb1234", hash: "6942018" }) });
		// SSE echo：第二次 prompt 只剩 commit hash（無 xd-id）
		trackCompleteOnPrompt({ session_id: SESSION, prompt: makePrompt({ hash: "6942018" }) });
		const state = loadState(SESSION);
		expect(state.complete_seen.length).toBe(1);
		expect(state.complete_seen[0].dispatch_id).toBe("xd-sbnb1234");
	});

	it("不同 xd-id 不同 hash 不去重", () => {
		trackCompleteOnPrompt({ session_id: SESSION, prompt: makePrompt({ id: "xd-aaa1111", hash: "1111111" }) });
		trackCompleteOnPrompt({ session_id: SESSION, prompt: makePrompt({ id: "xd-bbb2222", hash: "2222222" }) });
		const state = loadState(SESSION);
		expect(state.complete_seen.length).toBe(2);
	});

	// xd-xfzn: cross-session SSE 觀察豁免
	it("project ≠ my cwd basename → 自動 reviewed=true (cross_session_observation)", () => {
		// my cwd = nova-manager, but prompt project = nova-brain → SSE echo from other session
		trackCompleteOnPrompt({
			session_id: SESSION,
			cwd: "/Users/sbu/projects/nova-manager",
			prompt: makePrompt({ project: "nova-brain", id: "xd-foo1234", hash: "abcdef1" }),
		});
		const state = loadState(SESSION);
		expect(state.complete_seen.length).toBe(1);
		expect(state.complete_seen[0].reviewed).toBe(true);
		expect(state.complete_seen[0].cross_session_observation).toBe(true);
	});

	it("project = my cwd basename → 維持原 reviewed=false 走正常 reviewer 配對", () => {
		trackCompleteOnPrompt({
			session_id: SESSION,
			cwd: "/Users/sbu/projects/nova-server",
			prompt: makePrompt({ project: "nova-server", id: "xd-bar5678", hash: "1234567" }),
		});
		const state = loadState(SESSION);
		expect(state.complete_seen[0].reviewed).toBe(false);
		expect(state.complete_seen[0].cross_session_observation).toBe(false);
	});
});
