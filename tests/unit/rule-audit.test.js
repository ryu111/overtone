import { describe, it, expect } from "bun:test";
import { scanClauses, classifyClause, audit, walkMarkdown } from "../../../../.claude/scripts/rule-audit.js";
import { homedir } from "node:os";
import { join } from "node:path";

describe("rule-audit scanClauses", () => {
	it("抓取含 📋 MUST 的行並記錄行號", () => {
		const content = [
			"# Some rule",
			"",
			"📋 MUST 做這件事。",
			"一般文字",
			"📋 MUST 也做這件事。",
			"⛔ NEVER 不該出現",
		].join("\n");
		const out = scanClauses(content, join(homedir(), ".claude/rules/test/foo.md"));
		expect(out.length).toBe(2);
		expect(out[0].line).toBe(3);
		expect(out[0].text).toContain("做這件事");
		expect(out[1].line).toBe(5);
		expect(out[0].file).toBe("rules/test/foo.md");
	});

	it("空檔案回空陣列", () => {
		expect(scanClauses("", join(homedir(), ".claude/rules/a.md"))).toEqual([]);
	});

	it("只有 ⛔ NEVER 不算 MUST", () => {
		const content = "⛔ NEVER 做這件事\n💡 COULD 做別的";
		expect(scanClauses(content, join(homedir(), ".claude/rules/b.md"))).toEqual([]);
	});

	it("條款前有 list marker 仍能抓到", () => {
		const content = "- 📋 MUST 列表項\n* 📋 MUST 星號項";
		expect(scanClauses(content, join(homedir(), ".claude/rules/c.md")).length).toBe(2);
	});
});

describe("rule-audit classifyClause", () => {
	const mockClause = {
		file: "rules/核心/任務管理.md",
		line: 10,
		text: "📋 MUST 每次建 TaskCreate 追蹤工作",
	};

	it("LLM 回合法 shape → 直接使用", async () => {
		const mockAsk = async () => ({ category: "programmable", confidence: 0.9, reason: "可 count tool calls" });
		const r = await classifyClause(mockClause, { askLocalModelJSON: mockAsk });
		expect(r.category).toBe("programmable");
		expect(r.confidence).toBe(0.9);
		expect(r.reason).toBe("可 count tool calls");
	});

	it("LLM 回不明 category → fallback 為 semantic", async () => {
		const mockAsk = async () => ({ category: "weird", confidence: 0.5, reason: "" });
		const r = await classifyClause(mockClause, { askLocalModelJSON: mockAsk });
		expect(r.category).toBe("semantic");
	});

	it("LLM 不可用 → fallback 全回預設", async () => {
		const mockAsk = async (_p, fb) => fb;
		const r = await classifyClause(mockClause, { askLocalModelJSON: mockAsk });
		expect(r.category).toBe("semantic");
		expect(r.confidence).toBe(0.0);
		expect(r.reason).toContain("local model unavailable");
	});

	it("confidence 值限制在 [0,1]", async () => {
		const mockAskHi = async () => ({ category: "programmable", confidence: 5.5, reason: "ok" });
		const mockAskLo = async () => ({ category: "partial", confidence: -3, reason: "ok" });
		expect((await classifyClause(mockClause, { askLocalModelJSON: mockAskHi })).confidence).toBe(1);
		expect((await classifyClause(mockClause, { askLocalModelJSON: mockAskLo })).confidence).toBe(0);
	});
});

describe("rule-audit audit integration", () => {
	it("產出完整 schema 含 scanned_at / total / clauses", async () => {
		// 用真實 tmp 檔讓 audit() 內部 readFileSync 能讀
		const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
		const { tmpdir } = require("node:os");
		const tmp = mkdtempSync(join(tmpdir(), "rule-audit-"));
		const fp = join(tmp, "mock-a.md");
		writeFileSync(fp, "📋 MUST A\nline 2\n📋 MUST B\n");
		try {
			const mockWalker = () => [fp];
			const mockClassifier = async (c) => ({
				category: "programmable",
				confidence: 0.8,
				reason: `for ${c.text}`,
			});
			const r = await audit({
				walkMarkdown: mockWalker,
				classifyClause: mockClassifier,
			});
			expect(r.total).toBe(2);
			expect(r.clauses.length).toBe(2);
			expect(r.clauses[0].category).toBe("programmable");
			expect(r.clauses[0].text).toContain("📋 MUST A");
			expect(r.scanned_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});
});

describe("rule-audit 實際 rules/ 目錄掃描", () => {
	it("找到 ≥ 100 條 📋 MUST（真實環境驗證）", () => {
		const files = walkMarkdown(join(homedir(), ".claude/rules"));
		expect(files.length).toBeGreaterThan(10);
		let total = 0;
		for (const f of files) {
			const content = require("node:fs").readFileSync(f, "utf-8");
			total += scanClauses(content, f).length;
		}
		expect(total).toBeGreaterThanOrEqual(100);
	});
});
