// xd-6h3p/dubi/bbpt: reviewer-enforcer write-only spec 守護 test
// 覆蓋 3 case：
//   (1) write + POST complete 含 file_path → no warn
//   (2) write + 無 event → warn (但不 block)
//   (3) write + UserPromptSubmit 收 ✅ 通知含 file_path → matched no warn

import { describe, it, expect, beforeEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), "reviewer-enforcer-write-only-test");
process.env.NOVA_REVIEWER_STATE_DIR = TEST_DIR;

// 延後 import 以確保 env 生效
import { homedir } from "node:os";
const {
	trackDiscussionWrite,
	trackCompleteOnPrompt,
	warnUnreviewedComplete,
	enforceOnStop,
	loadState,
} = await import(join(homedir(), ".claude/hooks/modules/reviewer-enforcer.js"));

describe("reviewer-enforcer write-only spec 守護 (xd-6h3p/dubi/bbpt)", () => {
	const SID = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

	beforeEach(() => {
		if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });
	});

	it("case 1: write + POST complete 含 file_path → matched, Stop no warn", () => {
		const sessionId = SID();
		const filePath = "/Users/sbu/projects/nova-brain/spec/討論/test-topic.md";

		// (a) PostToolUse Write 記錄
		trackDiscussionWrite({
			session_id: sessionId,
			tool_name: "Write",
			tool_input: { file_path: filePath },
			cwd: "/Users/sbu/projects/nova-brain",
		});

		// (b) PreToolUse:Bash POST complete 含 file_path
		warnUnreviewedComplete({
			session_id: sessionId,
			tool_input: {
				command: `curl -X POST http://127.0.0.1:3457/api/cross-dispatch/complete -d '{"id":"xd-abc","summary":"done, see ${filePath}"}'`,
			},
		});

		const state = loadState(sessionId);
		expect(state.discussion_writes_seen).toHaveLength(1);
		expect(state.discussion_writes_seen[0].matched).toBe(true);

		// (c) Stop — 無 complete_seen 也無 unmatched write → allow
		const result = enforceOnStop({ session_id: sessionId, cwd: "/Users/sbu/projects/nova-brain" });
		expect(result.decision).toBe("allow");
		expect(result.systemMessage).toBeUndefined();
	});

	it("case 2: write + 無 event → Stop warn (fail-open 不 block)", () => {
		const sessionId = SID();
		const filePath = "/Users/sbu/projects/nova-brain/spec/討論/orphan-topic.md";

		trackDiscussionWrite({
			session_id: sessionId,
			tool_name: "Write",
			tool_input: { file_path: filePath },
			cwd: "/Users/sbu/projects/nova-brain",
		});

		const state = loadState(sessionId);
		expect(state.discussion_writes_seen[0].matched).toBe(false);

		// Stop — 有 unmatched write 但無 complete/discussion miss → warn 不 block（onlyWriteOnly 分支）
		const result = enforceOnStop({ session_id: sessionId, cwd: "/Users/sbu/projects/nova-brain" });
		expect(result.decision).toBe("allow"); // 不 block
		expect(result.systemMessage).toBeDefined();
		expect(result.systemMessage).toContain("spec/討論/ 寫入無對應");
		expect(result.systemMessage).toContain("orphan-topic.md");
	});

	it("case 3: write + UserPromptSubmit ✅ 通知含 file_path → matched", () => {
		const sessionId = SID();
		const filePath = "/Users/sbu/projects/nova-brain/spec/討論/peer-topic.md";

		trackDiscussionWrite({
			session_id: sessionId,
			tool_name: "Write",
			tool_input: { file_path: filePath },
			cwd: "/Users/sbu/projects/nova-brain",
		});

		// Peer POST complete → 本 session 收 ✅ 通知（是 discussion dispatch，含 file_path）
		trackCompleteOnPrompt({
			session_id: sessionId,
			cwd: "/Users/sbu/projects/nova-brain",
			prompt: `✅ nova-brain 回報: 討論回覆 xd-peer1 完成，commit 123abcd，見 ${filePath}`,
		});

		const state = loadState(sessionId);
		expect(state.discussion_writes_seen[0].matched).toBe(true);
	});

	it("case 4: 非 spec/討論/ 路徑不觸發", () => {
		const sessionId = SID();

		trackDiscussionWrite({
			session_id: sessionId,
			tool_name: "Write",
			tool_input: { file_path: "/Users/sbu/projects/nova-brain/docs/random.md" },
			cwd: "/Users/sbu/projects/nova-brain",
		});

		const state = loadState(sessionId);
		expect(state.discussion_writes_seen).toHaveLength(0);
	});

	it("case 5: Edit tool 同樣觸發（同 Write 路徑）", () => {
		const sessionId = SID();
		const filePath = "/Users/sbu/projects/nova-brain/spec/討論/edit-topic.md";

		trackDiscussionWrite({
			session_id: sessionId,
			tool_name: "Edit",
			tool_input: { file_path: filePath },
			cwd: "/Users/sbu/projects/nova-brain",
		});

		const state = loadState(sessionId);
		expect(state.discussion_writes_seen).toHaveLength(1);
		expect(state.discussion_writes_seen[0].file_path).toBe(filePath);
	});

	it("case 6: 5 min dedup — 同檔多次 Edit 只記一次", () => {
		const sessionId = SID();
		const filePath = "/Users/sbu/projects/nova-brain/spec/討論/dedup-topic.md";

		for (let i = 0; i < 3; i++) {
			trackDiscussionWrite({
				session_id: sessionId,
				tool_name: "Edit",
				tool_input: { file_path: filePath },
				cwd: "/Users/sbu/projects/nova-brain",
			});
		}

		const state = loadState(sessionId);
		expect(state.discussion_writes_seen).toHaveLength(1);
	});
});
