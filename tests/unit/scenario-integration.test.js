import { describe, expect, test } from "bun:test";
import { homedir } from "os";
import { join } from "path";

// ─── 場景一：無人值守任務執行 ─────────────────────────────────────────────────

const {
	buildPrompt,
	parseStreamJson,
	suggestDepth,
} = await import(join(homedir(), ".claude/scripts/session-spawner.js"));

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
			const { executeTask } = await import(join(homedir(), ".claude/scripts/heartbeat.js"));

			const calls = [];
			const tmpSummary = "/tmp/test-scenario1-summaries.jsonl";

			// 清理
			try {
				const { unlinkSync } = await import("node:fs");
				unlinkSync(tmpSummary);
			} catch (e) { /* cleanup */ }

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

const { forgeSkill } = await import(join(homedir(), ".claude/scripts/skill-forge.js"));
const { checkLifecycle } = await import(join(homedir(), ".claude/scripts/lifecycle-orchestrator.js"));

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
			const mod = await import(join(homedir(), ".claude/scripts/lifecycle-orchestrator.js"));
			expect(typeof mod.checkLifecycle).toBe("function");
		});
	});
});

// ─── 場景三：新領域從零到穩定 ─────────────────────────────────────────────────

const { detectCrossDomain } = await import(join(homedir(), ".claude/scripts/learner.js"));

describe("場景三：跨領域經驗遷移", () => {
	test("相似工具序列被偵測到", () => {
		const newBehavior = {
			id: "youtube-reply",
			pattern: "Read→Grep→Write→Bash",
			polarity: 1,
		};
		const history = [
			{
				id: "trade-alert",
				pattern: "Read→Grep→Write→Bash",
				polarity: 1,
				occurrences: [1, 2, 3],
			},
		];

		// 完全相同 pattern 應該被跳過
		const matches = detectCrossDomain(newBehavior, history);
		expect(matches).toHaveLength(0);
	});

	test("部分重疊的工具序列被偵測（Jaccard + 序列）", () => {
		const newBehavior = {
			id: "youtube-analytics",
			pattern: "Read→Grep→Edit→Bash→Read",
			polarity: 1,
		};
		const history = [
			{
				id: "trade-monitor",
				pattern: "Read→Grep→Edit→Write",
				polarity: 1,
				occurrences: [1, 2],
			},
			{
				id: "unrelated-task",
				pattern: "Agent→Agent→Agent",
				polarity: 1,
				occurrences: [5],
			},
		];

		const matches = detectCrossDomain(newBehavior, history, 0.5);
		expect(matches.length).toBeGreaterThanOrEqual(1);
		expect(matches[0].id).toBe("trade-monitor");
		expect(matches[0].similarity).toBeGreaterThan(0.5);
	});

	test("反模式不被比對", () => {
		const newBehavior = {
			id: "new-pattern",
			pattern: "Read→Write",
			polarity: 1,
		};
		const history = [
			{
				id: "anti-error",
				pattern: "Read→Write",
				polarity: -1,
				occurrences: [1],
			},
		];

		const matches = detectCrossDomain(newBehavior, history);
		expect(matches).toHaveLength(0);
	});

	test("空歷史回傳空", () => {
		expect(detectCrossDomain({ pattern: "A→B" }, [])).toEqual([]);
		expect(detectCrossDomain({ pattern: "A→B" }, null)).toEqual([]);
	});

	test("閾值過濾", () => {
		const newBehavior = { id: "x", pattern: "A→B→C", polarity: 1 };
		const history = [
			{ id: "y", pattern: "A→D→E", polarity: 1, occurrences: [1] },
		];
		// 低相似度不應匹配（只有 A 重疊）
		const matches = detectCrossDomain(newBehavior, history, 0.8);
		expect(matches).toHaveLength(0);
	});
});

// ─── 場景五：一句話永久生效 ─────────────────────────────────────────────────────

const {
	analyzeImpact,
	classifyFile,
} = await import(join(homedir(), ".claude/scripts/impact-analyzer.js"));

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

// ─── 端到端自動化驗證（替代手動驗證）─────────────────────────────────────────

const { poll, executeTask: hbExecuteTask } = await import(join(homedir(), ".claude/scripts/heartbeat.js"));

describe("P2.4 場景一端到端：heartbeat poll → execute → summary", () => {
	test("poll 偵測到待做任務 → claim → 回傳 execute action", async () => {
		const calls = [];
		const tmpState = "/tmp/test-p24-state.json";

		try { (await import("node:fs")).unlinkSync(tmpState); } catch (e) { /* cleanup */ }

		const pollResult = await poll(
			{ _stateFile: tmpState },
			{
				listTasks: async () => [
					{ id: "notion-001", name: "修復 API timeout", priority: "P1" },
				],
				claimTask: async (id) => { calls.push({ action: "claim", id }); },
			},
		);

		expect(pollResult.action).toBe("execute");
		expect(pollResult.task.name).toBe("修復 API timeout");
		expect(calls.some((c) => c.action === "claim")).toBe(true);
	});

	test("execute → complete → summary 全鏈", async () => {
		const calls = [];
		const tmpSummary = "/tmp/test-p24-summaries.jsonl";
		try { (await import("node:fs")).unlinkSync(tmpSummary); } catch (e) { /* cleanup */ }

		const execResult = await hbExecuteTask(
			{ id: "notion-001", name: "修復 API timeout" },
			{ timeout: 5000 },
			{
				spawnSession: () => ({
					ok: true,
					outcome: Promise.resolve({
						exitCode: 0,
						stdout: '{"type":"result","result":"fixed","is_error":false}\n',
						duration: 1000,
					}),
				}),
				completeTask: async (id, msg) => { calls.push({ action: "complete", id, msg }); },
				stateFile: "/tmp/test-p24-exec-state.json",
				summaryFile: tmpSummary,
			},
		);

		expect(execResult.status).toBe("success");
		expect(calls.some((c) => c.action === "complete")).toBe(true);

		const { readFileSync } = await import("node:fs");
		const entry = JSON.parse(readFileSync(tmpSummary, "utf-8").trim());
		expect(entry.source).toBe("heartbeat");
		expect(entry.status).toBe("success");
	});
});

describe("P2.8 場景二端到端：信心達標 → lifecycle 觸發", () => {
	test("behaviors.jsonl 有信心達標候選 → checkLifecycle 嘗試處理", async () => {
		const tmpBehaviors = "/tmp/test-p28-behaviors.jsonl";
		const { writeFileSync, unlinkSync } = await import("node:fs");

		// 種子：信心 0.65 的技能候選
		const seedBehavior = {
			id: "auto-format-code",
			polarity: 1,
			pattern: "Read→Edit→Bash",
			description: "自動格式化程式碼",
			firstSeen: "2026-03-10",
			lastSeen: "2026-03-17",
			occurrences: [1, 2, 3, 4, 5],
			confidence: 0.65,
			suggestion: "建議固化為 Skill",
			type: "skill",
			deployed: false,
		};
		writeFileSync(tmpBehaviors, JSON.stringify(seedBehavior) + "\n");

		// checkLifecycle 用 mock 依賴
		const result = await checkLifecycle({
			behaviorsFile: tmpBehaviors,
			askLocalModel: async () => null, // 本地模型不可用 → graceful degradation
		});

		// 即使模型不可用，也應正常返回（不崩潰）
		expect(typeof result.processed).toBe("number");
		expect(typeof result.deployed).toBe("number");

		try { unlinkSync(tmpBehaviors); } catch (e) { /* cleanup */ }
	});
});

describe("P3.4 場景四端到端：hook error 累積 → 自動建立 Notion 任務", () => {
	test("模擬 5+ hook errors 觸發 createTask", async () => {
		// 驗證 createTask 的 API 結構正確
		const mockErrors = Array.from({ length: 6 }, (_, i) => ({
			ts: new Date().toISOString(),
			event: "PreToolUse:Bash",
			error: "timeout",
			phase: "dispatch",
		}));

		// 統計邏輯（與 maintainer Phase 3c 相同）
		const errorSummary = {};
		for (const e of mockErrors) {
			const key = `${e.event}:${e.phase || "unknown"}`;
			errorSummary[key] = (errorSummary[key] || 0) + 1;
		}
		const topError = Object.entries(errorSummary).sort((a, b) => b[1] - a[1])[0];
		const title = `修復 hook error：${topError[0]}（${mockErrors.length} 次/小時）`;

		// 驗證 createTask 被正確呼叫
		let createdTask = null;
		let p34CallCount = 0;
		await createTask(title, { type: "修復", description: "自動偵測" }, {
			notionFetch: async (_path, _method, body) => {
				p34CallCount++;
				if (p34CallCount === 1) {
					// dedup 查詢回傳空結果
					return { results: [] };
				}
				createdTask = body;
				return { id: "auto-created-123" };
			},
			getConfig: () => ({ database_id: "db-test" }),
		});

		expect(createdTask).not.toBeNull();
		expect(createdTask.properties.Name.title[0].text.content).toContain("hook error");
		expect(createdTask.properties.Status.select.name).toBe("待做");
		expect(createdTask.properties.Created.date.start).toBeTruthy();
	});
});

describe("P4.5 場景三端到端：跨領域行為 → 經驗遷移 → Skill reference", () => {
	test("模擬兩個領域的相似行為模式 → detectCrossDomain 匹配 → forge 加 reference", async () => {
		// 模擬歷史：交易系統的行為
		const tradeHistory = [
			{
				id: "trade-read-analyze-act",
				pattern: "Read→Grep→Edit→Bash→Read",
				polarity: 1,
				occurrences: [1, 2, 3],
				confidence: 0.72,
			},
		];

		// 新領域：YouTube 管理出現類似模式
		const youtubeBehavior = {
			id: "youtube-read-analyze-act",
			pattern: "Read→Grep→Write→Bash→Read",
			polarity: 1,
		};

		// 偵測跨領域匹配
		const matches = detectCrossDomain(youtubeBehavior, tradeHistory, 0.5);
		expect(matches.length).toBeGreaterThanOrEqual(1);
		expect(matches[0].id).toBe("trade-read-analyze-act");

		// 模擬 forge 加 reference
		let writtenContent = "";
		await forgeSkill(
			{
				...youtubeBehavior,
				description: "YouTube 資料分析模式",
				crossDomainMatches: matches,
			},
			{
				askLocalModel: async () => `---
name: youtube-analytics
description: YouTube 資料分析
version: "1.0"
---

# YouTube Analytics

分析 YouTube 資料。

## 知識

- 讀取 API 資料
- 分析趨勢
- 產生報告`,
				existsSync: () => false,
				mkdirSync: () => {},
				writeFileSync: (_path, content) => { writtenContent = content; },
				claudeDir: "/tmp/test-claude-p45",
			},
		);

		// 驗證跨領域參考被寫入
		expect(writtenContent).toContain("跨領域參考");
		expect(writtenContent).toContain("trade-read-analyze-act");
	});
});
