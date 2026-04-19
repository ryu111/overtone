// xd-k6zj Step 3 follow-up (commit fc6a7e2 + reviewer BLOCK xd-10g6)
// pipeline-enforcer.js ignore_path_prefixes 豁免測試鎖定
//
// Context：M2 hook 上線後第一個 LIVE false positive（Manager 寫 external-ref 被誤擋）
// 補救：xd-k6zj 三步改動 0 test 違反 test-first

import { describe, it, expect, beforeEach } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";

const ENFORCER_PATH = join(homedir(), ".claude/hooks/modules/pipeline-enforcer.js");

describe("pipeline-enforcer ignore_path_prefixes — xd-k6zj Step 3", () => {
	let evaluate;

	beforeEach(async () => {
		const mod = await import(`${ENFORCER_PATH}?t=${Date.now()}`);
		evaluate = mod.evaluate;
	});

	it("Test C: obsidian/raw/ Write + tag match + diff>20 → return undefined（豁免）", () => {
		const input = {
			cwd: "/Users/sbu/.claude",
			tool_name: "Write",
			tool_input: {
				file_path: "/Users/sbu/.claude/obsidian/raw/reflections/test.md",
				// 大 diff 模擬，50 行含 rule 關鍵字觸發 rule-change tag
				content: Array(50).fill("跨 repo rule 改動 ~/.claude/rules/test.md ADR-012 canonical SoT").join("\n"),
			},
		};
		const r = evaluate(input);
		expect(r).toBeUndefined();
	});

	it("Test D: obsidian/semantic/external-references/ 豁免", () => {
		const input = {
			cwd: "/Users/sbu/.claude",
			tool_name: "Write",
			tool_input: {
				file_path: "/Users/sbu/.claude/obsidian/semantic/external-references/foo.md",
				content: Array(50).fill("multi-repo 跨 repo 架構決策 ADR-012").join("\n"),
			},
		};
		const r = evaluate(input);
		expect(r).toBeUndefined();
	});

	it("Test E: obsidian/episodic/ 豁免", () => {
		const input = {
			cwd: "/Users/sbu/.claude",
			tool_name: "Write",
			tool_input: {
				file_path: "/Users/sbu/.claude/obsidian/episodic/incidents/xd-test.md",
				content: Array(50).fill("rule 改動 canonical SoT").join("\n"),
			},
		};
		const r = evaluate(input);
		expect(r).toBeUndefined();
	});

	it("Test F（反向驗證）: obsidian/semantic/architecture-decisions/ 不豁免 — canonical 仍受 enforcement", () => {
		const input = {
			cwd: "/Users/sbu/.claude",
			tool_name: "Write",
			tool_input: {
				file_path: "/Users/sbu/.claude/obsidian/semantic/architecture-decisions/ADR-999-test.md",
				content: Array(50).fill("新增 ADR canonical SoT").join("\n"),
			},
		};
		// architecture-decisions/ 不在 ignore_path_prefixes → 應該被 enforce
		// 此 test 驗證 prefix filter 的正確邊界（不誤豁免 canonical ADR）
		evaluate(input); // smoke test（不 crash 即可，實際 block 需依賴 routing level state）
		const config = require(join(homedir(), ".claude/config/pipeline-tags.json"));
		expect(config.ignore_path_prefixes.some((p) =>
			input.tool_input.file_path.includes(p)
		)).toBe(false);
	});

	it("Test G（配置 schema）: config/pipeline-tags.json ignore_path_prefixes 存在且非空", () => {
		const config = require(join(homedir(), ".claude/config/pipeline-tags.json"));
		expect(Array.isArray(config.ignore_path_prefixes)).toBe(true);
		expect(config.ignore_path_prefixes.length).toBeGreaterThanOrEqual(1);
		expect(config._ignore_path_rationale).toBeDefined();
	});
});
