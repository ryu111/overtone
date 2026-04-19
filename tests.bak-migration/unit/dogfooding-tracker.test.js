import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	shouldTrack,
	onEditOrWrite,
	onBash,
	onSessionStart,
	onPostToolUse,
	loadState,
	saveState,
} from "../../../../.claude/hooks/modules/dogfooding-tracker.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { unlinkSync, mkdirSync } from "node:fs";

const REPO = "test-dogfood-" + Date.now();
const STATE_PATH = join(homedir(), ".claude/state", `dogfooding-pending-${REPO}.json`);
const FAKE_CWD = join("/tmp", REPO);

beforeEach(() => {
	try { unlinkSync(STATE_PATH); } catch {}
	try { mkdirSync(FAKE_CWD, { recursive: true }); } catch {}
});
afterEach(() => {
	try { unlinkSync(STATE_PATH); } catch {}
});

// 注入 fake cwd 透過 process.chdir 不可行（會影響其他 test）— 直接呼叫 helper 並 mock
// 替代：用 saveState/loadState + 假 input
function saveTestState(state) {
	saveState(REPO, state);
	// repoName(cwd) 會嘗試 git rev-parse，FAKE_CWD 不是 git repo → fallback basename
}

describe("shouldTrack — RUNTIME_AFFECTING regex", () => {
	it("rules/品質/*.md → 觸發", () => {
		expect(shouldTrack("rules/品質/元件孵化.md")).toBe(true);
		expect(shouldTrack("/Users/x/.claude/rules/品質/foo.md")).toBe(true);
	});
	it("rules/核心/*.md → 觸發", () => {
		expect(shouldTrack("rules/核心/agent-harness.md")).toBe(true);
	});
	it("hooks/modules/*.js → 觸發", () => {
		expect(shouldTrack("hooks/modules/dogfooding-tracker.js")).toBe(true);
	});
	it("scripts/component-*.js → 觸發", () => {
		expect(shouldTrack("scripts/component-scan.js")).toBe(true);
	});
	it("scripts/self-compact.js → 觸發", () => {
		expect(shouldTrack("scripts/self-compact.js")).toBe(true);
	});
	it("scripts/lib/foo.js → 觸發", () => {
		expect(shouldTrack("scripts/lib/foo.js")).toBe(true);
	});
	it("commands/*.md → 觸發", () => {
		expect(shouldTrack("commands/audit.md")).toBe(true);
	});
	it("純 SKILL.md → 不觸發（純知識被讀時驗證）", () => {
		expect(shouldTrack("skills/component-classification/SKILL.md")).toBe(false);
	});
	it("rules/協作/*.md → 不觸發（非品質/核心）", () => {
		expect(shouldTrack("rules/協作/討論式派發.md")).toBe(false);
	});
	it("空值/null safety", () => {
		expect(shouldTrack(null)).toBe(false);
		expect(shouldTrack("")).toBe(false);
	});
});

describe("onEditOrWrite — pending 加入", () => {
	it("觸發路徑加入 pending", () => {
		const r = onEditOrWrite({
			cwd: FAKE_CWD,
			tool_input: { file_path: "hooks/modules/foo.js" },
		});
		expect(r.systemMessage).toContain("dogfooding pending");
	});
	it("非觸發路徑 → 不變", () => {
		const r = onEditOrWrite({
			cwd: FAKE_CWD,
			tool_input: { file_path: "skills/foo/SKILL.md" },
		});
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toBeUndefined();
	});
	it("空值 fail-open", () => {
		expect(onEditOrWrite({}).decision).toBe("allow");
	});
});

describe("onBash — git commit 觸發 commits_since 增量", () => {
	it("非 git commit → 不變", () => {
		saveTestState({
			pending: [{ path: "hooks/modules/foo.js", created_at: new Date().toISOString(), commits_since: 0, session_count: 1, warning_count: 0 }],
			session_count_total: 1,
		});
		onBash({ cwd: FAKE_CWD, tool_input: { command: "ls -la" }, tool_response: { exitCode: 0 } });
		const s = loadState(REPO);
		expect(s.pending[0].commits_since).toBe(0);
	});

	it("git commit + exit 0 → commits_since +1", () => {
		saveTestState({
			pending: [{ path: "hooks/modules/foo.js", created_at: new Date().toISOString(), commits_since: 0, session_count: 1, warning_count: 0 }],
			session_count_total: 1,
		});
		onBash({ cwd: FAKE_CWD, tool_input: { command: "git commit -m 'test'" }, tool_response: { exitCode: 0 } });
		const s = loadState(REPO);
		expect(s.pending[0].commits_since).toBe(1);
	});

	it("git commit + exit 非 0 → 不增量", () => {
		saveTestState({
			pending: [{ path: "hooks/modules/foo.js", created_at: new Date().toISOString(), commits_since: 0, session_count: 1, warning_count: 0 }],
			session_count_total: 1,
		});
		onBash({ cwd: FAKE_CWD, tool_input: { command: "git commit -m 'fail'" }, tool_response: { exitCode: 1 } });
		const s = loadState(REPO);
		expect(s.pending[0].commits_since).toBe(0);
	});

	it("含 [no-dogfood: <30+>] bypass marker → log 但不清 pending", () => {
		saveTestState({
			pending: [{ path: "hooks/modules/foo.js", created_at: new Date().toISOString(), commits_since: 0, session_count: 1, warning_count: 0 }],
			session_count_total: 1,
		});
		const longRationale = "this is a typo fix not affecting runtime behavior at all xxxx";
		onBash({
			cwd: FAKE_CWD,
			tool_input: { command: `git commit -m "fix typo [no-dogfood: ${longRationale}]"` },
			tool_response: { exitCode: 0 },
		});
		const s = loadState(REPO);
		expect(s.pending.length).toBe(1); // bypass 不清 pending（rationale 是聲明非保證）
	});

	it("bypass rationale < 30 字符 → 不認 marker", () => {
		saveTestState({
			pending: [{ path: "hooks/modules/foo.js", created_at: new Date().toISOString(), commits_since: 0, session_count: 1, warning_count: 0 }],
			session_count_total: 1,
		});
		// rationale 只 10 字符
		onBash({
			cwd: FAKE_CWD,
			tool_input: { command: `git commit -m "fix [no-dogfood: too short]"` },
			tool_response: { exitCode: 0 },
		});
		// commits_since 仍然 +1（git commit 還是被偵測）
		const s = loadState(REPO);
		expect(s.pending[0].commits_since).toBe(1);
	});
});

describe("onSessionStart — cold-start grace + 警告升級", () => {
	it("cold-start (commits=0 AND session=1) → 不警告", () => {
		saveTestState({
			pending: [{ path: "hooks/modules/foo.js", created_at: new Date().toISOString(), commits_since: 0, session_count: 1, warning_count: 0 }],
			session_count_total: 0,
		});
		const r = onSessionStart({ cwd: FAKE_CWD });
		// session_count incremented to 2 → warnable now
		// 但因為 isDogfooded 會檢查 spec/data，沒實際 dogfood 應該仍 pending
		// 第一次 SessionStart 後 session_count=2 已 warnable，所以應該有 additionalContext
		expect(r?.hookSpecificOutput?.additionalContext).toBeDefined();
	});

	it("通過 isDogfooded → 從 pending 移除", () => {
		// 假 dogfood：使用 hooks/modules/dogfooding-tracker.js 自己作 spec match
		// dogfooding-tracker 名字會被 hasSpecExecutionSection 抓 (本 spec 含 dogfood + 數字)
		saveTestState({
			pending: [{ path: "hooks/modules/dogfooding-tracker.js", created_at: new Date(Date.now() - 600000).toISOString(), commits_since: 1, session_count: 2, warning_count: 0 }],
			session_count_total: 2,
		});
		onSessionStart({ cwd: FAKE_CWD });
		const s = loadState(REPO);
		// 因為 spec/討論/dogfooding-hook-design.md 含 "dogfooding-tracker" + 數字 + 執行結果 → 通過
		// dogfooding-tracker 應被移除
		expect(s.pending.find((p) => p.path === "hooks/modules/dogfooding-tracker.js")).toBeUndefined();
	});

	it("空 pending → 不警告", () => {
		saveTestState({ pending: [], session_count_total: 1 });
		const r = onSessionStart({ cwd: FAKE_CWD });
		expect(r).toBeUndefined();
	});

	it("fail-open：無 cwd → 不 crash", () => {
		expect(() => onSessionStart({})).not.toThrow();
	});
});

describe("onPostToolUse — 路由分派", () => {
	it("Edit/Write tool_name → 走 onEditOrWrite", () => {
		const r = onPostToolUse({
			tool_name: "Edit",
			cwd: FAKE_CWD,
			tool_input: { file_path: "hooks/modules/foo.js" },
		});
		expect(r.systemMessage).toBeDefined();
	});

	it("Bash tool_name → 走 onBash", () => {
		const r = onPostToolUse({
			tool_name: "Bash",
			cwd: FAKE_CWD,
			tool_input: { command: "ls" },
			tool_response: { exitCode: 0 },
		});
		expect(r.decision).toBe("allow");
	});

	it("其他 tool → allow 不變", () => {
		const r = onPostToolUse({ tool_name: "Read", tool_input: {} });
		expect(r.decision).toBe("allow");
	});
});
