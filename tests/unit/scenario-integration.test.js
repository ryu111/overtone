import { describe, expect, test } from "bun:test";

// ─── 場景一：無人值守任務執行 ─────────────────────────────────────────────────

import {
	buildPrompt,
	parseStreamJson,
	suggestDepth,
} from "/Users/sbu/.claude/scripts/session-spawner.js";

describe("場景一：無人值守", () => {
	describe("suggestDepth — 深度推薦", () => {
		test("安全敏感任務 → D3", () => {
			expect(suggestDepth({ name: "修復 guard 漏洞" }).depth).toBe("D3");
			expect(suggestDepth({ name: "hook security fix" }).depth).toBe("D3");
			expect(suggestDepth({ name: "更新安全策略" }).depth).toBe("D3");
		});

		test("大型重構 → D4", () => {
			expect(suggestDepth({ name: "重構 dispatcher" }).depth).toBe("D4");
			expect(suggestDepth({ name: "refactor pipeline", type: "epic" }).depth).toBe("D4");
		});

		test("Bug fix → D1", () => {
			expect(suggestDepth({ name: "fix timeout 問題", type: "bug" }).depth).toBe("D1");
			expect(suggestDepth({ name: "修復 race condition" }).depth).toBe("D1");
			expect(suggestDepth({ name: "緊急修復", priority: "P0" }).depth).toBe("D1");
		});

		test("一般功能 → D2", () => {
			expect(suggestDepth({ name: "新增 API endpoint" }).depth).toBe("D2");
			expect(suggestDepth({ name: "建立報表功能" }).depth).toBe("D2");
		});
	});

	describe("buildPrompt — 提示組裝", () => {
		test("包含任務資訊和深度建議", () => {
			const prompt = buildPrompt({
				name: "修復 guard 漏洞",
				priority: "P1",
				type: "bug",
				scope: "R1.1",
			});
			expect(prompt).toContain("修復 guard 漏洞");
			expect(prompt).toContain("P1");
			expect(prompt).toContain("D3"); // 安全敏感
			expect(prompt).toContain("無人值守模式");
			expect(prompt).toContain("planner");
		});

		test("無名稱任務有 fallback", () => {
			const prompt = buildPrompt({});
			expect(prompt).toContain("（無名稱）");
			expect(prompt).toContain("未指定");
		});

		test("包含執行規則", () => {
			const prompt = buildPrompt({ name: "test task" });
			expect(prompt).toContain("bun test");
			expect(prompt).toContain("Commit");
			expect(prompt).toContain("heartbeat-blocked");
		});
	});

	describe("parseStreamJson — 結果解析", () => {
		test("解析成功結果", () => {
			const stdout = '{"type":"result","result":"done","is_error":false}\n';
			const parsed = parseStreamJson(stdout);
			expect(parsed.success).toBe(true);
			expect(parsed.result).toBe("done");
		});

		test("解析錯誤結果", () => {
			const stdout = '{"type":"error","error":"execution failed"}\n';
			const parsed = parseStreamJson(stdout);
			expect(parsed.success).toBe(false);
			expect(parsed.error).toBe("execution failed");
		});

		test("空輸出", () => {
			const parsed = parseStreamJson("");
			expect(parsed.success).toBe(false);
		});
	});

	describe("heartbeat → session 完整鏈", () => {
		test("mock 全鏈：poll → claim → spawn → complete → summary", async () => {
			const { executeTask } = await import(
				"/Users/sbu/.claude/scripts/heartbeat.js"
			);

			const calls = [];
			const tmpSummary = "/tmp/test-scenario1-summaries.jsonl";

			// 清理
			try {
				const { unlinkSync } = await import("node:fs");
				unlinkSync(tmpSummary);
			} catch {}

			const result = await executeTask(
				{ id: "test-123", name: "測試任務" },
				{ timeout: 5000 },
				{
					spawnSession: () => ({
						ok: true,
						outcome: Promise.resolve({
							exitCode: 0,
							stdout: '{"type":"result","result":"task done","is_error":false}\n',
							duration: 1000,
						}),
					}),
					completeTask: async (id, msg) => {
						calls.push({ action: "complete", id, msg });
					},
					stateFile: "/tmp/test-scenario1-state.json",
					summaryFile: tmpSummary,
				},
			);

			expect(result.status).toBe("success");
			expect(calls).toHaveLength(1);
			expect(calls[0].action).toBe("complete");

			// 驗證 summary 寫入
			const { readFileSync } = await import("node:fs");
			const summary = readFileSync(tmpSummary, "utf-8").trim();
			const entry = JSON.parse(summary);
			expect(entry.source).toBe("heartbeat");
			expect(entry.task).toBe("測試任務");
			expect(entry.status).toBe("success");
		});
	});
});

// ─── 場景二：能力自動生長 ─────────────────────────────────────────────────────

import { forgeSkill } from "/Users/sbu/.claude/scripts/skill-forge.js";
import { checkLifecycle } from "/Users/sbu/.claude/scripts/lifecycle-orchestrator.js";

describe("場景二：能力自動生長", () => {
	describe("forge → judge → deploy 鏈", () => {
		test("forgeSkill 需要本地模型（mock）", async () => {
			const behavior = {
				id: "test-pattern",
				description: "重複的程式碼格式化模式",
				confidence: 0.72,
				frequency: 5,
			};

			const skillContent = `---
name: auto-format
description: 自動格式化程式碼
version: "1.0"
---

# Auto Format

自動偵測並格式化程式碼。

## 知識

- 使用 biome 進行格式化
- 保留 import 順序
- 檢查 dead imports
- 修復 lint warnings`;

			const result = await forgeSkill(behavior, {
				askLocalModel: async () => skillContent,
				existsSync: () => false,
				mkdirSync: () => {},
				writeFileSync: () => {},
				claudeDir: "/tmp/test-claude",
			});

			expect(result.ok).toBe(true);
		});

		test("checkLifecycle 無候選時快速返回", async () => {
			const result = await checkLifecycle({
				behaviorsFile: "/tmp/nonexistent-behaviors.jsonl",
			});
			expect(result.processed).toBe(0);
			expect(result.deployed).toBe(0);
		});
	});

	describe("maintainer 觸發 lifecycle 驗證", () => {
		test("Phase 3b checkLifecycle 路徑存在", async () => {
			// 驗證 lifecycle-orchestrator.js 可以被 import
			const mod = await import(
				"/Users/sbu/.claude/scripts/lifecycle-orchestrator.js"
			);
			expect(typeof mod.checkLifecycle).toBe("function");
		});
	});
});

// ─── 場景四：自我修復（前置驗證）───────────────────────────────────────────────

import { parsePage } from "/Users/sbu/.claude/scripts/notion-tasks.js";

describe("場景四前置：Notion 任務結構", () => {
	test("parsePage 提取必要欄位", () => {
		const page = {
			id: "abc-123",
			properties: {
				Name: { title: [{ plain_text: "修復 timeout 問題" }] },
				Status: { select: { name: "待做" } },
				Priority: { select: { name: "P1" } },
				Type: { select: { name: "bug" } },
			},
		};
		const parsed = parsePage(page);
		expect(parsed.name).toBe("修復 timeout 問題");
		expect(parsed.status).toBe("待做");
		expect(parsed.priority).toBe("P1");
		expect(parsed.type).toBe("bug");
	});
});

// ─── 場景五：一句話永久生效 ─────────────────────────────────────────────────────

import {
	analyzeImpact,
	classifyFile,
} from "/Users/sbu/.claude/scripts/impact-analyzer.js";

describe("場景五：影響分析端到端", () => {
	test("分析 commit 規則變更，找到 rule + script", () => {
		const result = analyzeImpact("commit message 規範", {
			execSync: (cmd) => {
				if (cmd.includes("commit")) {
					return "/mock/rules/commit-規範.md:3:commit format\n/mock/scripts/maintainer.js:50:commit message\n";
				}
				if (cmd.includes("message")) {
					return "/mock/scripts/maintainer.js:50:commit message\n";
				}
				if (cmd.includes("規範")) {
					return "/mock/rules/commit-規範.md:3:commit 規範\n/mock/rules/寫作規範.md:10:寫作規範\n";
				}
				return "";
			},
			existsSync: () => true,
			searchDirs: ["/mock"],
		});

		expect(result.impacts.length).toBeGreaterThan(0);
		// 應該找到 rule 和 script
		const types = result.impacts.map((i) => i.type);
		expect(types).toContain("rule");
		expect(types).toContain("script");
	});

	test("classifyFile 正確分類 maintainer", () => {
		expect(classifyFile("/home/.claude/scripts/maintainer.js")).toBe("script");
	});
});
