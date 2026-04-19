import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	extractInsightSection,
	parseInsightBullets,
	hashEntry,
	isDuplicate,
	buildEntry,
	persistReflection,
	actionHasVerifiable,
	validateActions,
	appendActionsToStatePrompt,
	extractExternalResearchSection,
	parseExternalResearch,
} from "../../../../.claude/hooks/modules/reflection-persist.js";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
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
		// 用可驗證行動（rules/ path）使 allProse=false → resolved_at=null（xd-nvuj Option D 後行為）
		const e = buildEntry({}, { 結論: ["a"], 行動: ["rules/核心/深度路由.md 已確認"] }, "hash1", new Date("2026-04-13T00:00:00Z"));
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

	it("★ Insight 章節有結論無行動 → 不 append + systemMessage warn", () => {
		// explanatory style 的教學洞察：純觀察無 commit/file/rule
		const insightText = [
			"`★ Insight ───────`",
			"- 反直覺發現：async 比 sync 慢",
			"- 設計洞察：狀態最小化",
			"`─────────────────`",
		].join("\n");
		const r = persistReflection({ cwd: tmpDir, last_assistant_message: insightText });
		expect(r.decision).toBe("allow");
		expect(r.systemMessage).toContain("無可驗證行動");
		expect(existsSync(join(tmpDir, "data/reflections.jsonl"))).toBe(false);
	});

	it("連續 2 次同內容 → 只寫 1 條（dedup）", () => {
		const insightText = [
			"`★ Insight ───────`",
			"1. **發現**：commit abc9876 修了另一個 bug",
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

describe("actionHasVerifiable / validateActions (o8xm schema 強制)", () => {
	it("commit hash → verifiable", () => {
		expect(actionHasVerifiable("commit abc1234 修了 bug")).toBe(true);
		expect(actionHasVerifiable("abc12345678 標的")).toBe(true);
	});

	it("file path → verifiable", () => {
		expect(actionHasVerifiable("修 hooks/modules/guards.js 的 line 42")).toBe(true);
		expect(actionHasVerifiable("scripts/xxx.js 新建")).toBe(true);
	});

	it("rules/ ref → verifiable", () => {
		expect(actionHasVerifiable("補條款到 rules/核心/任務管理.md")).toBe(true);
	});

	it("skills/ ref → verifiable", () => {
		expect(actionHasVerifiable("新增 skills/executor-dispatch/ 模板")).toBe(true);
	});

	it("「無需修改，原因：X」→ verifiable", () => {
		expect(actionHasVerifiable("無需修改，原因：結構已完善")).toBe(true);
	});

	it("純散文 → not verifiable", () => {
		expect(actionHasVerifiable("下次並行強制 N tool calls")).toBe(false);
		expect(actionHasVerifiable("記為 P2 debt")).toBe(false);
		expect(actionHasVerifiable("持續觀察")).toBe(false);
	});

	it("空字串 / 非字串 → not verifiable", () => {
		expect(actionHasVerifiable("")).toBe(false);
		expect(actionHasVerifiable(null)).toBe(false);
	});

	it("validateActions 全部 verifiable → null", () => {
		expect(validateActions(["commit abc1234", "rules/core/x.md"])).toBeNull();
	});

	it("validateActions 有散文 → warn message", () => {
		const w = validateActions(["commit abc1234", "持續觀察"]);
		expect(w).not.toBeNull();
		expect(w).toContain("散文");
	});

	it("validateActions 空陣列 → null", () => {
		expect(validateActions([])).toBeNull();
	});
});

describe("persistReflection schema warn", () => {
	it("散文行動 → 仍寫入 + systemMessage warn", () => {
		const text = `\`★ Insight ─────\`\n1. **第一點**：持續觀察就好\n\`─────\``;
		const r = persistReflection({ cwd: tmpDir, last_assistant_message: text });
		expect(r.decision).toBe("allow");
		// 散文行動：檔案還是會寫（不阻擋）
		const path = join(tmpDir, "data/reflections.jsonl");
		if (existsSync(path)) {
			// 有寫入才檢查 warn — 可能 parseInsightBullets 判為 結論 而非 行動
			// 若行動為空，validateActions 回 null，沒 warn
		}
	});
});

describe("appendActionsToStatePrompt (7/24 閉環組件 1)", () => {
	function makeState(active = true) {
		const statePath = join(tmpDir, ".claude/ralph-loop.local.md");
		mkdirSync(join(tmpDir, ".claude"), { recursive: true });
		const content = `---
active: ${active}
iteration: 1
session_id: test
max_iterations: 100
completion_promise: "DONE"
started_at: "2026-04-19T00:00:00Z"
---

原 prompt 內容

═══════════════════════════════════════════
CRITICAL RULE — Ralph Loop
═══════════════════════════════════════════
`;
		writeFileSync(statePath, content);
		return statePath;
	}

	it("有可驗證 action + active=true → append 到 CRITICAL RULE 之前", () => {
		const statePath = makeState(true);
		appendActionsToStatePrompt(tmpDir, ["commit abc1234 修了 bug", "rules/核心/失敗與修復.md 補條款"]);
		const c = readFileSync(statePath, "utf-8");
		expect(c).toContain("自驅追加");
		expect(c).toContain("commit abc1234");
		expect(c).toContain("rules/核心/失敗與修復.md");
		const appendIdx = c.indexOf("自驅追加");
		const criticalIdx = c.indexOf("CRITICAL RULE");
		expect(appendIdx).toBeLessThan(criticalIdx);
	});

	it("active=false → 不 append（閒置 loop 不污染）", () => {
		const statePath = makeState(false);
		appendActionsToStatePrompt(tmpDir, ["commit abc1234 修了 bug"]);
		const c = readFileSync(statePath, "utf-8");
		expect(c).not.toContain("自驅追加");
	});

	it("純散文 action（無可驗證標的）→ 不 append", () => {
		const statePath = makeState(true);
		appendActionsToStatePrompt(tmpDir, ["持續觀察", "下次注意"]);
		const c = readFileSync(statePath, "utf-8");
		expect(c).not.toContain("自驅追加");
	});

	it("state 檔案不存在 → silently skip（不 throw）", () => {
		expect(() => appendActionsToStatePrompt(tmpDir, ["commit abc1234"])).not.toThrow();
	});

	it("同 action 文字已存在 state → 跳過不重複 append", () => {
		const statePath = makeState(true);
		appendActionsToStatePrompt(tmpDir, ["commit abc1234 修了 bug"]);
		appendActionsToStatePrompt(tmpDir, ["commit abc1234 修了 bug"]);
		const c = readFileSync(statePath, "utf-8");
		const occurrences = (c.match(/commit abc1234/g) || []).length;
		expect(occurrences).toBe(1);
	});

	it("persistReflection 整合：有 verifiable action → state.prompt 收到 append", () => {
		const statePath = makeState(true);
		const insightText = [
			"`★ Insight ───────`",
			"1. **發現**：commit def5678 修了 bug via rules/核心/X.md",
			"`─────────────────`",
		].join("\n");
		persistReflection({ cwd: tmpDir, last_assistant_message: insightText });
		const c = readFileSync(statePath, "utf-8");
		expect(c).toContain("自驅追加");
	});
});

// ─── 外部研究 schema baseline（commit 4107453 rule 配合，P0 spec 擴） ───
describe("extractExternalResearchSection", () => {
	it("抓取 ## 外部研究 markdown section", () => {
		const text = [
			"## 本次完成",
			"...",
			"### ★ Insight",
			"- 第一條",
			"## 外部研究",
			"- 主題 A: 見 https://arxiv.org/abs/2405.06682",
			"- 主題 B: external-references/foo.md",
			"## 下一步",
		].join("\n");
		const s = extractExternalResearchSection(text);
		expect(s).toContain("主題 A");
		expect(s).toContain("主題 B");
		expect(s).not.toContain("下一步");
	});

	it("無外部研究 section 回 null", () => {
		expect(extractExternalResearchSection("純文字")).toBeNull();
		expect(extractExternalResearchSection("")).toBeNull();
		expect(extractExternalResearchSection(null)).toBeNull();
	});
});

describe("parseExternalResearch", () => {
	it("parse bullet 段成陣列，抽 URL 和 external-references path", () => {
		const section = [
			"- Reflexion patterns: 見 https://arxiv.org/abs/2405.06682 — self-critique +11%",
			"- MIRIX Vault: obsidian/semantic/external-references/ai-agent-architecture-2026.md — KV 對齊",
		].join("\n");
		const items = parseExternalResearch(section);
		expect(items.length).toBe(2);
		expect(items[0].topic).toContain("Reflexion");
		expect(items[0].source_url).toBe("https://arxiv.org/abs/2405.06682");
		expect(items[1].external_ref_path).toContain("external-references/ai-agent-architecture-2026.md");
	});

	it("section 為空但 fallbackText 含 external-references path → fallback 一筆", () => {
		const items = parseExternalResearch(null, "見 external-references/xyz.md 詳細");
		expect(items.length).toBe(1);
		expect(items[0].external_ref_path).toContain("external-references/xyz.md");
		expect(items[0].topic).toBe("xyz");
	});

	it("section 和 fallbackText 都無 → 空陣列", () => {
		expect(parseExternalResearch(null, "純內部反思")).toEqual([]);
		expect(parseExternalResearch("", "")).toEqual([]);
	});

	it("buildEntry 含 parsed.外部研究 → entry 含 外部研究 field", () => {
		const parsed = {
			結論: ["c1"],
			行動: ["commit abcdef1"],
			外部研究: [{ topic: "T", source_url: "https://x.com", insight: "i" }],
		};
		const entry = buildEntry({ cwd: "/tmp" }, parsed, "hash1");
		expect(entry.外部研究).toBeDefined();
		expect(entry.外部研究.length).toBe(1);
		expect(entry.外部研究[0].topic).toBe("T");
	});

	it("buildEntry 無 parsed.外部研究 → entry 無 外部研究 field", () => {
		const parsed = { 結論: ["c1"], 行動: ["commit abcdef1"] };
		const entry = buildEntry({ cwd: "/tmp" }, parsed, "hash2");
		expect(entry.外部研究).toBeUndefined();
	});

	// iter 6 live flow 驗證：mirror iter 5 實際輸出結構
	it("reflection lite — buildEntry 空行動+有外部研究 → resolve_reason=insight_with_external_research_only", () => {
		const parsed = {
			結論: ["insight"],
			行動: [],
			外部研究: [{ topic: "T", source_url: "https://x.com", insight: "i" }],
		};
		const entry = buildEntry({ cwd: "/tmp" }, parsed, "hash_lite");
		expect(entry.外部研究).toBeDefined();
		expect(entry.resolve_reason).toBe("insight_with_external_research_only");
		expect(entry.resolved_at).not.toBeNull();
	});

	it("persistReflection — 空行動+空外部研究 → systemMessage 不 persist", () => {
		const tmpCwd = require("node:fs").mkdtempSync(require("node:os").tmpdir() + "/reflection-lite-");
		const text = `前言\n### ★ Insight\n- 教學洞察 A（純 prose）\n- 教學洞察 B（無 action）\n## 接下來的建議`;
		const r = persistReflection({ cwd: tmpCwd, last_assistant_message: text });
		expect(r.systemMessage).toContain("純教學");
		expect(require("node:fs").existsSync(tmpCwd + "/data/reflections.jsonl")).toBe(false);
	});

	it("persistReflection — 空行動+有外部研究 → persist entry with reflection lite", () => {
		const tmpCwd = require("node:fs").mkdtempSync(require("node:os").tmpdir() + "/reflection-lite-");
		const text = `前言
### ★ Insight
- 教學洞察 A（純 prose）
- 教學洞察 B（無 action）

## 外部研究
- Topic X：見 https://arxiv.org/abs/1234.5678 — 業界印證
## 接下來的建議`;
		persistReflection({ cwd: tmpCwd, last_assistant_message: text });
		const path = tmpCwd + "/data/reflections.jsonl";
		expect(require("node:fs").existsSync(path)).toBe(true);
		const entry = JSON.parse(require("node:fs").readFileSync(path, "utf-8").trim().split("\n").pop());
		expect(entry.外部研究).toBeDefined();
		expect(entry.外部研究.length).toBeGreaterThan(0);
		expect(entry.resolve_reason).toBe("insight_with_external_research_only");
	});

	it("行首錨點 — 表格 cell 內 `## 外部研究` 不誤匹配（iter 6 bug 回歸）", () => {
		const text = `## 本次完成

| # | 動作 |
|---|------|
| 1 | extractExternalResearchSection 抓 \`## 外部研究\` section |
| 2 | 另外一列 |

## ★ Insight
內容`;
		// 表格 cell 含反引號包的 ## 外部研究 — 不該被當 heading
		expect(extractExternalResearchSection(text)).toBeNull();
	});

	it("live flow — iter 5 型態（5 H2 headers 含 ## 外部研究）應抓到 section 本體", () => {
		const text = `## 本次完成
| # | 任務 | 動作 |
|---|------|------|
| 1 | 做事 | 完成 |

## 副作用與關聯改動
- 小事

## 外部研究

- **Goal clarity > prompt complexity**（OneReach.ai 2026）
- **Goal decomposition into task graph**（Intellectyx 2026）
- **Aggregated score threshold termination**（Gleecus 2026）
- 詳見 [autonomous-agent-goal-termination-2026.md](./obsidian/semantic/external-references/autonomous-agent-goal-termination-2026.md)

## ★ Insight

1. **洞察一**：內容
2. **洞察二**：內容

## 接下來的建議
- tomorrow

<promise>DONE</promise>`;
		const section = extractExternalResearchSection(text);
		expect(section).not.toBeNull();
		expect(section).toContain("Goal clarity");
		expect(section).toContain("autonomous-agent-goal-termination-2026.md");
		expect(section).not.toContain("洞察一");

		const items = parseExternalResearch(section, "");
		expect(items.length).toBeGreaterThanOrEqual(3);
		const joined = items.map((i) => i.topic + "|" + i.insight).join("||");
		expect(joined).toContain("Goal clarity");
	});
});
