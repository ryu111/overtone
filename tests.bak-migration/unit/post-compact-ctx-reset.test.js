// post-compact-ctx-reset.test.js — Bug 3 regression (xd-1776394737683-mz7e)
// PostCompact 後 /tmp/nova-usage.json sessions[project].context 應歸 0
// 避免 self-compact ctx gate / UserPromptSubmit 提醒 讀到壓縮前殘留值誤判
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FLOW_OBSERVER = join(homedir(), ".claude/hooks/modules/flow-observer.js");
const USAGE_PATH = "/tmp/nova-usage.json";
const BACKUP_PATH = "/tmp/nova-usage.json.test-backup";

function backupUsage() {
	if (existsSync(USAGE_PATH)) {
		writeFileSync(BACKUP_PATH, readFileSync(USAGE_PATH, "utf-8"));
	}
}
function restoreUsage() {
	if (existsSync(BACKUP_PATH)) {
		writeFileSync(USAGE_PATH, readFileSync(BACKUP_PATH, "utf-8"));
		rmSync(BACKUP_PATH, { force: true });
	}
}

describe("PostCompact ctx reset (Bug 3)", () => {
	beforeEach(() => backupUsage());
	afterEach(() => restoreUsage());

	test("原始碼含 Bug 3 修法標記", () => {
		const src = readFileSync(FLOW_OBSERVER, "utf-8");
		expect(src).toContain("xd-1776394737683-mz7e");
		expect(src).toContain("sessions[project].context = 0");
	});

	test("PostCompact handler 在原有 ctx 邏輯前執行 reset", () => {
		const src = readFileSync(FLOW_OBSERVER, "utf-8");
		const postCompactSection = src.substring(src.indexOf("PostCompact: (input)"));
		const resetIdx = postCompactSection.indexOf("sessions[project].context = 0");
		const ctxVarIdx = postCompactSection.indexOf('let ctx = ""');
		expect(resetIdx).toBeGreaterThan(-1);
		expect(ctxVarIdx).toBeGreaterThan(-1);
		// reset 必須在 ctx 訊息構建前執行
		expect(resetIdx).toBeLessThan(ctxVarIdx);
	});

	test("實測：PostCompact 觸發後讀 usage.json 應看到該 project context=0", async () => {
		// 設初始 usage 模擬壓縮前
		const initial = {
			fiveHour: 25,
			sessions: {
				"test-proj-bug3": { context: 55, ts: 1776000000 },
				"other-proj": { context: 20, ts: 1776000000 },
			},
		};
		writeFileSync(USAGE_PATH, JSON.stringify(initial, null, 2));

		// 觸發 PostCompact handler
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}`);
		mod.on.PostCompact({ cwd: "/Users/test/projects/test-proj-bug3", compact_summary: "test" });

		// 驗證
		const after = JSON.parse(readFileSync(USAGE_PATH, "utf-8"));
		expect(after.sessions["test-proj-bug3"].context).toBe(0);
		// 其他 project 不動
		expect(after.sessions["other-proj"].context).toBe(20);
	});

	test("usage.json 不存在時不 throw（fail-open）", async () => {
		if (existsSync(USAGE_PATH)) rmSync(USAGE_PATH, { force: true });
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}a`);
		expect(() => mod.on.PostCompact({ cwd: "/Users/test/x", compact_summary: "t" })).not.toThrow();
	});

	test("project 不在 sessions 時不新增也不 throw", async () => {
		writeFileSync(USAGE_PATH, JSON.stringify({
			fiveHour: 1,
			sessions: { "existing-proj": { context: 10, ts: 1 } },
		}, null, 2));
		const mod = await import(`${FLOW_OBSERVER}?t=${Date.now()}b`);
		mod.on.PostCompact({ cwd: "/Users/test/new-proj", compact_summary: "t" });
		const after = JSON.parse(readFileSync(USAGE_PATH, "utf-8"));
		expect(after.sessions["new-proj"]).toBeUndefined();
		expect(after.sessions["existing-proj"].context).toBe(10);
	});
});
