import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	parseArgs,
	reviewDimensions,
	buildFindings,
	readCommit,
	readTodayReflection,
	readLatestSynthesis,
	hasCrossRepoTest,
} from "../../../../.claude/scripts/review-agent.js";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "review-agent-"));
});
afterEach(() => {
	try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe("parseArgs", () => {
	it("預設值", () => {
		const r = parseArgs([]);
		expect(r.commit).toBe("HEAD");
		expect(r.dryRun).toBe(false);
	});

	it("--cwd / --commit / --dry-run 全解析", () => {
		const r = parseArgs(["--cwd=/x", "--commit=abc1234", "--dry-run"]);
		expect(r.cwd).toBe("/x");
		expect(r.commit).toBe("abc1234");
		expect(r.dryRun).toBe(true);
	});
});

describe("reviewDimensions", () => {
	it("完整優良 commit → 高分", () => {
		const commit = {
			hash: "abc1234567890",
			message: "feat(xxx): 很長的治本型訊息附動機和根因說明\n\n詳細背景解釋，含更多內容避免被判 trivial。" + "x".repeat(80),
			files: ["hooks/modules/x.js", "tests/unit/x.test.js"],
		};
		const reflection = "多行反思內容 commit abc1234 via rules/core/x.md\n- bullet 1\n- bullet 2\n- bullet 3\n- bullet 4\n" + "x".repeat(200);
		const synthesis = "synthesis content " + "x".repeat(100);
		const dims = reviewDimensions({ commit, reflection, synthesis });
		expect(dims.commit_message.score).toBe(10);
		expect(dims.test_coverage.score).toBe(9);
		expect(dims.reflection_quality.score).toBe(9);
		expect(dims.reflection_volume.score).toBe(10);
		expect(dims.synthesis_available.score).toBe(10);
	});

	it("trivial commit 無 test 無反思 → 低分 + actionable", () => {
		const commit = {
			hash: "abc1234567890",
			message: "fix",
			files: ["hooks/modules/x.js"],
		};
		const dims = reviewDimensions({ commit, reflection: null, synthesis: null });
		expect(dims.commit_message.score).toBe(3);
		expect(dims.commit_message.actionable).toBeTruthy();
		expect(dims.test_coverage.score).toBe(4);
		expect(dims.test_coverage.actionable).toBeTruthy();
	});

	it("無程式檔 → test_coverage 滿分", () => {
		const commit = {
			hash: "abc1234567890",
			message: "docs: update README",
			files: ["README.md"],
		};
		const dims = reviewDimensions({ commit, reflection: null, synthesis: null });
		expect(dims.test_coverage.score).toBe(10);
	});
});

describe("buildFindings", () => {
	it("聚合 dimensions actionable + 平均分", () => {
		const commit = { hash: "a1b2c3d4e5f6", message: "feat: x" };
		const dims = {
			a: { score: 10 },
			b: { score: 8, actionable: "do X" },
			c: { score: 6, actionable: "do Y" },
		};
		const f = buildFindings({ commit }, dims);
		expect(f.score).toBe(8);
		expect(f.actionable).toEqual(["do X", "do Y"]);
		expect(f.commit).toBe("a1b2c3d4e5f6");
	});

	it("無 commit → null", () => {
		const f = buildFindings({}, { a: { score: 5 } });
		expect(f.commit).toBeNull();
	});
});

describe("readCommit", () => {
	it("非 git 目錄 → null", () => {
		expect(readCommit(tmpDir)).toBeNull();
	});
});

describe("hasCrossRepoTest (cross-repo 偵測修 false positive)", () => {
	it("hooks/modules/reflect-guard.js → 找到 reflect-guard.test.js", () => {
		expect(hasCrossRepoTest("hooks/modules/reflect-guard.js")).toBe(true);
	});

	it("scripts/review-agent.js → 找到 review-agent.test.js", () => {
		expect(hasCrossRepoTest("scripts/review-agent.js")).toBe(true);
	});

	it("不存在的檔 → false", () => {
		expect(hasCrossRepoTest("hooks/modules/nonexistent-xyz-9999.js")).toBe(false);
	});

	it("支援自訂 testsDir", () => {
		expect(hasCrossRepoTest("a.js", "/nonexistent-dir")).toBe(false);
	});
});

describe("reviewDimensions test_coverage cross-repo 邏輯", () => {
	it("code 檔有 cross-repo test → score 9 不 actionable", () => {
		const commit = {
			hash: "abc1234",
			message: "feat: x " + "x".repeat(50),
			files: ["hooks/modules/reflect-guard.js"],
		};
		const dims = reviewDimensions({ commit, reflection: null, synthesis: null });
		expect(dims.test_coverage.score).toBe(9);
		expect(dims.test_coverage.actionable).toBeUndefined();
		expect(dims.test_coverage.notes).toContain("cross-repo-test=1");
	});

	it("code 檔無 cross-repo test → score 4 + actionable", () => {
		const commit = {
			hash: "abc1234",
			message: "feat: x " + "x".repeat(50),
			files: ["hooks/modules/nonexistent-abcdef.js"],
		};
		const dims = reviewDimensions({ commit, reflection: null, synthesis: null });
		expect(dims.test_coverage.score).toBe(4);
		expect(dims.test_coverage.actionable).toBeTruthy();
	});
});

describe("readTodayReflection / readLatestSynthesis", () => {
	it("reflection 檔不存在 → null", () => {
		expect(readTodayReflection(tmpDir)).toBeNull();
	});

	it("reflection 存在 → 讀到內容", () => {
		const date = new Date().toISOString().slice(0, 10);
		const dir = join(tmpDir, "obsidian/raw/reflections");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${date}.md`), "test content");
		expect(readTodayReflection(tmpDir)).toBe("test content");
	});

	it("synthesis 不存在 → null", () => {
		expect(readLatestSynthesis(tmpDir)).toBeNull();
	});

	it("synthesis 多檔取最新", () => {
		const dir = join(tmpDir, "obsidian/raw/reflections");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "synthesis-001.md"), "v1");
		writeFileSync(join(dir, "synthesis-002.md"), "v2");
		expect(readLatestSynthesis(tmpDir)).toBe("v2");
	});
});
