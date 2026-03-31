import { describe, expect, test } from "bun:test";
import {
	evaluateDirection,
	pivotDirection,
} from "/Users/sbu/.claude/scripts/auto-mode-state.js";

describe("evaluateDirection", () => {
	test("無目標時回傳 continue", () => {
		const state = { target: null, staleCount: 0, directions: [] };
		expect(evaluateDirection(state)).toBe("continue");
	});

	test("staleCount=4, threshold=5 → continue", () => {
		const state = { target: "某個目標", staleCount: 4, directions: [] };
		expect(evaluateDirection(state, { staleThreshold: 5 })).toBe("continue");
	});

	test("staleCount=5, threshold=5 → pivot", () => {
		const state = { target: "某個目標", staleCount: 5, directions: [] };
		expect(evaluateDirection(state, { staleThreshold: 5 })).toBe("pivot");
	});

	test("3 個 converged 且 maxDirections=3 → escalate", () => {
		const state = {
			target: "某個目標",
			staleCount: 0,
			directions: [
				{ status: "converged" },
				{ status: "converged" },
				{ status: "converged" },
			],
		};
		expect(evaluateDirection(state, { maxDirections: 3 })).toBe("escalate");
	});

	test("escalate 優先於 pivot（同時滿足時 escalate 先）", () => {
		const state = {
			target: "某個目標",
			staleCount: 5,
			directions: [
				{ status: "converged" },
				{ status: "converged" },
				{ status: "converged" },
			],
		};
		// convergedCount=3 >= maxDirections=3 AND staleCount=5 >= staleThreshold=5
		// escalate 應優先
		expect(evaluateDirection(state, { staleThreshold: 5, maxDirections: 3 })).toBe("escalate");
	});
});

describe("pivotDirection", () => {
	test("標記 active 方向為 converged，重置 staleCount 和 current", () => {
		const state = {
			target: "目標",
			staleCount: 7,
			current: "目前步驟",
			directions: [
				{ name: "方向A", status: "converged" },
				{ name: "方向B", status: "active" },
			],
		};

		const result = pivotDirection(state);

		// active 的方向應該被標記為 converged
		expect(result.directions[1].status).toBe("converged");
		expect(result.directions[1].convergedAt).toBeDefined();

		// 其他方向不受影響
		expect(result.directions[0].status).toBe("converged");
		expect(result.directions[0].convergedAt).toBeUndefined();

		// staleCount 重置為 0
		expect(result.staleCount).toBe(0);

		// current 清空
		expect(result.current).toBeNull();

		// target 保持不變
		expect(result.target).toBe("目標");
	});

	test("無 active 方向時不影響 directions，仍重置 staleCount 和 current", () => {
		const state = {
			target: "目標",
			staleCount: 3,
			current: "某步驟",
			directions: [{ name: "方向A", status: "converged" }],
		};

		const result = pivotDirection(state);

		expect(result.directions[0].status).toBe("converged");
		expect(result.staleCount).toBe(0);
		expect(result.current).toBeNull();
	});

	test("不改變原始 state 物件（immutable）", () => {
		const state = {
			target: "目標",
			staleCount: 5,
			current: "步驟",
			directions: [{ name: "方向A", status: "active" }],
		};
		const originalStaleCount = state.staleCount;
		const originalCurrent = state.current;

		pivotDirection(state);

		// 原始 state 不變
		expect(state.staleCount).toBe(originalStaleCount);
		expect(state.current).toBe(originalCurrent);
		expect(state.directions[0].status).toBe("active");
	});
});
