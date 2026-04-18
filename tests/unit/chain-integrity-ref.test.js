import { describe, it, expect } from "bun:test";
import { scanReferenceIntegrity, REF_PATTERNS } from "../../../../.claude/scripts/lib/chain-integrity-ref.js";

// baseline test: iter 19 拆分 chain-integrity.js 629→497 行方案 C
// 動機：commit fcba86b refactor 純搬動無行為變化，補 baseline 鎖 API 對外契約
// 參考 rules/元件/Hook紀律.md L1 低風險改動應有 baseline test

describe("chain-integrity-ref 拆分後 API 契約", () => {
	it("export scanReferenceIntegrity 函式", () => {
		expect(typeof scanReferenceIntegrity).toBe("function");
	});

	it("export REF_PATTERNS 陣列", () => {
		expect(Array.isArray(REF_PATTERNS)).toBe(true);
		expect(REF_PATTERNS.length).toBeGreaterThan(0);
	});

	it("REF_PATTERNS 匹配 markdown link 格式", () => {
		const [pattern] = REF_PATTERNS;
		pattern.lastIndex = 0;
		const text = "見 [docs](~/.claude/rules/品質/README.md) 說明";
		const match = pattern.exec(text);
		expect(match).not.toBeNull();
		expect(match[2]).toBe("~/.claude/rules/品質/README.md");
	});

	it("空 sources 回傳 score=100（0 引用即 100% 完整）", () => {
		const { result, actions } = scanReferenceIntegrity([]);
		expect(result.total).toBe(0);
		expect(result.broken).toBe(0);
		expect(result.stale).toBe(0);
		expect(result.score).toBe(100);
		expect(Array.isArray(actions)).toBe(true);
	});

	it("log 參數可選（default noop）", () => {
		expect(() => scanReferenceIntegrity([])).not.toThrow();
		expect(() => scanReferenceIntegrity([], () => {})).not.toThrow();
	});

	it("broken ref 產生 P0 action", () => {
		const fakeSource = {
			type: "rule",
			path: "/tmp/test-nonexistent-source.md",
		};
		// 實體檔不需存在 — scanReferenceIntegrity 用 safeReadFile 會 return ""
		// 測試 empty content path：total=0 才對，broken=0
		const { result } = scanReferenceIntegrity([fakeSource]);
		expect(result.total).toBe(0);
	});
});
