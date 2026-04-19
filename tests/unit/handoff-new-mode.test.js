// handoff new mode 靜態測試（xd-izqa/4qcv Round 4）
// slash command trigger 行為是 runtime integration，不在 unit test scope
// 只驗證 handoff.md 和 self-compact.js 的契約存在

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HANDOFF_MD = join(homedir(), ".claude/commands/handoff.md");
const SELF_COMPACT = join(homedir(), ".claude/scripts/self-compact.js");

describe("handoff new mode 契約（xd-izqa Round 4）", () => {
	const handoffContent = readFileSync(HANDOFF_MD, "utf-8");
	const selfCompactContent = readFileSync(SELF_COMPACT, "utf-8");

	it("handoff.md 含 $ARGUMENTS 分支語意（compact vs clear）", () => {
		expect(handoffContent).toContain("$ARGUMENTS");
		expect(handoffContent).toContain("/handoff new");
		expect(handoffContent).toContain("clear mode");
		expect(handoffContent).toContain("compact mode");
	});

	it("handoff.md 指示 clear mode 走 --mode=clear flag", () => {
		expect(handoffContent).toContain("--mode=clear");
	});

	it("self-compact.js 從 argv 辨識 clear mode", () => {
		// 2026-04-19 default 切 clear 後改為 opt-in compact：`--mode=compact` 反向
		// MODE_CLEAR 旗標 + argv 解析契約仍需存在（clear 是 default，或顯式 --mode=clear 亦可）
		expect(selfCompactContent).toContain("MODE_CLEAR");
		expect(selfCompactContent).toMatch(/process\.argv\.includes\("--mode=(clear|compact)"\)/);
	});

	it("self-compact.js clear mode 走 PreCompact hook + /clear 分支", () => {
		// clear mode 分支必須在 /compact 送出前短路退出
		expect(selfCompactContent).toMatch(/if\s*\(\s*MODE_CLEAR\s*\)/);
		expect(selfCompactContent).toContain("hook-client.js");
		expect(selfCompactContent).toContain('send("/clear")');
	});

	it("self-compact.js clear mode 有 reasoning 註解（為何 default clear）", () => {
		// 2026-04-19 default=clear 切換的 reasoning 必須在 source 可追溯
		// 原要求 symmetry|悖論|self-clear；2026-04-19 實際 commit 用「acompact subagent」語彙
		expect(selfCompactContent).toMatch(/symmetry|悖論|self-clear|acompact|避.*subagent/);
	});

	it("self-compact.js clear mode continuation prompt 指向 handoff 檔", () => {
		expect(selfCompactContent).toContain("/tmp/nova-handoff-${project}.md");
	});

	it("handoff.md warn 提示不要直接對話中送 /compact 或 /clear", () => {
		expect(handoffContent).toContain("不要直接在對話中送");
	});

	// xd-bni5 Round 5 reviewer 補齊 5 case（WARN 2 修正）

	it("預設 compact 路徑不變（handoff.md 仍保留無參數 self-compact 呼叫）", () => {
		// 預設 mode：bun self-compact.js <cwd> <basename>（無 --mode=clear）
		expect(handoffContent).toMatch(/預設 compact mode/);
		expect(handoffContent).toMatch(/self-compact\.js[^]*?"<cwd[^]*?"<basename>"/);
	});

	it("fallback 路徑：rules 自壓縮.md 明示 /clear 失敗退新 session 方案", () => {
		// 讓 rollout 失敗有明確 escalation 路徑
		const rulesPath = join(homedir(), ".claude/rules/環境/自壓縮.md");
		const rulesContent = readFileSync(rulesPath, "utf-8");
		expect(rulesContent).toContain("Q2 fallback");
		expect(rulesContent).toMatch(/新 claude session|新 session/);
	});

	it("spawn hook-client subprocess 失敗容錯（exitCode !== 0 不卡死）", () => {
		// clear mode 必須 catch spawn 失敗，否則 handoff 檔沒寫就送 /clear 會 data loss
		expect(selfCompactContent).toMatch(/exitCode\s*!==\s*0/);
		expect(selfCompactContent).toContain("PreCompact spawn 失敗");
	});

	it("clear mode 與 compact mode handoff 檔格式一致（都走 flow-observer PreCompact）", () => {
		// 兩個 mode 都透過 PreCompact hook 寫 /tmp/nova-handoff-<proj>.md，schema 不 fork
		expect(selfCompactContent).toContain("PreCompact");
		// 既有 compact 路徑也透過 /compact 觸發 PreCompact hook（Claude Code 內建機制）
		// clear mode 透過 spawnSync 手動觸發 → 結果同一個 writer
		expect(selfCompactContent).toContain("nova-handoff-${project}.md");
	});

	it("handoff.md 判讀：$ARGUMENTS 含 'new' 才走 clear mode（非 'new' 走預設）", () => {
		// 防止「/handoff foo」誤判為 clear mode
		expect(handoffContent).toMatch(/包含\s*`new`|含\s*`new`|含有\s*`new`/);
		// 預設分支存在
		expect(handoffContent).toMatch(/否則走預設|預設 compact/);
	});
});
