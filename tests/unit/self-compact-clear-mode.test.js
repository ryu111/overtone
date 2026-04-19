// self-compact.js --mode=clear 原始碼驗證（2026-04-19 升級為事件驅動）
//
// 更新：spec/完成/self-compact-event-driven.md 實作後，舊 mtime polling 邏輯被
// 「spawnSync exitCode + 單次 statSync + fs.watch on session-started flag」取代。
// 本檔保留「clear mode 結構性保證」測試（模式識別、流程順序、contPrompt 語意）。
// 事件 flag 寫入驗證見 self-compact-event-flow.test.js。

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SELF_COMPACT_PATH = join(homedir(), ".claude/scripts/self-compact.js");
const source = readFileSync(SELF_COMPACT_PATH, "utf-8");

describe("self-compact.js --mode=clear 結構", () => {
	it("1. --mode 模式識別（default=clear, --mode=compact opt-in）", () => {
		expect(source).toContain('process.argv.includes("--mode=compact")');
		expect(source).toMatch(/const\s+MODE_CLEAR\s*=\s*!MODE_COMPACT/);
	});

	it("2. clear mode 呼叫 bun hook-client.js PreCompact 子 process 寫 handoff", () => {
		expect(source).toMatch(/Bun\.spawnSync\s*\(/);
		expect(source).toMatch(/hook-client\.js["'`]\s*,\s*\{?\s*["'`]PreCompact/);
	});

	it("3. clear mode 最終 send /clear slash command（非 /compact）", () => {
		// 新設計用變數 slash；源碼需含條件分支邏輯
		expect(source).toMatch(/MODE_CLEAR\s*\?\s*["'`]\/clear["'`]\s*:\s*["'`]\/compact["'`]/);
	});

	it("4. clear mode continuation prompt 指向 handoff 檔 + 明示 context 已清空", () => {
		expect(source).toContain("HANDOFF_PATH");
		expect(source).toMatch(/context 已清空|Session 接續/);
	});

	it("5. spawn 失敗容錯（exitCode 檢查）", () => {
		expect(source).toMatch(/proc\.exitCode\s*!==\s*0/);
	});
});

describe("self-compact.js clear mode Bug B 防禦（handoff staleness）", () => {
	// Bug B: handoff 未寫完就 /clear → 新 session 讀到舊 handoff
	// 原設計：mtime polling（time-based）
	// 新設計：spawnSync exitCode + 單次 statSync mtime >= scriptStartMs + fs.watch on started flag
	// 附加：continuation prompt 不可含 `/clear` 字樣（/clear 不能跟 handoff 要求寫在同一行）

	it("B1. 記錄 scriptStartMs 作為 handoff mtime baseline", () => {
		expect(source).toMatch(/scriptStartMs\s*=\s*Date\.now\(\)/);
	});

	it("B2. handoff mtime < scriptStartMs 時視為 stale 且 abort", () => {
		expect(source).toMatch(/mtimeMs\s*<\s*scriptStartMs/);
		// stale 偵測後必須 abort（process.exit 或 throw）
		expect(source).toMatch(/handoff stale|stale or missing/);
	});

	it("B3. S3 send slash 前必通過 handoff fresh 驗證（順序保證）", () => {
		const staleCheckIdx = source.search(/mtimeMs\s*<\s*scriptStartMs/);
		const sendSlashIdx = source.search(/await send\(slash\)/);
		expect(staleCheckIdx).toBeGreaterThan(-1);
		expect(sendSlashIdx).toBeGreaterThan(-1);
		expect(staleCheckIdx).toBeLessThan(sendSlashIdx);
	});

	it("B4. continuation prompt 不含 `/clear` 字樣（避免 CLI 處理衝突）", () => {
		// 找所有 contPrompt 字串定義
		const contMatches = [...source.matchAll(/contPrompt\s*=\s*[\s\S]*?;/g)];
		expect(contMatches.length).toBeGreaterThan(0);
		for (const m of contMatches) {
			expect(m[0]).not.toContain("/clear");
		}
	});
});

describe("self-compact.js 事件驅動移除所有 time-based 邏輯（spec/完成/self-compact-event-driven.md）", () => {
	it("不含 IDLE_THRESHOLD_MS / waitForIdle / waitForCtxUpdate", () => {
		expect(source).not.toContain("IDLE_THRESHOLD_MS");
		expect(source).not.toContain("waitForIdle");
		expect(source).not.toContain("waitForCtxUpdate");
	});

	it("不含 COOLDOWN_MS 時間窗（改用 lock flag）", () => {
		expect(source).not.toContain("COOLDOWN_MS");
		expect(source).toContain("LOCK_FILE");
	});

	it("lock flag 防重入 + pid 驗活 + ts stale detection", () => {
		expect(source).toContain("acquireLock");
		expect(source).toContain("releaseLock");
		expect(source).toMatch(/process\.kill\s*\(\s*payload\.pid\s*,\s*0\s*\)/); // pid 驗活
		expect(source).toContain("LOCK_STALE_MS");
	});

	it("waitForFlag 用 fs.watch（非 polling loop）", () => {
		expect(source).toContain("waitForFlag");
		expect(source).toMatch(/watch\s*\(\s*dirname/);
		expect(source).not.toMatch(/while\s*\([^)]*Date\.now/);
	});

	it("S4b validate flag.source === 'clear' 精確辨別觸發源", () => {
		expect(source).toMatch(/p\.source\s*===\s*["'`]clear["'`]/);
	});

	it("S7 session replace 用 session_id 配對取代 time polling", () => {
		expect(source).toContain("preExitSid");
		expect(source).toContain("p.session_id === preExitSid");
	});
});
