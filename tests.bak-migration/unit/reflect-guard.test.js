import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { on } from "../../../../.claude/hooks/modules/reflect-guard.js";
import { _ws } from "../../../../.claude/hooks/modules/lib/workspace-state.js";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const handler = on.PostToolUse;
let tmpDir;
let testSid;

beforeEach(() => {
	for (const k of Object.keys(_ws)) delete _ws[k];
	tmpDir = mkdtempSync(join(tmpdir(), "reflect-guard-"));
	// xd-bni5 follow-up: reflect-guard 現 initWs(input.session_id)，需避免 stale
	// /tmp/nova-ws-<sid>.json 洩漏（如 /tmp/nova-ws-unknown.json 常含歷史 testRun）
	testSid = `reflect-guard-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	try {
		const wsPath = `/tmp/nova-ws-${testSid}.json`;
		if (existsSync(wsPath)) rmSync(wsPath, { force: true });
	} catch {}
});
afterEach(() => {
	try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
	try { rmSync(`/tmp/nova-ws-${testSid}.json`, { force: true }); } catch {}
});

describe("reflect-guard: commit-without-test", () => {
	it("git commit + testRun=0 + 有 tests 目錄 → warn", () => {
		mkdirSync(join(tmpDir, "tests"), { recursive: true });
		writeFileSync(join(tmpDir, "package.json"), "{}");
		_ws.testRun = 0;
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "git commit -m 'fix bug'" },
			tool_result: { exitCode: 0 },
			cwd: tmpDir, session_id: testSid,
		});
		expect(r.hookSpecificOutput?.additionalContext).toContain("未跑測試");
	});

	it("git commit + 已跑過測試 → 不 warn", () => {
		mkdirSync(join(tmpDir, "tests"), { recursive: true });
		writeFileSync(join(tmpDir, "package.json"), "{}");
		_ws.testRun = 1;
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "git commit -m 'x'" },
			tool_result: { exitCode: 0 },
			cwd: tmpDir, session_id: testSid,
		});
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});

	it("git commit 但無 tests 目錄 → 不 warn（repo 無測試）", () => {
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "git commit -m 'x'" },
			tool_result: { exitCode: 0 },
			cwd: tmpDir, session_id: testSid,
		});
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});

	it("commit 失敗 (exitCode != 0) → 不 warn（hook 失敗 → 非真的 commit）", () => {
		mkdirSync(join(tmpDir, "tests"), { recursive: true });
		writeFileSync(join(tmpDir, "package.json"), "{}");
		_ws.testRun = 0;
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "git commit -m 'x'" },
			tool_result: { exitCode: 1 },
			cwd: tmpDir, session_id: testSid,
		});
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});

	// xd-bni5 follow-up 第 7 次誤報根因修復（2026-04-14）
	it("跨 hook 進程：initWs 從 /tmp/nova-ws-<sid>.json 載入 testRun → 不 warn", () => {
		mkdirSync(join(tmpDir, "tests"), { recursive: true });
		writeFileSync(join(tmpDir, "package.json"), "{}");
		// 模擬 flow-observer PostToolUse 已把 testRun 寫入 /tmp/nova-ws-<sid>.json
		const sid = `reflect-guard-test-${Date.now()}`;
		const wsPath = `/tmp/nova-ws-${sid}.json`;
		writeFileSync(wsPath, JSON.stringify({ testRun: 5, testPass: 5 }));
		// 清空 in-memory _ws 模擬全新 hook 進程
		for (const k of Object.keys(_ws)) delete _ws[k];
		const r = handler({
			tool_name: "Bash",
			tool_input: { command: "git commit -m 'x'" },
			tool_result: { exitCode: 0 },
			cwd: tmpDir,
			session_id: sid,
		});
		try { rmSync(wsPath, { force: true }); } catch {}
		// 若 initWs 沒被呼叫 → _ws.testRun undefined → guard 觸發 warn
		// 若 initWs 被呼叫 → 載入 testRun=5 → 不 warn
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});
});

describe("reflect-guard: reflection.jsonl 品質守護", () => {
	it("Write reflections.jsonl 行動空 → warn", () => {
		const p = join(tmpDir, "reflections.jsonl");
		const entry = { ts: "2026-04-13", trigger: "test", "行動": [] };
		writeFileSync(p, `${JSON.stringify(entry)}\n`);
		const r = handler({ tool_name: "Write", tool_input: { file_path: p } });
		expect(r.hookSpecificOutput?.additionalContext).toContain("品質不足");
	});

	it("Write reflections.jsonl 行動純散文無 rule/skill/hook → warn", () => {
		const p = join(tmpDir, "reflections.jsonl");
		const entry = { ts: "2026-04-13", trigger: "test", "行動": ["持續觀察"] };
		writeFileSync(p, `${JSON.stringify(entry)}\n`);
		const r = handler({ tool_name: "Write", tool_input: { file_path: p } });
		expect(r.hookSpecificOutput?.additionalContext).toContain("品質不足");
	});

	it("Write reflections.jsonl 含 rule/skill + 外部研究關鍵詞 → 不 warn", () => {
		const p = join(tmpDir, "reflections.jsonl");
		const entry = {
			ts: "2026-04-13",
			trigger: "test",
			"行動": ["修 rules/核心/核心.md 第 5 條 via WebSearch arxiv 研究"],
		};
		writeFileSync(p, `${JSON.stringify(entry)}\n`);
		const r = handler({ tool_name: "Write", tool_input: { file_path: p } });
		expect(r.hookSpecificOutput?.additionalContext).toBeUndefined();
	});

	it("組件5: 有 rule/skill 但無外部研究 → warn 第 4 步缺失 + baseline 累積", () => {
		const p = join(tmpDir, "reflections.jsonl");
		const entry = {
			ts: "2026-04-13",
			trigger: "test",
			"行動": ["修 rules/核心/核心.md 第 5 條"],
		};
		writeFileSync(p, `${JSON.stringify(entry)}\n`);
		const r = handler({ tool_name: "Write", tool_input: { file_path: p }, cwd: tmpDir });
		expect(r.hookSpecificOutput?.additionalContext).toContain("外部研究");
		expect(r.hookSpecificOutput?.additionalContext).toMatch(/baseline/);
	});

	it("fail-open：malformed input → allow 不 throw", () => {
		expect(() => handler(null)).not.toThrow();
		expect(handler(null).decision).toBe("allow");
		expect(handler({}).decision).toBe("allow");
	});
});
