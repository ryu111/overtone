#!/usr/bin/env bun
// Phase 2: 對 Phase 1 盤點 y 類 MUST 做歷史違規頻率 mining
// source: data/reflections.jsonl + /tmp/hook-errors.jsonl (若存在)
// 純 regex + keyword match，不用 LLM
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PHASE1_JSONL = join(homedir(), "projects/nova-brain/spec/進行中/知而不行-Phase1-盤點.jsonl");
const OUT_JSONL = join(homedir(), "projects/nova-brain/spec/進行中/知而不行-Phase2-頻率.jsonl");
const OUT_MD = join(homedir(), "projects/nova-brain/spec/進行中/知而不行-Phase2-摘要.md");

const SOURCES = [
	join(homedir(), "projects/nova-brain/data/reflections.jsonl"),
	join(homedir(), "projects/nova-manager/data/reflections.jsonl"),
	"/tmp/hook-errors.jsonl",
];

// 從 MUST text 抽出 keyword set（簡單版：斷詞 + 濾常用詞）
const STOP_WORDS = new Set(["的", "是", "了", "在", "有", "和", "或", "與", "必須", "必", "不", "MUST", "NEVER", "SHOULD"]);
function extractKeywords(text) {
	// 保留中英文字母數字，拆 hyphen/slash
	const tokens = text
		.replace(/[。，；：、！？「」『』（）()]/g, " ")
		.split(/[\s,.:;/\\-]+/)
		.map((t) => t.trim())
		.filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
	// 去除過短/過純符號
	return Array.from(new Set(tokens)).filter((t) => /[\u4e00-\u9fffA-Za-z]/.test(t)).slice(0, 8);
}

function loadEntries(path) {
	if (!existsSync(path)) return [];
	try {
		return readFileSync(path, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
	} catch { return []; }
}

// 全文索引：所有來源合成一個字串，對每個 keyword 做 substring count
const corpus = SOURCES.map((s) => {
	if (!existsSync(s)) return "";
	try { return readFileSync(s, "utf-8"); } catch { return ""; }
}).join("\n");

const phase1 = loadEntries(PHASE1_JSONL);
// 排除已有 hook 守護的 rule（條款文字含「✓ ... guard」= 已有程式化防護，不需再升）
const ALREADY_GUARDED = /✓[^。\n]*(guard|Hook 守護|architecture test|hook enforce|hook 守)/;
const yRules = phase1.filter((e) => e.hookable === "y" && !ALREADY_GUARDED.test(e.text));

function countMatches(text, keyword) {
	if (!keyword) return 0;
	const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return (text.match(new RegExp(esc, "g")) || []).length;
}

const results = yRules.map((r) => {
	const keywords = extractKeywords(r.text);
	const counts = keywords.map((k) => ({ keyword: k, count: countMatches(corpus, k) }));
	const violation_count = counts.reduce((sum, c) => sum + c.count, 0);
	return {
		...r,
		keywords,
		keyword_counts: counts,
		violation_count,
	};
});

results.sort((a, b) => b.violation_count - a.violation_count);
writeFileSync(OUT_JSONL, results.map((r) => JSON.stringify(r)).join("\n") + "\n");

const top10 = results.slice(0, 10);
const top5 = results.slice(0, 5);

const md = `# 知而不行 Phase 2 歷史頻率摘要

- 掃描時間: ${new Date().toISOString()}
- 輸入: Phase 1 y 類 ${yRules.length} 條
- 語料來源: nb/data + nova-manager/data + /tmp/hook-errors.jsonl (存在則掃)
- 方法: keyword substring match（純 regex, 無 LLM）

⚠️ **局限 1**: keyword 含高頻通用詞（如 "hook", "commit", "test"）會膨脹 count，此數字是**相對比較**而非絕對違規次數。真實違規需人工抽樣驗證。
⚠️ **局限 2**: MUST 行內若未含「✓ guard」標記但 rule 檔案其他行有 → filter 漏抓。例如 \`模組架構#6\` / \`總結格式#10\` 已有 hook/test 守護但 filter 未濾。Manager 審閱時請對 top-10 逐條查 rule 全文確認。
⚠️ **局限 3**: 中文斷詞純 split-by-delimiter，"Phase"/"Step"/"session" 等英文詞被當 keyword 造成分數膨脹。需人工過濾。

## Top 10 高頻 keyword 命中（候選 hard guard）

| # | must_id | text (摘) | keywords | 總命中 |
|---|---|---|---|---:|
${top10.map((r, i) => `| ${i + 1} | \`${r.must_id}\` | ${r.text.slice(0, 50)}... | ${r.keywords.slice(0, 3).join(", ")} | ${r.violation_count} |`).join("\n")}

## Phase 3 推薦 Top 5（優先升 hook）

${top5.map((r, i) => `### ${i + 1}. \`${r.must_id}\` (命中 ${r.violation_count})

- **條款**: ${r.text}
- **rule path**: \`${r.rule_path}\`
- **偵測 hint**: ${r.hint} / ${r.detectability}
- **升 hook 建議**: 視 hint 類型 (git-ops → pre-bash-guard / tool-use → tool-validator / file-path → pre-edit-guard 等)
`).join("\n")}

## Phase 3 scope 預估

- 每條 hook 實作 + unit test: ~30-60 min
- Top 5 全做: ~3-5h，建議拆 2-3 子 dispatch (Top 3 先、剩餘後)
- 或 Manager 抽樣 Top 10 取最有 ROI 前 3 條先做
`;

writeFileSync(OUT_MD, md);
console.log(`Phase 2 done: ${yRules.length} y-class rules analyzed`);
console.log(`top violation count: ${top10[0]?.violation_count || 0}`);
console.log(`output: ${OUT_JSONL}`);
console.log(`summary: ${OUT_MD}`);
