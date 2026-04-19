// tests/unit/hooks/ralph-queue-gate.test.js
// Manager proactive queue DONE gate (xd-yf03, 2026-04-17)
// 根因：Manager session 空轉是 ralph-loop DONE gate 只看 state.prompt 就放行，
//       不管 reflections 未閉環 + outgoing dispatch pending。
// 治本：加 ralph-queue-gate.js Manager 專屬 Stop hook，
//       queue_depth > 0 AND state.prompt allow DONE → block。

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isEnabled,
	countUnresolvedReflections,
	readManagerQueueFile,
	statePromptAllowsDone,
	calcQueueDepth,
	on,
} from "/Users/sbu/.claude/hooks/modules/ralph-queue-gate.js";

let tmpCwd;

beforeEach(() => {
	tmpCwd = mkdtempSync(join(tmpdir(), "rqg-test-"));
	mkdirSync(join(tmpCwd, ".claude"), { recursive: true });
	mkdirSync(join(tmpCwd, "data"), { recursive: true });
});

afterEach(() => {
	try { rmSync(tmpCwd, { recursive: true, force: true }); } catch { /* */ }
	try { unlinkSync("/tmp/nova-manager-queue.json"); } catch { /* */ }
});

describe("isEnabled — marker 檔啟用機制", () => {
	test("無 marker → disabled", () => {
		expect(isEnabled(tmpCwd)).toBe(false);
	});
	test("有 marker → enabled", () => {
		writeFileSync(join(tmpCwd, ".claude/manager-queue.enabled"), "");
		expect(isEnabled(tmpCwd)).toBe(true);
	});
	test("空 cwd → disabled (fail-open)", () => {
		expect(isEnabled(null)).toBe(false);
		expect(isEnabled("")).toBe(false);
	});
});

describe("countUnresolvedReflections — resolved_at=null 計數", () => {
	test("無 reflections.jsonl → 0", () => {
		expect(countUnresolvedReflections(tmpCwd)).toBe(0);
	});
	test("全 resolved → 0", () => {
		const path = join(tmpCwd, "data/reflections.jsonl");
		writeFileSync(path,
			JSON.stringify({ ts: "x", trigger: "a", resolved_at: "2026-04-17" }) + "\n" +
			JSON.stringify({ ts: "y", trigger: "b", resolved_at: "2026-04-17" }) + "\n"
		);
		expect(countUnresolvedReflections(tmpCwd)).toBe(0);
	});
	test("部分未閉環 → 對應計數", () => {
		const path = join(tmpCwd, "data/reflections.jsonl");
		writeFileSync(path,
			JSON.stringify({ ts: "x", trigger: "a", resolved_at: null }) + "\n" +
			JSON.stringify({ ts: "y", trigger: "b", resolved_at: "2026-04-17" }) + "\n" +
			JSON.stringify({ ts: "z", trigger: "c", resolved_at: null }) + "\n"
		);
		expect(countUnresolvedReflections(tmpCwd)).toBe(2);
	});
	test("bad JSON line → skip 不 crash", () => {
		const path = join(tmpCwd, "data/reflections.jsonl");
		writeFileSync(path,
			"not-json\n" +
			JSON.stringify({ ts: "x", resolved_at: null }) + "\n"
		);
		expect(countUnresolvedReflections(tmpCwd)).toBe(1);
	});
});

describe("readManagerQueueFile — /tmp 覆蓋", () => {
	test("檔不存在 → 0", () => {
		try { unlinkSync("/tmp/nova-manager-queue.json"); } catch { /* */ }
		expect(readManagerQueueFile()).toBe(0);
	});
	test("有 tasks 陣列 → 計未 completed 數", () => {
		writeFileSync("/tmp/nova-manager-queue.json", JSON.stringify({
			tasks: [
				{ id: 1, status: "pending" },
				{ id: 2, status: "completed" },
				{ id: 3, status: "in_progress" },
			]
		}));
		expect(readManagerQueueFile()).toBe(2);
	});
	test("malformed JSON → 0 (fail-open)", () => {
		writeFileSync("/tmp/nova-manager-queue.json", "{ bad");
		expect(readManagerQueueFile()).toBe(0);
	});
});

describe("statePromptAllowsDone — 對齊 ralph-loop.js", () => {
	test("無 ralph-loop.local.md → false", () => {
		expect(statePromptAllowsDone(tmpCwd)).toBe(false);
	});
	test("state.prompt 白名單命中 → true", () => {
		writeFileSync(join(tmpCwd, ".claude/ralph-loop.local.md"),
			"---\niteration: 1\n---\n\n本輪無剩餘任務 — DONE\n"
		);
		expect(statePromptAllowsDone(tmpCwd)).toBe(true);
	});
	test("state.prompt 原始使用者訊息 → false", () => {
		writeFileSync(join(tmpCwd, ".claude/ralph-loop.local.md"),
			"---\niteration: 1\n---\n\n修 wrapup-guard bug\n"
		);
		expect(statePromptAllowsDone(tmpCwd)).toBe(false);
	});
});

describe("on.Stop — 整合行為", () => {
	test("未啟用（無 marker）→ allow（nb session 不受影響）", () => {
		const r = on.Stop({ cwd: tmpCwd });
		expect(r.decision).toBe("allow");
	});
	test("啟用 + queue 空 + state.prompt 可 DONE → allow", () => {
		writeFileSync(join(tmpCwd, ".claude/manager-queue.enabled"), "");
		writeFileSync(join(tmpCwd, ".claude/ralph-loop.local.md"),
			"---\niteration: 1\n---\n\n本輪無剩餘任務\n"
		);
		// no reflections
		const r = on.Stop({ cwd: tmpCwd });
		expect(r.decision).toBe("allow");
	});
	test("啟用 + queue 非空 + state.prompt 可 DONE → block", () => {
		writeFileSync(join(tmpCwd, ".claude/manager-queue.enabled"), "");
		writeFileSync(join(tmpCwd, ".claude/ralph-loop.local.md"),
			"---\niteration: 1\n---\n\n本輪無剩餘任務\n"
		);
		writeFileSync(join(tmpCwd, "data/reflections.jsonl"),
			JSON.stringify({ ts: "x", trigger: "a", resolved_at: null }) + "\n"
		);
		const r = on.Stop({ cwd: tmpCwd });
		expect(r.decision).toBe("block");
		expect(r.reason).toContain("queue_depth=");
		expect(r.reason).toContain("未閉環項目");
	});
	test("啟用 + state.prompt 未覆寫（非 DONE 狀態）→ allow（讓 ralph-loop 處理）", () => {
		writeFileSync(join(tmpCwd, ".claude/manager-queue.enabled"), "");
		writeFileSync(join(tmpCwd, ".claude/ralph-loop.local.md"),
			"---\niteration: 1\n---\n\n原始使用者指令\n"
		);
		writeFileSync(join(tmpCwd, "data/reflections.jsonl"),
			JSON.stringify({ ts: "x", trigger: "a", resolved_at: null }) + "\n"
		);
		const r = on.Stop({ cwd: tmpCwd });
		expect(r.decision).toBe("allow");
	});
	test("錯誤 input → allow (fail-open)", () => {
		expect(on.Stop({}).decision).toBe("allow");
		expect(on.Stop({ cwd: null }).decision).toBe("allow");
	});
});

describe("LOCAL_MODULES 註冊驗證", () => {
	test("hook-client.js 有註冊 ralph-queue-gate.js Stop handler", () => {
		const { readFileSync } = require("node:fs");
		const { join } = require("node:path");
		const { homedir } = require("node:os");
		const clientPath = join(homedir(), ".claude/hooks/hook-client.js");
		const content = readFileSync(clientPath, "utf-8");
		expect(content).toContain("hooks/modules/ralph-queue-gate.js");
	});
});
