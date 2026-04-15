#!/usr/bin/env bun
// Phase 1 掃描器: 提取 ~/.claude/rules/ 所有 📋 MUST 條款 + 啟發式 hook-able 判斷
// 輸出 JSONL: rule_path / must_id / text / hookable / detectability / hint
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const RULES_DIR = join(homedir(), ".claude/rules");
const OUT_JSONL = join(homedir(), "projects/nova-brain/spec/進行中/知而不行-Phase1-盤點.jsonl");
const OUT_MD = join(homedir(), "projects/nova-brain/spec/進行中/知而不行-Phase1-摘要.md");

function walk(dir, acc = []) {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) walk(p, acc);
		else if (entry.endsWith(".md")) acc.push(p);
	}
	return acc;
}

// 啟發式 hook-able 判準
// y: 明確檔案路徑 / 命令 / 工具操作（可 regex 偵測）
// maybe: 含語意判斷但有結構線索
// n: 純意圖判斷（如「應追求優雅」）
const HOOK_Y_HINTS = [
	{ re: /git (add|commit|push)|--no-verify|force-push|reset --hard/i, hint: "git-ops" },
	{ re: /TaskCreate|AskUserQuestion/, hint: "tool-use" },
	{ re: /hook|Edit tool|Bash 用/, hint: "tool-routing" },
	{ re: /\.(js|ts|md|json|jsonl)|skills\/|rules\/|hooks\//, hint: "file-path" },
	{ re: /必須.*測試|test.*pass|exit code|commit hash/i, hint: "verifiable-evidence" },
	{ re: /subagent|Agent\(/, hint: "agent-spawn" },
];
const HOOK_MAYBE_HINTS = [
	{ re: /格式|分類|深度|驗收/, hint: "structural-judgment" },
	{ re: /共識|討論|committed|approved/, hint: "state-transition" },
	{ re: /dispatch|cross-dispatch|complete/, hint: "cross-session-event" },
];
const HOOK_N_HINTS = [
	{ re: /優雅|品味|思維|判斷|理解/, hint: "pure-semantic" },
	{ re: /使用者意圖|context|背景|動機/, hint: "intent-inference" },
];

function classify(text) {
	for (const { re, hint } of HOOK_Y_HINTS) if (re.test(text)) return { hookable: "y", hint };
	for (const { re, hint } of HOOK_N_HINTS) if (re.test(text)) return { hookable: "n", hint };
	for (const { re, hint } of HOOK_MAYBE_HINTS) if (re.test(text)) return { hookable: "maybe", hint };
	return { hookable: "maybe", hint: "unclassified" };
}

function detectability(hookable, text) {
	if (hookable === "y") return "regex/syscall/file-check";
	if (hookable === "n") return "n/a (semantic only)";
	// maybe
	if (/hook|guard|validator/.test(text)) return "existing-hook-can-extend";
	return "needs-state-tracking";
}

const files = walk(RULES_DIR);
const entries = [];
let mustCount = 0;

for (const f of files) {
	const content = readFileSync(f, "utf-8");
	const lines = content.split("\n");
	const rel = f.replace(homedir() + "/", "~/");
	let idx = 0;
	for (const line of lines) {
		const m = line.match(/📋\s*MUST\s*(.+)/);
		if (!m) continue;
		const text = m[1].trim();
		idx += 1;
		mustCount += 1;
		const { hookable, hint } = classify(text);
		entries.push({
			rule_path: rel,
			must_id: `${rel.split("/").pop().replace(".md", "")}#${idx}`,
			text,
			hookable,
			detectability: detectability(hookable, text),
			hint,
		});
	}
}

mkdirSync(join(homedir(), "projects/nova-brain/spec/進行中"), { recursive: true });
writeFileSync(OUT_JSONL, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

const byHookable = entries.reduce((acc, e) => { acc[e.hookable] = (acc[e.hookable] || 0) + 1; return acc; }, {});
const byFile = entries.reduce((acc, e) => { acc[e.rule_path] = (acc[e.rule_path] || 0) + 1; return acc; }, {});
const topFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 8);

const md = `# 知而不行 Phase 1 掃描摘要

- 掃描時間: ${new Date().toISOString()}
- Rule files: ${files.length}
- MUST 條款總數: ${mustCount}
- 輸出: \`${OUT_JSONL.replace(homedir() + "/", "~/")}\`

## Hook-able 初判分布

| 判定 | 數量 | 佔比 |
|---|---:|---:|
| y (可程式化) | ${byHookable.y || 0} | ${((byHookable.y || 0) / mustCount * 100).toFixed(1)}% |
| maybe (需擴 hook / 狀態追蹤) | ${byHookable.maybe || 0} | ${((byHookable.maybe || 0) / mustCount * 100).toFixed(1)}% |
| n (純語意判斷) | ${byHookable.n || 0} | ${((byHookable.n || 0) / mustCount * 100).toFixed(1)}% |

## Top rule files (by MUST count)

| file | MUST 條款 |
|---|---:|
${topFiles.map(([f, n]) => `| \`${f}\` | ${n} |`).join("\n")}

## Phase 2/3 scope 預估

- **Phase 2 (歷史頻率 mining)**: 掃 \`data/reflections.jsonl\` + \`/tmp/hook-errors.jsonl\` 對 ${byHookable.y || 0} 條 y 類關鍵字統計，預估 ~20 min（純 regex，無 LLM）
- **Phase 3 (候選 hard guard 升級)**: 從 y 類 + 違規頻率 ≥2 篩 top-5，每條預估 30-60 min（hook 實作 + unit test），合計 ~3-5h，建議再拆 3-5 子 dispatch

## 後續建議

- Manager 讀 JSONL 先抽樣 10 條驗證啟發式準確度，有偏差再迭代 classify 邏輯
- y 類比例若 >40%, Phase 3 可挑 top-3 高頻優先；若 <20% 需重新評估 hook 化 ROI
`;

writeFileSync(OUT_MD, md);
console.log(`scanned ${files.length} files / ${mustCount} MUST / y=${byHookable.y || 0} maybe=${byHookable.maybe || 0} n=${byHookable.n || 0}`);
console.log(`output: ${OUT_JSONL}`);
console.log(`summary: ${OUT_MD}`);
