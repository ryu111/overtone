// xd-nvuj Option D: reflection-persist.js 寫入時 inline 應用 backfill 判準
// 驗證：純散文 action → resolved_at=now + resolve_reason='prose_action_unverifiable'
// 含 commit/file/rule artifact → resolved_at=null (走正常 resolver/reviewer 路徑)
import { describe, it, expect } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
const { buildEntry } = await import(join(homedir(), ".claude/hooks/modules/reflection-persist.js"));

describe("reflection-persist buildEntry inline resolve (xd-nvuj)", () => {
	it("純散文 action → resolved_at=now + resolve_reason='prose_action_unverifiable'", () => {
		const entry = buildEntry(
			{ cwd: "/tmp", trigger_type: "autonomous" },
			{ 結論: ["洞察 1"], 行動: ["這是純散文沒有任何 artifact 引用只是經驗教訓"] },
			"hash1",
		);
		expect(entry.resolved_at).not.toBeNull();
		expect(entry.resolve_reason).toBe("prose_action_unverifiable");
	});

	it("含 commit hash action → resolved_at=null (走正常 resolver 路徑)", () => {
		const entry = buildEntry(
			{ cwd: "/tmp", trigger_type: "autonomous" },
			{ 結論: ["洞察"], 行動: ["修好了 commit abc1234 驗證"] },
			"hash2",
		);
		expect(entry.resolved_at).toBeNull();
		expect(entry.resolve_reason).toBeUndefined();
	});

	it("含 rule path action → resolved_at=null", () => {
		const entry = buildEntry(
			{ cwd: "/tmp", trigger_type: "autonomous" },
			{ 結論: ["洞察"], 行動: ["寫入 rules/品質/測試規範.md"] },
			"hash3",
		);
		expect(entry.resolved_at).toBeNull();
	});

	it("混合散文 + artifact action → resolved_at=null (至少一條可驗證)", () => {
		const entry = buildEntry(
			{ cwd: "/tmp", trigger_type: "autonomous" },
			{ 結論: ["洞察"], 行動: ["純散文經驗", "寫入 skills/nova-test/"] },
			"hash4",
		);
		expect(entry.resolved_at).toBeNull();
	});

	it("空 action → resolved_at=null (不觸發 allProse)", () => {
		const entry = buildEntry({ cwd: "/tmp" }, { 結論: ["x"], 行動: [] }, "hash5");
		expect(entry.resolved_at).toBeNull();
	});
});
