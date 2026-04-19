import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";

const {
	computeCacheEconomics,
	compareScenarios,
	tokensFromChars,
	makeRecommendation,
	CACHE_ECONOMICS_BASE,
} = await import(`${homedir()}/.claude/scripts/context-cost-baseline.js`);

describe("context-cost-baseline", () => {
	test("應該暴露 Anthropic cache 係數", () => {
		expect(CACHE_ECONOMICS_BASE.cached_hit_multiplier).toBe(0.1);
		expect(CACHE_ECONOMICS_BASE.cache_write_multiplier).toBe(1.25);
		expect(CACHE_ECONOMICS_BASE.ttl_minutes).toBe(5);
		expect(CACHE_ECONOMICS_BASE.break_even_reuses).toBeCloseTo(1.28, 1);
	});

	test("effective cost 公式 write×(1/n) + hit×(1 - 1/n) 正確", () => {
		const r = computeCacheEconomics(10000, 5);
		expect(r.raw_tokens).toBe(10000);
		expect(r.write_cost).toBe(12500);
		expect(r.hit_cost).toBe(1000);
		// 12500×(1/5) + 1000×(4/5) = 2500 + 800 = 3300
		expect(r.effective_cost_per_turn).toBe(3300);
		// total in ttl = 12500 + 1000×4 = 16500
		expect(r.total_cost_in_ttl).toBe(16500);
	});

	test("reuses=1 時 effective 等於 write cost（無 cache 利益）", () => {
		const r = computeCacheEconomics(10000, 1);
		expect(r.effective_cost_per_turn).toBe(12500);
	});

	test("thinned_50pct 應該比 current 便宜", () => {
		const s = compareScenarios(10000, 5);
		expect(s.thinned_50pct.effective_cost_per_turn).toBeLessThan(
			s.current.effective_cost_per_turn,
		);
		expect(s.thinned_50pct.raw_tokens).toBe(5000);
	});

	test("read_on_demand 在 cache 熱時比 current 貴（驗證反模式）", () => {
		const s = compareScenarios(10000, 5);
		// current cache 熱 = 3300 per turn；read_on_demand = 4000 per turn uncached
		expect(s.read_on_demand.effective_cost_per_turn).toBeGreaterThan(
			s.current.effective_cost_per_turn,
		);
	});

	test("makeRecommendation 高命中率產「薄化偽需求」verdict", () => {
		// n=20 → effective = 12500/20 + 1000×(19/20) = 625 + 950 = 1575
		// ratio = 1575/10000 = 0.1575 < 0.2 → 薄化偽需求
		const s = compareScenarios(10000, 20);
		const rec = makeRecommendation(10000, s);
		expect(rec.verdict).toBe("薄化偽需求");
		expect(rec.hit_rate_estimate).toBeGreaterThan(0.8);
	});

	test("makeRecommendation 中命中率產「prefix 固化」verdict", () => {
		// n=5 → ratio = 0.33 → prefix 固化
		const s = compareScenarios(10000, 5);
		const rec = makeRecommendation(10000, s);
		expect(rec.verdict).toBe("prefix 固化");
	});

	test("makeRecommendation 低命中率產「條件載入」verdict", () => {
		// n=1 → ratio = 1.25 > 0.5 → 條件載入
		const s = compareScenarios(10000, 1);
		const rec = makeRecommendation(10000, s);
		expect(rec.verdict).toBe("條件載入");
	});

	test("rawTokens=0 時 recommendation 回 no_data", () => {
		const s = compareScenarios(0, 1);
		const rec = makeRecommendation(0, s);
		expect(rec.verdict).toBe("no_data");
	});

	test("tokensFromChars 用 3 chars/token 近似", () => {
		expect(tokensFromChars(300)).toBe(100);
		expect(tokensFromChars(0)).toBe(0);
		expect(tokensFromChars(1)).toBe(1); // max(1, round(1/3))
	});

	test("空輸入 compareScenarios 不 crash", () => {
		expect(() => compareScenarios(0, 1)).not.toThrow();
		const s = compareScenarios(0, 1);
		expect(s.current.effective_cost_per_turn).toBe(0);
	});
});
