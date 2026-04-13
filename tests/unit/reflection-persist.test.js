import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	extractInsightSection,
	parseInsightBullets,
	hashEntry,
	isDuplicate,
	buildEntry,
	persistReflection,
} from "../../../../.claude/hooks/modules/reflection-persist.js";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "reflection-persist-"));
});
afterEach(() => {
	try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe("extractInsightSection", () => {
	it("抓取 ★ Insight ─────── 分隔線包圍章節", () => {
		const text = [
			"前言",
			"`★ Insight ─────────────────────────────────────`",
			"- 第一點",
			"- 第二點",
			"`─────────────────────────────────────────────────`",
			"後記",
		].join("\n");
		const s = extractInsightSection(text);
		expect(s).toContain("第一點");
		expect(s).toContain("第二點");
		expect(s).not.toContain("前言");
	});

	it("抓取 ### ★ Insight markdown header 章節", () => {
		const text = [
			"## 本次完成",
			"正文...",
			"### ★ Insight",
			"1. **第一條**：內容說明",
			"2. **第二條**：內容說明",
			"## 接下來的建議",
			"建議...",
		].join("\n");
		const s = extractInsightSection(text);
		expect(s).toContain("第一條");
		expect(s).toContain("第二條");
		expect(s).not.toContain("接下來的建議");
	});

	it("無 Insight 章節回 null", () => {
		expect(extractInsightSection("純對話內容，沒有章節")).toBeNull();
		expect(extractInsightSection("")).toBeNull();
		expect(extractInsightSection(null)).toBeNull();
	});
});

describe("parseInsightBullets", () => {
	it("分類含 commit hash 的句子為行動", () => {
		const section = [
			"1. **第一條發現**：soft reminder 對 AI 無效",
			"2. **第二條發現**：commit de09b88 升級為 block",
		].join("\n");
		const r = parseInsightBullets(section);
		expect(r.行動.length).toBeGreaterThan(0);
		expect(r.行動.some((a) => a.includes("de09b88"))).toBe(true);
	});

	it("含 file path 的句子分類為行動", () => {
		const section = [
			"1. **觀察**：parser 在邊界案例會失敗",
			"2. **修法**：scripts/rule-audit.js 加 deps injection",
		].join("\n");
		const r = parseInsightBullets(section);
		expect(r.行動.some((a) => a.includes("scripts/rule-audit.js"))).toBe(true);
	});

	it("空字串回空結論行動", () => {
		const r = parseInsightBullets("");
		expect(r.結論).toEqual([]);
		expect(r.行動).toEqual([]);
	});
});

describe("hashEntry + isDuplicate", () => {
	it("相同內容產生相同 hash", () => {
		expect(hashEntry("abc")).toBe(hashEntry("abc"));
		expect(hashEntry("a")).not.toBe(hashEntry("b"));
	});

	it("檔案不存在 → 不重複", () => {
		expect(isDuplicate(join(tmpDir, "missing.jsonl"), "deadbeef")).toBe(false);
	});

	it("30 秒內同 hash → 重複", () => {
		const path = join(tmpDir, "r.jsonl");
		const now = Date.now();
		const entry = { ts: new Date(now - 5000).toISOString(), _hash: "h1", 結論: ["a"], 行動: [] };
		writeFileSync(path, `${JSON.stringify(entry)}\n`);
		expect(isDuplicate(path, "h1", now)).toBe(true);
		expect(isDuplicate(path, "h2", now)).toBe(false);
	});

	it("超過 30 秒 → 不重複", () => {
		const path = join(tmpDir, "r.jsonl");
		const now = Date.now();
		const entry = { ts: new Date(now - 60000).toISOString(), _hash: "h1", 結論: ["a"], 行動: [] };
		writeFileSync(path, `${JSON.stringify(entry)}\n`);
		expect(isDuplicate(path, "h1", now)).toBe(false);
	});
});

describe("buildEntry", () => {
	it("預設 trigger_type 為 autonomous", () => {
		const e = buildEntry({}, { 結論: ["a"], 行動: ["b"] }, "hash1", new Date("2026-04-13T00:00:00Z"));
		expect(e.trigger_type).toBe("autonomous");
		expect(e.ts).toBe("2026-04-13T00:00:00.000Z");
		expect(e.resolved_at).toBeNull();
		expect(e._hash).toBe("hash1");
	});

	it("使用者 input trigger_type 優先", () => {
		const e = buildEntry({ trigger_type: "correction" }, { 結論: ["a"], 行動: [] }, "h", new Date());
		expect(e.trigger_type).toBe("correction");
	});
});

describe("persistReflection 整合", () => {
	it("有 Insight 章節 + 合法 cwd → 寫入 data/reflections.jsonl", () => {
		const insightText = [
			"本次完成",
			"`★ Insight ───────`",
			"1. **發現**：commit abc1234 修了 bug",
			"`─────────────────`",
		].join("\n");
		persistReflection({ cwd: tmpDir, last_assistant_message: insightText });
		const path = join(tmpDir, "data/reflections.jsonl");
		expect(existsSync(path)).toBe(true);
		const line = readFileSync(path, "utf-8").trim();
		const entry = JSON.parse(line);
		expect(entry.trigger_type).toBe("autonomous");
		expect(entry.結論.length + entry.行動.length).toBeGreaterThan(0);
	});

	it("無 Insight 章節 → 不寫入", () => {
		persistReflection({ cwd: tmpDir, last_assistant_message: "純對話內容" });
		expect(existsSync(join(tmpDir, "data/reflections.jsonl"))).toBe(false);
	});

	it("無 cwd → fail-open 回 allow 不 crash", () => {
		expect(() => persistReflection({})).not.toThrow();
		expect(persistReflection({}).decision).toBe("allow");
	});

	it("無 last_assistant_message → fail-open", () => {
		expect(persistReflection({ cwd: tmpDir }).decision).toBe("allow");
		expect(existsSync(join(tmpDir, "data/reflections.jsonl"))).toBe(false);
	});

	it("連續 2 次同內容 → 只寫 1 條（dedup）", () => {
		const insightText = [
			"`★ Insight ───────`",
			"1. **發現**：commit xyz9876 修了另一個 bug",
			"`─────────────────`",
		].join("\n");
		persistReflection({ cwd: tmpDir, last_assistant_message: insightText });
		persistReflection({ cwd: tmpDir, last_assistant_message: insightText });
		const lines = readFileSync(join(tmpDir, "data/reflections.jsonl"), "utf-8").trim().split("\n");
		expect(lines.length).toBe(1);
	});

	it("壞 cwd path（不可寫目錄）→ fail-open 不 throw", () => {
		const insightText = "`★ Insight ───────`\n1. **測試**\n`─────────────────`";
		// 用 /dev/null/nonexistent 讓 mkdirSync 失敗
		expect(() => persistReflection({ cwd: "/dev/null/x", last_assistant_message: insightText })).not.toThrow();
	});
});
