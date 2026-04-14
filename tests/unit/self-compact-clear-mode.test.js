// self-compact.js --mode=clear 專屬測試（xd-izqa/pyuj P2 收尾）
//
// /clear rollout 已由 nm live session 實證：本 session Round 3 /handoff new 執行後
// CLI 真正進入 /clear 狀態，symmetry 推論（terminal-send 純 paste-and-enter）成立。
//
// 本 test 鎖定 self-compact.js 原始碼層的 --mode=clear 分支行為，
// 補 handoff-new-mode.test.js 的契約層測試不足（runtime flow 原始碼驗證）。

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SELF_COMPACT_PATH = join(homedir(), ".claude/scripts/self-compact.js");
const source = readFileSync(SELF_COMPACT_PATH, "utf-8");

describe("self-compact.js --mode=clear 分支（xd-pyuj P2）", () => {
	it("1. --mode=clear argv flag 解析（process.argv.includes）", () => {
		expect(source).toContain('process.argv.includes("--mode=clear")');
		expect(source).toMatch(/const\s+MODE_CLEAR\s*=/);
	});

	it("2. clear mode 呼叫 bun hook-client.js PreCompact 子 process 寫 handoff", () => {
		// 透過 Bun.spawnSync 觸發既有 PreCompact hook handler → 寫 /tmp/nova-handoff-<proj>.md
		expect(source).toMatch(/Bun\.spawnSync\s*\(/);
		expect(source).toMatch(/hook-client\.js["'`]\s*,\s*["'`]PreCompact/);
	});

	it("3. clear mode 最終 send /clear slash command（非 /compact）", () => {
		// clear mode 分支必須呼叫 send("/clear")，且在 /compact 呼叫前短路退出
		expect(source).toContain('send("/clear")');
		// 短路退出證據：MODE_CLEAR 分支尾有 process.exit
		const clearBlock = source.split(/if\s*\(\s*MODE_CLEAR\s*\)/)[1] || "";
		expect(clearBlock).toContain("process.exit(0)");
	});

	it("4. clear mode continuation prompt 指向 handoff 檔 + 明示 context 已清空", () => {
		expect(source).toMatch(/\/tmp\/nova-handoff-\$\{project\}\.md/);
		expect(source).toMatch(/context 已清空|Session 接續/);
	});

	it("5. spawn 失敗容錯（exitCode 檢查 + console.error）", () => {
		expect(source).toMatch(/exitCode\s*!==\s*0/);
		expect(source).toContain("PreCompact spawn 失敗");
	});
});
