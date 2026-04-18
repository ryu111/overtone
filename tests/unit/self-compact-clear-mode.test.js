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
	it("1. --mode 模式識別（default=clear, --mode=compact opt-in, 2026-04-19 翻轉預設）", () => {
		expect(source).toContain('process.argv.includes("--mode=compact")');
		expect(source).toMatch(/const\s+MODE_CLEAR\s*=\s*!MODE_COMPACT/);
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

describe("self-compact.js clear mode Bug B 防禦（2026-04-19 使用者反饋）", () => {
	// Bug B: handoff 未寫完就 /clear → 新 session 讀到舊 handoff
	//   原因：spawnSync 失敗（或 hook 內寫檔未落地）腳本仍往下 await send("/clear")
	//   修法：輪詢 /tmp/nova-handoff-<proj>.md mtime >= scriptStartMs 才繼續
	// 附加：/clear 不能跟 handoff 要求寫在同一行（continuation prompt 不可含 `/clear` 字樣）

	it("B1. clear mode 記錄 scriptStartMs 作為 mtime baseline", () => {
		const clearBlock = source.split(/if\s*\(\s*MODE_CLEAR\s*\)/)[1]?.split(/\}\s*\n\s*\n\s*\/\/\s*清除冪等/)[0] || "";
		expect(clearBlock).toMatch(/scriptStartMs\s*=\s*Date\.now\(\)/);
	});

	it("B2. clear mode 輪詢 handoff 檔 mtime 落地才送 /clear", () => {
		const clearBlock = source.split(/if\s*\(\s*MODE_CLEAR\s*\)/)[1] || "";
		// 必須有 statSync 讀 handoff 檔 mtime
		expect(clearBlock).toMatch(/statSync\s*\(\s*handoffPath\s*\)/);
		expect(clearBlock).toMatch(/mtimeMs\s*>=\s*scriptStartMs/);
	});

	it("B3. clear mode handoff 未更新時放棄 /clear（不繼續往下）", () => {
		const clearBlock = source.split(/if\s*\(\s*MODE_CLEAR\s*\)/)[1] || "";
		// 未 fresh → 必須 early return / process.exit 在 send("/clear") 之前
		const abortIdx = clearBlock.search(/!handoffFresh|handoffFresh\s*===?\s*false/);
		const clearIdx = clearBlock.indexOf('send("/clear")');
		expect(abortIdx).toBeGreaterThan(-1);
		expect(clearIdx).toBeGreaterThan(abortIdx);
		// abort 分支必須 process.exit 跳出
		const abortBlock = clearBlock.slice(abortIdx, clearIdx);
		expect(abortBlock).toMatch(/process\.exit\s*\(/);
	});

	it("B4. continuation prompt 不含 `/clear` 字樣（/clear 不可跟 handoff 要求寫在同一行）", () => {
		const clearBlock = source.split(/if\s*\(\s*MODE_CLEAR\s*\)/)[1] || "";
		// 找 contPrompt 宣告
		const contMatch = clearBlock.match(/const\s+contPrompt\s*=\s*`([^`]*)`/);
		expect(contMatch).not.toBeNull();
		const contStr = contMatch[1];
		// continuation prompt 內不可出現 `/clear` 字樣（無論括號裡或純引用）
		expect(contStr).not.toContain("/clear");
	});
});
