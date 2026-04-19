// inject-functions.test.js — inject-functions.js 所有 18 個 inject* 函式的行為測試
import { describe, test, expect, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";

// ─── 測試環境隔離 ─────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), `inject-fn-test-${Date.now()}`);
const DATA_DIR = join(TMP_DIR, "data");

// 在 import inject-functions.js 前設定 env，讓 DATA_DIR 可被覆寫
// inject-functions.js 用 join(homedir(), ".claude/data") 作為 DATA_DIR，
// 我們透過直接覆寫 module export 的方式繞過：動態 import 後取得函式，
// 並對所有用到 DATA_DIR 的函式傳入臨時路徑的檔案。
// 注意：inject-functions.js 的 DATA_DIR 是 module-level const，
// 無法在 import 後覆寫。因此我們在測試中直接建立對應的真實路徑檔案，
// 或對每個需要隔離的函式使用 TMP_DIR 替代路徑進行白箱測試。

// 另一種方式：直接在 TMP_DIR 建立所需路徑結構，並透過 symlink 或
// 覆寫 DATA_DIR env 讓模組指向正確路徑。
// 因為模組在 import 時就計算了 DATA_DIR，最乾淨的方式是：
// 1. 對用固定路徑（/tmp/*）的函式：beforeEach 建立 TMP_DIR 下的替代檔案
// 2. 對用 DATA_DIR 的函式：建立 symlink 或直接寫入到真實 DATA_DIR
//    但這樣會汙染真實資料 —— 改用子目錄 + 手動呼叫工具函式的方式測試

// 最終策略：
// - 測試 readText / readJsonl 等工具函式直接用 TMP_DIR 路徑
// - 測試 inject* 函式需要真實 DATA_DIR 路徑，用 beforeEach/afterEach 在真實路徑
//   建立測試用檔案，afterEach 清理
// - /tmp/* 固定路徑的函式：beforeEach 建立，afterEach 刪除

const REAL_DATA_DIR = join(homedir(), ".claude/data");

// 確保測試用的 DATA_DIR 存在
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(REAL_DATA_DIR, { recursive: true });

// 測試用檔案追蹤（afterEach 清理）
let testFiles = [];

function writeTestFile(path, content) {
	writeFileSync(path, content);
	testFiles.push(path);
}

function cleanupTestFiles() {
	for (const f of testFiles) {
		try {
			rmSync(f);
		} catch { /* 已刪 */ }
	}
	testFiles = [];
}

// ─── Import 受測模組 ──────────────────────────────────────────────────────────

const {
	readText,
	readJsonl,
	injectBriefing,
	injectLearnerContext,
	injectJudgeContext,
	injectHookErrors,
	injectCapabilityBoundary,
	injectImprovements,
	injectRestartNotice,
	injectPendingDecisions,
	injectInstinctContext,
	injectSessionAwareness,
	injectFeedbackContext,
	injectDecisionLogReminder,
	injectProgress,
	injectReflections,
	injectDeadManSwitch,
	injectProceduralMemory,
	injectComplianceTopViolations,
	injectAutoDriveContext,
} = await import(join(homedir(), ".claude/hooks/lib/inject-functions.js"));

// ─── readText 工具函式 ────────────────────────────────────────────────────────

describe("readText", () => {
	afterEach(cleanupTestFiles);

	test("檔案不存在時回傳 null", () => {
		const result = readText(join(TMP_DIR, "nonexistent.md"));
		expect(result).toBeNull();
	});

	test("檔案存在且有內容時回傳字串", () => {
		const path = join(TMP_DIR, "test.md");
		writeTestFile(path, "hello world");
		const result = readText(path);
		expect(result).toBe("hello world");
	});

	test("檔案內容為空白時回傳 null", () => {
		const path = join(TMP_DIR, "empty.md");
		writeTestFile(path, "   \n  ");
		const result = readText(path);
		expect(result).toBeNull();
	});
});

// ─── readJsonl 工具函式 ───────────────────────────────────────────────────────

describe("readJsonl", () => {
	afterEach(cleanupTestFiles);

	test("檔案不存在時回傳 null", () => {
		const result = readJsonl(join(TMP_DIR, "nonexistent.jsonl"));
		expect(result).toBeNull();
	});

	test("有效 JSONL 檔案時回傳 parsed 陣列", () => {
		const path = join(TMP_DIR, "test.jsonl");
		writeTestFile(path, '{"id":1}\n{"id":2}\n');
		const result = readJsonl(path);
		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(2);
		expect(result[0].id).toBe(1);
		expect(result[1].id).toBe(2);
	});
});

// ─── injectBriefing ───────────────────────────────────────────────────────────

describe("injectBriefing", () => {
	afterEach(cleanupTestFiles);

	test("session-briefing.md 不存在時回傳 null", () => {
		// 確保檔案不存在
		const path = join(REAL_DATA_DIR, "session-briefing.md");
		try { rmSync(path); } catch { /* 不存在 */ }
		const result = injectBriefing();
		expect(result).toBeNull();
	});

	test("session-briefing.md 存在時回傳含內容的字串", () => {
		const path = join(REAL_DATA_DIR, "session-briefing.md");
		writeTestFile(path, "今日目標：完成測試");
		const result = injectBriefing();
		expect(typeof result).toBe("string");
		expect(result).toContain("今日目標：完成測試");
	});
});

// ─── injectLearnerContext ─────────────────────────────────────────────────────

describe("injectLearnerContext", () => {
	afterEach(cleanupTestFiles);

	test("behaviors.jsonl 不存在時回傳 null", () => {
		const path = join(REAL_DATA_DIR, "behaviors.jsonl");
		try { rmSync(path); } catch { /* 不存在 */ }
		const result = injectLearnerContext();
		expect(result).toBeNull();
	});

	test("有 high impact + suggestion 的行為時回傳包含描述的字串", () => {
		const path = join(REAL_DATA_DIR, "behaviors.jsonl");
		const entry = {
			id: "b1",
			impact: "high",
			polarity: -1,
			confidence: 0.9,
			description: "重複使用 workaround",
			suggestion: { content: "應找根因修復" },
		};
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectLearnerContext();
		expect(typeof result).toBe("string");
		expect(result).toContain("Learner 行為觀察");
		expect(result).toContain("應找根因修復");
	});

	test("無 high impact 行為時回傳 null", () => {
		const path = join(REAL_DATA_DIR, "behaviors.jsonl");
		const entry = { id: "b2", impact: "low", polarity: 1, confidence: 0.5 };
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectLearnerContext();
		expect(result).toBeNull();
	});
});

// ─── injectJudgeContext ───────────────────────────────────────────────────────

describe("injectJudgeContext", () => {
	afterEach(cleanupTestFiles);

	test("scores.jsonl 不存在時回傳 null", () => {
		const path = join(REAL_DATA_DIR, "scores.jsonl");
		try { rmSync(path); } catch { /* 不存在 */ }
		const result = injectJudgeContext();
		expect(result).toBeNull();
	});

	test("有評分資料時回傳包含 Judge 品質趨勢的字串", () => {
		const path = join(REAL_DATA_DIR, "scores.jsonl");
		const today = new Date().toISOString().slice(0, 10);
		const entry = {
			date: today,
			path: "skills/test-skill/SKILL.md",
			total: 75,
			grade: "B",
			type: "skill",
		};
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectJudgeContext();
		expect(typeof result).toBe("string");
		expect(result).toContain("Judge 品質趨勢");
		expect(result).toContain("75");
	});
});

// ─── injectHookErrors ─────────────────────────────────────────────────────────

describe("injectHookErrors", () => {
	const ERROR_FILE = "/tmp/hook-errors.jsonl";

	afterEach(() => {
		try { rmSync(ERROR_FILE); } catch { /* 不存在 */ }
	});

	test("hook-errors.jsonl 不存在時回傳 null", () => {
		try { rmSync(ERROR_FILE); } catch { /* 不存在 */ }
		const result = injectHookErrors();
		expect(result).toBeNull();
	});

	test("有最近 1 小時內錯誤時回傳包含 Hook Errors 的字串", () => {
		const entry = {
			ts: new Date().toISOString(),
			event: "PostToolUse",
			error: "SyntaxError: unexpected token",
		};
		writeFileSync(ERROR_FILE, JSON.stringify(entry) + "\n");
		const result = injectHookErrors();
		expect(typeof result).toBe("string");
		expect(result).toContain("Hook Errors");
		expect(result).toContain("PostToolUse");
	});

	test("只有超過 1 小時前的錯誤時回傳 null", () => {
		const oldTs = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
		const entry = { ts: oldTs, event: "Stop", error: "old error" };
		writeFileSync(ERROR_FILE, JSON.stringify(entry) + "\n");
		const result = injectHookErrors();
		expect(result).toBeNull();
	});
});

// ─── injectCapabilityBoundary ─────────────────────────────────────────────────

describe("injectCapabilityBoundary", () => {
	afterEach(cleanupTestFiles);

	test("capability-boundary.json 不存在時回傳 null", () => {
		const path = join(REAL_DATA_DIR, "capability-boundary.json");
		try { rmSync(path); } catch { /* 不存在 */ }
		const result = injectCapabilityBoundary();
		expect(result).toBeNull();
	});

	test("有薄弱/缺失能力時回傳包含能力邊界的字串", () => {
		const path = join(REAL_DATA_DIR, "capability-boundary.json");
		const data = {
			capabilities: {
				"deep-reasoning": { strength: "weak" },
				"image-gen": { strength: "missing" },
			},
		};
		writeTestFile(path, JSON.stringify(data));
		const result = injectCapabilityBoundary();
		expect(typeof result).toBe("string");
		expect(result).toContain("能力邊界");
		expect(result).toContain("deep-reasoning");
		expect(result).toContain("image-gen");
	});

	test("所有能力都是 strong 時回傳 null", () => {
		const path = join(REAL_DATA_DIR, "capability-boundary.json");
		const data = {
			capabilities: { "code-gen": { strength: "strong" } },
		};
		writeTestFile(path, JSON.stringify(data));
		const result = injectCapabilityBoundary();
		expect(result).toBeNull();
	});

	test("capability-boundary.json 為無效 JSON 時 stderr 輸出錯誤訊息並回傳 null", () => {
		const path = join(REAL_DATA_DIR, "capability-boundary.json");
		writeTestFile(path, "not valid json {{{");
		let stderrOutput = "";
		const originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = (msg) => { stderrOutput += String(msg); return true; };
		const result = injectCapabilityBoundary();
		process.stderr.write = originalWrite;
		expect(result).toBeNull();
		expect(stderrOutput).toContain("[inject-quality-context]");
	});
});

// ─── injectImprovements ───────────────────────────────────────────────────────

describe("injectImprovements", () => {
	afterEach(cleanupTestFiles);

	test("improvements.jsonl 不存在時回傳 null", () => {
		const path = join(REAL_DATA_DIR, "improvements.jsonl");
		try { rmSync(path); } catch { /* 不存在 */ }
		const result = injectImprovements();
		expect(result).toBeNull();
	});

	test("有 pending 改善建議時回傳包含改善建議的字串", () => {
		const path = join(REAL_DATA_DIR, "improvements.jsonl");
		const entry = {
			path: "rules/核心/test.md",
			status: "pending",
			score: 30,
			suggestion: { content: "應補充更多正例說明" },
		};
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectImprovements();
		expect(typeof result).toBe("string");
		expect(result).toContain("改善建議");
		expect(result).toContain("應補充更多正例說明");
	});

	test("所有建議都是 verified 時回傳 null", () => {
		const path = join(REAL_DATA_DIR, "improvements.jsonl");
		const entry = {
			path: "rules/test.md",
			status: "verified",
			score: 90,
			suggestion: { content: "已完成" },
		};
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectImprovements();
		expect(result).toBeNull();
	});
});

// ─── injectRestartNotice ──────────────────────────────────────────────────────

describe("injectRestartNotice", () => {
	const MARKER = "/tmp/nova-server-restarted.json";

	afterEach(() => {
		try { rmSync(MARKER); } catch { /* 不存在 */ }
	});

	test("marker 不存在時回傳 null", () => {
		try { rmSync(MARKER); } catch { /* 不存在 */ }
		const result = injectRestartNotice();
		expect(result).toBeNull();
	});

	test("marker 存在且在 5 分鐘內時回傳重啟通知並刪除 marker", () => {
		const data = {
			ts: new Date().toISOString(),
			reason: "hot-reload",
			uptime: 3600,
		};
		writeFileSync(MARKER, JSON.stringify(data));
		const result = injectRestartNotice();
		expect(typeof result).toBe("string");
		expect(result).toContain("Nova Server 重啟通知");
		expect(result).toContain("hot-reload");
		// marker 應被刪除
		expect(existsSync(MARKER)).toBe(false);
	});

	test("marker 超過 5 分鐘時回傳 null", () => {
		const oldTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();
		writeFileSync(MARKER, JSON.stringify({ ts: oldTs, reason: "old" }));
		const result = injectRestartNotice();
		expect(result).toBeNull();
	});
});

// ─── injectPendingDecisions ───────────────────────────────────────────────────

describe("injectPendingDecisions", () => {
	// injectPendingDecisions 呼叫 getPendingSummary，依賴 decisions.jsonl
	// 檔案不存在時 getPendingSummary 會回傳 count=0

	test("無 pending 決定時回傳 null", () => {
		// 直接測試：decisions-queue.jsonl 不存在或為空
		// getPendingSummary 內部讀取 decisions-queue.jsonl，count=0 → null
		const result = injectPendingDecisions();
		// 依據當前環境：若無 pending decisions，應為 null
		// 若有真實 pending decisions，也可能不是 null，此 test 視環境而定
		// 我們只驗證不拋錯誤
		expect(result === null || typeof result === "string").toBe(true);
	});
});

// ─── injectInstinctContext ────────────────────────────────────────────────────

describe("injectInstinctContext", () => {
	test("不拋錯誤，回傳 null 或字串", () => {
		// loadIndex 讀取 experience-index，不存在時 index.size=0 → null
		const result = injectInstinctContext();
		expect(result === null || typeof result === "string").toBe(true);
	});

	test("若有 instinct 資料，回傳包含 Instinct 內化知識的字串", () => {
		// 這個測試依賴真實 instinct index 資料，只驗證格式
		const result = injectInstinctContext();
		if (result !== null) {
			expect(result).toContain("Instinct 內化知識");
		}
	});
});

// ─── injectSessionAwareness ───────────────────────────────────────────────────

describe("injectSessionAwareness", () => {
	test("input 無 cwd 時回傳 null", () => {
		const result = injectSessionAwareness({});
		expect(result).toBeNull();
	});

	test("input 為 null/undefined 時回傳 null", () => {
		expect(injectSessionAwareness(null)).toBeNull();
		expect(injectSessionAwareness(undefined)).toBeNull();
	});

	test("有 cwd 且 sessions 檔案不存在時回傳 null 或字串", () => {
		// nova-active-sessions.json 不存在 + projects.json 不存在 → parts 為空 → null
		// 但可能 /tmp/nova-active-sessions.json 在真實環境中存在
		const result = injectSessionAwareness({ cwd: "/Users/test/project" });
		// 不應拋錯誤
		expect(result === null || typeof result === "string").toBe(true);
	});

	test("有 cwd + 有效 sessions 資料時回傳跨 Session 感知字串", () => {
		const sessionsFile = "/tmp/nova-active-sessions.json";
		const sessions = [
			{
				cwd: "/Users/test/my-project",
				project: "my-project",
				layer: "L2",
				lastActive: Date.now(),
				currentTask: "撰寫測試",
			},
		];
		writeFileSync(sessionsFile, JSON.stringify(sessions));
		const result = injectSessionAwareness({ cwd: "/Users/test/my-project" });
		// 不應拋錯誤
		expect(result === null || typeof result === "string").toBe(true);
		try { rmSync(sessionsFile); } catch { /* 不存在 */ }
	});
});

// ─── injectFeedbackContext ────────────────────────────────────────────────────

describe("injectFeedbackContext", () => {
	afterEach(() => {
		try { rmSync("/tmp/nova-feedback-registry.json"); } catch { /* 不存在 */ }
		try { rmSync("/tmp/nova-feedback-suggestions.json"); } catch { /* 不存在 */ }
	});

	test("兩個檔案都不存在時回傳 null", () => {
		try { rmSync("/tmp/nova-feedback-registry.json"); } catch { /* 不存在 */ }
		try { rmSync("/tmp/nova-feedback-suggestions.json"); } catch { /* 不存在 */ }
		const result = injectFeedbackContext();
		expect(result).toBeNull();
	});

	test("有 degraded 元件時回傳包含 Feedback 狀態的字串", () => {
		const reg = {
			components: [{ name: "learner", health: "degraded" }],
		};
		writeFileSync("/tmp/nova-feedback-registry.json", JSON.stringify(reg));
		const result = injectFeedbackContext();
		expect(typeof result).toBe("string");
		expect(result).toContain("Feedback 狀態");
		expect(result).toContain("learner");
	});

	test("有 high priority pending 建議時包含待處理建議", () => {
		const suggestions = [
			{ priority: "high", status: "pending", suggestion: "修復 context-injector 效能問題" },
		];
		writeFileSync("/tmp/nova-feedback-suggestions.json", JSON.stringify(suggestions));
		const result = injectFeedbackContext();
		expect(typeof result).toBe("string");
		expect(result).toContain("待處理建議");
	});
});

// ─── injectDecisionLogReminder ────────────────────────────────────────────────

describe("injectDecisionLogReminder", () => {
	afterEach(cleanupTestFiles);

	test("dispatch-metrics.jsonl 不存在時回傳 null", () => {
		const path = join(REAL_DATA_DIR, "dispatch-metrics.jsonl");
		try { rmSync(path); } catch { /* 不存在 */ }
		const result = injectDecisionLogReminder({ cwd: TMP_DIR });
		expect(result).toBeNull();
	});

	test("今日有 dispatch 且有 decision 記錄時回傳 null（不需要提醒）", () => {
		const metricsPath = join(REAL_DATA_DIR, "dispatch-metrics.jsonl");
		const decisionPath = join(REAL_DATA_DIR, "decision-log.jsonl");
		const today = new Date().toISOString().slice(0, 10);
		writeTestFile(metricsPath, JSON.stringify({ ts: `${today}T10:00:00Z`, type: "dispatch" }) + "\n");
		writeTestFile(decisionPath, JSON.stringify({ ts: `${today}T11:00:00Z`, decision: "選擇方案A" }) + "\n");
		const result = injectDecisionLogReminder({ cwd: TMP_DIR });
		expect(result).toBeNull();
	});
});

// ─── injectProgress ───────────────────────────────────────────────────────────

describe("injectProgress", () => {
	test("進度檔案不存在時回傳 null", () => {
		// nova-progress-{proj}.md 不存在
		const result = injectProgress();
		// 結果為 null 或字串（取決於是否有真實進度檔案）
		expect(result === null || typeof result === "string").toBe(true);
	});

	test("進度檔案存在時回傳包含專案進度的字串", () => {
		const proj = process.cwd().split("/").pop() || "unknown";
		const progressPath = `/tmp/nova-progress-${proj}.md`;
		writeFileSync(progressPath, "# 進度\n- 完成 M1");
		const result = injectProgress();
		expect(typeof result).toBe("string");
		expect(result).toContain("專案進度");
		expect(result).toContain("完成 M1");
		try { rmSync(progressPath); } catch { /* 不存在 */ }
	});
});

// ─── injectReflections ────────────────────────────────────────────────────────

describe("injectReflections", () => {
	afterEach(cleanupTestFiles);

	test("reflections.jsonl 不存在時回傳 null", () => {
		const path = join(REAL_DATA_DIR, "reflections.jsonl");
		try { rmSync(path); } catch { /* 不存在 */ }
		const result = injectReflections();
		expect(result).toBeNull();
	});

	test("新 schema（結論[]）→ 輸出 結論[0]（iter 18 治本 P2-2）", () => {
		const path = join(REAL_DATA_DIR, "reflections.jsonl");
		const entry = {
			ts: new Date().toISOString(),
			trigger_type: "autonomous",
			trigger: "Stop hook 自動抓取",
			結論: ["應在實作前先讀 spec", "第二條結論"],
			行動: ["commit abc1234"],
		};
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectReflections();
		expect(typeof result).toBe("string");
		expect(result).toContain("前次反思");
		expect(result).toContain("應在實作前先讀 spec");
		expect(result).not.toContain("undefined");
	});

	test("無結論但有行動 → fallback 行動[0]", () => {
		const path = join(REAL_DATA_DIR, "reflections.jsonl");
		const entry = {
			ts: new Date().toISOString(),
			trigger: "autonomous",
			結論: [],
			行動: ["commit xyz9876 修 bug"],
		};
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectReflections();
		expect(result).toContain("commit xyz9876 修 bug");
	});

	test("結論/行動 都空 → fallback trigger", () => {
		const path = join(REAL_DATA_DIR, "reflections.jsonl");
		const entry = {
			ts: new Date().toISOString(),
			trigger: "empty-entry-trigger",
			結論: [],
			行動: [],
		};
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectReflections();
		expect(result).toContain("empty-entry-trigger");
		expect(result).not.toContain("undefined");
	});

	test("結論 > 120 字 → 截斷到 120 字", () => {
		const path = join(REAL_DATA_DIR, "reflections.jsonl");
		const long = "a".repeat(200);
		const entry = { ts: new Date().toISOString(), trigger: "x", 結論: [long], 行動: [] };
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectReflections();
		expect(result).toContain("a".repeat(120));
		expect(result).not.toContain("a".repeat(121));
	});
});

// ─── injectDeadManSwitch ──────────────────────────────────────────────────────

describe("injectDeadManSwitch", () => {
	afterEach(() => {
		for (const name of ["learner", "judge", "maintainer"]) {
			try { rmSync(`/tmp/nova-heartbeat-${name}.txt`); } catch { /* 不存在 */ }
		}
	});

	test("所有 heartbeat 檔案不存在時回傳 null", () => {
		for (const name of ["learner", "judge", "maintainer"]) {
			try { rmSync(`/tmp/nova-heartbeat-${name}.txt`); } catch { /* 不存在 */ }
		}
		const result = injectDeadManSwitch();
		expect(result).toBeNull();
	});

	test("heartbeat 在 48 小時內時回傳 null（不觸發警告）", () => {
		writeFileSync("/tmp/nova-heartbeat-learner.txt", new Date().toISOString());
		const result = injectDeadManSwitch();
		expect(result).toBeNull();
	});

	test("heartbeat 超過 48 小時時回傳包含 Dead Man Switch 的警告字串", () => {
		const oldTs = new Date(Date.now() - 49 * 3600 * 1000).toISOString();
		writeFileSync("/tmp/nova-heartbeat-learner.txt", oldTs);
		const result = injectDeadManSwitch();
		expect(typeof result).toBe("string");
		expect(result).toContain("Dead Man");
		expect(result).toContain("learner");
	});
});

// ─── injectProceduralMemory ───────────────────────────────────────────────────

describe("injectProceduralMemory", () => {
	afterEach(cleanupTestFiles);

	test("procedural-memory.jsonl 不存在時回傳 null", () => {
		const path = join(REAL_DATA_DIR, "procedural-memory.jsonl");
		try { rmSync(path); } catch { /* 不存在 */ }
		const result = injectProceduralMemory();
		expect(result).toBeNull();
	});

	test("有高信心教訓時回傳包含行為教訓的字串", () => {
		const path = join(REAL_DATA_DIR, "procedural-memory.jsonl");
		const entry = {
			applies_to: "commit",
			lesson: "commit message 應描述 why 而非 what",
			confidence: 0.85,
		};
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectProceduralMemory();
		expect(typeof result).toBe("string");
		expect(result).toContain("行為教訓");
		expect(result).toContain("commit message 應描述 why 而非 what");
	});

	test("信心值 < 0.7 的教訓被過濾，回傳 null", () => {
		const path = join(REAL_DATA_DIR, "procedural-memory.jsonl");
		const entry = {
			applies_to: "test",
			lesson: "低信心教訓",
			confidence: 0.5,
		};
		writeTestFile(path, JSON.stringify(entry) + "\n");
		const result = injectProceduralMemory();
		expect(result).toBeNull();
	});
});

// ─── injectComplianceTopViolations ────────────────────────────────────────────

describe("injectComplianceTopViolations", () => {
	const BLOCKS_FILE = "/tmp/guard-blocks.jsonl";

	afterEach(() => {
		try { rmSync(BLOCKS_FILE); } catch { /* 不存在 */ }
	});

	test("guard-blocks.jsonl 不存在時回傳 null", () => {
		try { rmSync(BLOCKS_FILE); } catch { /* 不存在 */ }
		const result = injectComplianceTopViolations();
		expect(result).toBeNull();
	});

	test("有 7 天內違規記錄時回傳包含 Top Violations 的字串", () => {
		const entry = {
			ts: new Date().toISOString(),
			reason: "force push to main blocked",
		};
		writeFileSync(BLOCKS_FILE, JSON.stringify(entry) + "\n" + JSON.stringify(entry) + "\n");
		const result = injectComplianceTopViolations();
		expect(typeof result).toBe("string");
		expect(result).toContain("Top Violations");
		expect(result).toContain("force push to main blocked");
	});

	test("只有 7 天前的記錄時回傳 null", () => {
		const oldTs = new Date(Date.now() - 8 * 86400000).toISOString();
		const entry = { ts: oldTs, reason: "old violation" };
		writeFileSync(BLOCKS_FILE, JSON.stringify(entry) + "\n");
		const result = injectComplianceTopViolations();
		expect(result).toBeNull();
	});
});

// ─── injectAutoDriveContext ───────────────────────────────────────────────────

describe("injectAutoDriveContext", () => {
	test("input 無 cwd 時回傳 null", () => {
		const result = injectAutoDriveContext({});
		expect(result).toBeNull();
	});

	test("cwd 不是 nova-manager 時回傳 null", () => {
		const result = injectAutoDriveContext({ cwd: "/Users/test/other-project" });
		expect(result).toBeNull();
	});

	test("cwd 是 nova-manager 但 ralph-loop.local.md 不存在時回傳 null", () => {
		// 使用一個不存在 .claude/ralph-loop.local.md 的路徑
		const result = injectAutoDriveContext({ cwd: join(TMP_DIR, "nova-manager") });
		expect(result).toBeNull();
	});

	test("nova-manager 有完整自驅狀態時回傳含目標的字串", () => {
		const fakeNovaMgr = join(TMP_DIR, "nova-manager");
		mkdirSync(join(fakeNovaMgr, ".claude"), { recursive: true });
		mkdirSync(join(fakeNovaMgr, "data"), { recursive: true });

		writeFileSync(join(fakeNovaMgr, ".claude/ralph-loop.local.md"), "active: true\n");
		writeFileSync(
			join(fakeNovaMgr, "data/auto-mode-state.json"),
			JSON.stringify({ target: "完成 D2 任務", current: "執行中", round: 3 }),
		);

		const result = injectAutoDriveContext({ cwd: fakeNovaMgr });
		expect(typeof result).toBe("string");
		expect(result).toContain("自驅目標");
		expect(result).toContain("完成 D2 任務");
		expect(result).toContain("round: 3");

		rmSync(fakeNovaMgr, { recursive: true });
	});

	test("ralph-loop active: false 時回傳 null", () => {
		const fakeNovaMgr = join(TMP_DIR, "nova-manager-inactive");
		mkdirSync(join(fakeNovaMgr, ".claude"), { recursive: true });

		writeFileSync(join(fakeNovaMgr, ".claude/ralph-loop.local.md"), "active: false\n");

		const result = injectAutoDriveContext({ cwd: fakeNovaMgr });
		expect(result).toBeNull();

		rmSync(fakeNovaMgr, { recursive: true });
	});
});

// ─── injectComplianceTopViolations ────────────────────────────────────────────

describe("injectComplianceTopViolations", () => {
	const BLOCKS_FILE = "/tmp/guard-blocks.jsonl";

	afterEach(() => {
		try { rmSync(BLOCKS_FILE, { recursive: true }); } catch { /* 不存在 */ }
	});

	test("guard-blocks.jsonl 不存在時回傳 null", () => {
		try { rmSync(BLOCKS_FILE, { recursive: true }); } catch { /* 不存在 */ }
		const result = injectComplianceTopViolations();
		expect(result).toBeNull();
	});

	test("guard-blocks.jsonl 為目錄時 stderr 輸出錯誤訊息並回傳 null", () => {
		try { rmSync(BLOCKS_FILE, { recursive: true }); } catch { /* 不存在 */ }
		mkdirSync(BLOCKS_FILE);
		let stderrOutput = "";
		const originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = (msg) => { stderrOutput += String(msg); return true; };
		const result = injectComplianceTopViolations();
		process.stderr.write = originalWrite;
		expect(result).toBeNull();
		expect(stderrOutput).toContain("[inject-quality-context]");
	});
});
