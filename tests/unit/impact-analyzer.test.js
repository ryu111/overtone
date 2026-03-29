import { describe, expect, test } from "bun:test";
import { homedir } from 'os';
import { join } from 'path';

const {
	analyzeImpact,
	classifyFile,
	extractKeywords,
	formatReport,
	groupByFile,
	searchImpacts,
	verifyConsistency,
} = await import(join(homedir(), '.claude/scripts/impact-analyzer.js'));

describe("extractKeywords", () => {
	test("提取中英文關鍵詞", () => {
		const keywords = extractKeywords("commit message 改用中文");
		expect(keywords).toContain("commit");
		expect(keywords).toContain("message");
		// 中文用 bigram 拆分：改用、用中、中文
		expect(keywords).toContain("中文");
		expect(keywords).toContain("改用");
	});

	test("過濾通用停用詞", () => {
		const keywords = extractKeywords("以後 所有 commit 必須 使用 中文");
		// 英文停用詞過濾
		expect(keywords).toContain("commit");
		// 中文停用詞過濾（以後、所有、必須、使用 都是停用詞）
		expect(keywords).toContain("中文");
	});

	test("空值回傳空陣列", () => {
		expect(extractKeywords("")).toEqual([]);
		expect(extractKeywords(null)).toEqual([]);
		expect(extractKeywords(undefined)).toEqual([]);
	});

	test("移除標點符號", () => {
		const keywords = extractKeywords("「commit」改成（中文）");
		expect(keywords).toContain("commit");
		expect(keywords).toContain("改成");
		expect(keywords).toContain("中文");
	});

	test("過濾短 token（< 2 字元）", () => {
		const keywords = extractKeywords("a b commit x 中文");
		expect(keywords).not.toContain("a");
		expect(keywords).not.toContain("b");
		expect(keywords).not.toContain("x");
		expect(keywords).toContain("commit");
	});
});

describe("searchImpacts", () => {
	test("用 mock execSync 搜尋", () => {
		const mockExec = (cmd) => {
			if (cmd.includes("commit")) {
				return "/mock/rules/commit.md:5:commit message 規範\n/mock/scripts/main.js:10:generate commit\n";
			}
			return "";
		};
		const results = searchImpacts(["commit"], {
			execSync: mockExec,
			existsSync: () => true,
			searchDirs: ["/mock"],
		});
		expect(results).toHaveLength(2);
		expect(results[0].file).toBe("/mock/rules/commit.md");
		expect(results[0].keyword).toBe("commit");
		expect(results[0].line).toBe(5);
	});

	test("排除 node_modules 和 .git", () => {
		const mockExec = () =>
			"/mock/node_modules/pkg/index.js:1:commit\n/mock/.git/config:1:commit\n/mock/src/main.js:5:commit msg\n";
		const results = searchImpacts(["commit"], {
			execSync: mockExec,
			existsSync: () => true,
			searchDirs: ["/mock"],
		});
		expect(results).toHaveLength(1);
		expect(results[0].file).toBe("/mock/src/main.js");
	});

	test("排除自身（impact-analyzer.js）", () => {
		const mockExec = () =>
			"/mock/scripts/impact-analyzer.js:10:commit\n/mock/scripts/main.js:5:commit\n";
		const results = searchImpacts(["commit"], {
			execSync: mockExec,
			existsSync: () => true,
			searchDirs: ["/mock"],
		});
		expect(results).toHaveLength(1);
		expect(results[0].file).toBe("/mock/scripts/main.js");
	});

	test("grep 無結果時回傳空陣列", () => {
		const mockExec = () => {
			const err = new Error("exit code 1");
			throw err;
		};
		const results = searchImpacts(["不存在的關鍵詞"], {
			execSync: mockExec,
			existsSync: () => true,
			searchDirs: ["/mock"],
		});
		expect(results).toEqual([]);
	});
});

describe("groupByFile", () => {
	test("同檔案多次命中合併", () => {
		const impacts = [
			{ file: "/a.js", keyword: "commit", line: 5, content: "line 5" },
			{ file: "/a.js", keyword: "message", line: 10, content: "line 10" },
			{ file: "/b.js", keyword: "commit", line: 3, content: "line 3" },
		];
		const grouped = groupByFile(impacts);
		expect(grouped).toHaveLength(2);
		expect(grouped[0].file).toBe("/a.js"); // 2 hits, sorted first
		expect(grouped[0].hits).toBe(2);
		expect(grouped[0].keywords).toContain("commit");
		expect(grouped[0].keywords).toContain("message");
		expect(grouped[1].file).toBe("/b.js");
		expect(grouped[1].hits).toBe(1);
	});

	test("空輸入回傳空陣列", () => {
		expect(groupByFile([])).toEqual([]);
	});
});

describe("classifyFile", () => {
	test("正確分類各類型", () => {
		expect(classifyFile("/home/.claude/rules/commit.md")).toBe("rule");
		expect(classifyFile("/home/.claude/scripts/main.js")).toBe("script");
		expect(classifyFile("/home/.claude/agents/planner.md")).toBe("agent");
		expect(classifyFile("/home/.claude/skills/auto/SKILL.md")).toBe("skill");
		expect(classifyFile("/home/.claude/hooks/server.js")).toBe("hook");
		expect(classifyFile("/home/projects/tests/unit/x.test.js")).toBe("test");
		expect(classifyFile("/home/.claude/settings.json")).toBe("config");
		expect(classifyFile("/home/projects/docs/readme.md")).toBe("doc");
	});
});

describe("analyzeImpact", () => {
	test("完整流程：關鍵詞 → 搜尋 → 分群 → 分類", () => {
		const mockExec = (cmd) => {
			if (cmd.includes("commit")) {
				return "/mock/rules/寫作規範.md:3:commit message 格式\n/mock/scripts/maintainer.js:100:generate commit message\n";
			}
			if (cmd.includes("message")) {
				return "/mock/rules/寫作規範.md:3:commit message 格式\n/mock/scripts/maintainer.js:100:generate commit message\n/mock/scripts/maintainer.js:200:message template\n";
			}
			if (cmd.includes("中文")) {
				return "/mock/rules/語言設定.md:5:全部中文\n";
			}
			return "";
		};

		const result = analyzeImpact("commit message 改用中文", {
			execSync: mockExec,
			existsSync: () => true,
			searchDirs: ["/mock"],
		});

		expect(result.keywords.length).toBeGreaterThanOrEqual(2);
		expect(result.impacts.length).toBeGreaterThan(0);
		expect(result.summary.total).toBeGreaterThan(0);

		// maintainer.js 應該有最多 hits
		const maintainer = result.impacts.find((i) =>
			i.file.includes("maintainer"),
		);
		expect(maintainer).toBeDefined();
		expect(maintainer.type).toBe("script");
	});

	test("無關鍵詞時回傳空結果", () => {
		const result = analyzeImpact("", { execSync: () => "" });
		expect(result.keywords).toEqual([]);
		expect(result.impacts).toEqual([]);
		expect(result.summary.total).toBe(0);
	});
});

describe("formatReport", () => {
	test("無影響時顯示提示", () => {
		const report = formatReport({
			keywords: ["不存在"],
			impacts: [],
			summary: { total: 0, byType: {} },
		});
		expect(report).toContain("無影響");
	});

	test("有影響時顯示結構化報告", () => {
		const report = formatReport({
			keywords: ["commit", "message"],
			impacts: [
				{
					file: "/home/.claude/rules/寫作規範.md",
					hits: 2,
					keywords: ["commit", "message"],
					lines: [
						{ line: 3, content: "commit message 格式", keyword: "commit" },
					],
					type: "rule",
				},
				{
					file: "/home/.claude/scripts/maintainer.js",
					hits: 3,
					keywords: ["commit", "message"],
					lines: [
						{
							line: 100,
							content: "generate commit message",
							keyword: "commit",
						},
					],
					type: "script",
				},
			],
			summary: { total: 2, byType: { rule: 1, script: 1 } },
		});
		expect(report).toContain("影響分析報告");
		expect(report).toContain("2 個檔案");
		expect(report).toContain("rule");
		expect(report).toContain("script");
	});
});

describe("verifyConsistency", () => {
	test("舊值已完全清除 → consistent: true", () => {
		const result = verifyConsistency("old-pattern", "new-pattern", {
			execSync: (cmd) => {
				if (cmd.includes("old-pattern")) throw new Error("no match");
				if (cmd.includes("new-pattern"))
					return "/mock/rules/a.md:5:new-pattern used\n";
				return "";
			},
			existsSync: () => true,
			searchDirs: ["/mock"],
		});

		expect(result.consistent).toBe(true);
		expect(result.remaining).toBe(0);
	});

	test("舊值仍殘留 → consistent: false + 列出檔案", () => {
		const result = verifyConsistency("old-value", "new-value", {
			execSync: (cmd) => {
				if (cmd.includes("old-value"))
					return "/mock/scripts/a.js:10:still has old-value\n/mock/rules/b.md:3:old-value here\n";
				if (cmd.includes("new-value"))
					return "/mock/rules/b.md:3:now has new-value\n";
				return "";
			},
			existsSync: () => true,
			searchDirs: ["/mock"],
		});

		expect(result.consistent).toBe(false);
		expect(result.remaining).toBe(2);
		expect(result.files).toContain("/mock/scripts/a.js");
	});

	test("空 oldValue → 直接返回 consistent", () => {
		const result = verifyConsistency("", "new");
		expect(result.consistent).toBe(true);
	});
});
