import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	verifyActionString,
	resolveEntry,
	resolveAll,
} from "../../../../.claude/scripts/reflection-resolver.js";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpRepo;
let tmpJsonl;

const mockDeps = {
	verifyCommit: (hash) => hash === "abc1234" || hash === "def5678",
	verifyFile: () => false,
	verifyRuleRef: (ref) => ref === "rules/valid/rule.md",
};

beforeEach(() => {
	tmpRepo = mkdtempSync(join(tmpdir(), "rresolver-"));
	mkdirSync(join(tmpRepo, "data"), { recursive: true });
	tmpJsonl = join(tmpRepo, "data/reflections.jsonl");
});
afterEach(() => { try { rmSync(tmpRepo, { recursive: true, force: true }); } catch {} });

describe("verifyActionString", () => {
	it("commit hash 有效 → verified", () => {
		const r = verifyActionString("已 commit abc1234 修了 bug", mockDeps);
		expect(r.verified).toBe(true);
		expect(r.evidence).toContain("commit:");
	});

	it("commit hash 無效 → verifiable 但不 verified", () => {
		const r = verifyActionString("commit 9999999 不存在", mockDeps);
		expect(r.verifiable).toBe(true);
		expect(r.verified).toBe(false);
	});

	it("rules/ 引用有效 → verified", () => {
		const r = verifyActionString("補進 rules/valid/rule.md", mockDeps);
		expect(r.verified).toBe(true);
		expect(r.evidence).toContain("rule:");
	});

	it("rules/ 引用無效 → not verified", () => {
		const r = verifyActionString("補進 rules/missing/foo.md", mockDeps);
		expect(r.verified).toBe(false);
	});

	it("純描述無 pattern → not verifiable", () => {
		const r = verifyActionString("做了一些反思", mockDeps);
		expect(r.verifiable).toBe(false);
		expect(r.verified).toBe(false);
	});

	it("空字串或非字串 → not verifiable", () => {
		expect(verifyActionString("", mockDeps).verifiable).toBe(false);
		expect(verifyActionString(null, mockDeps).verifiable).toBe(false);
	});
});

describe("resolveEntry", () => {
	it("所有行動都 verified → 回 ISO ts", () => {
		const entry = { 行動: ["commit abc1234 done", "rules/valid/rule.md 補"] };
		const ts = resolveEntry(entry, mockDeps);
		expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("部分未 verifiable → null", () => {
		const entry = { 行動: ["commit abc1234", "一些描述無 pattern"] };
		expect(resolveEntry(entry, mockDeps)).toBeNull();
	});

	it("至少一個 verifiable 但失敗 → null", () => {
		const entry = { 行動: ["commit 9999999", "commit abc1234"] };
		// 第一個 verifiable 但失敗 → allOk=false
		expect(resolveEntry(entry, mockDeps)).toBeNull();
	});

	it("空行動 → null", () => {
		expect(resolveEntry({ 行動: [] }, mockDeps)).toBeNull();
		expect(resolveEntry({}, mockDeps)).toBeNull();
	});

	it("actions key 相容", () => {
		const entry = { actions: ["commit abc1234"] };
		expect(resolveEntry(entry, mockDeps)).not.toBeNull();
	});
});

describe("resolveAll 整合", () => {
	it("掃描 + 回填 resolved_at", async () => {
		const entries = [
			{ ts: "2026-04-13T01:00:00Z", trigger: "a", 行動: ["commit abc1234"], resolved_at: null },
			{ ts: "2026-04-13T02:00:00Z", trigger: "b", 行動: ["無法驗證的文字"], resolved_at: null },
			{ ts: "2026-04-13T03:00:00Z", trigger: "c", 行動: ["commit def5678"], resolved_at: "2026-04-13T03:30:00Z" },
		];
		writeFileSync(tmpJsonl, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
		const r = await resolveAll(tmpJsonl, mockDeps);
		expect(r.scanned).toBe(2); // 只掃 null 的 2 筆
		expect(r.resolved).toBe(1); // 只有第一筆驗證通過
		// 驗證檔案被更新
		const updated = readFileSync(tmpJsonl, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
		expect(updated[0].resolved_at).not.toBeNull();
		expect(updated[1].resolved_at).toBeNull();
		expect(updated[2].resolved_at).toBe("2026-04-13T03:30:00Z"); // 原有的不變
	});

	it("不存在檔案 → error", async () => {
		const r = await resolveAll("/nonexistent.jsonl");
		expect(r.error).toBeDefined();
	});

	it("舊 entry 沒 resolved_at 欄位 → 補 null 保持向前相容", async () => {
		const old = { ts: "2026-04-10T00:00:00Z", trigger: "x", 行動: [] };
		writeFileSync(tmpJsonl, JSON.stringify(old) + "\n");
		await resolveAll(tmpJsonl, mockDeps);
		const updated = JSON.parse(readFileSync(tmpJsonl, "utf-8").trim());
		expect(updated.resolved_at).toBeNull();
	});
});
