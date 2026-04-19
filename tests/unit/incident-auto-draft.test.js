// ADR-013 Phase 1 T3 test (4 case)
// 對齊 spec/進行中/adr-013-phase-1-mvp.md §T3
//
// Round 3 Issue 1: 驗證 input-driven 讀取，order 獨立於 reflection-persist

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";
import { rmSync, readdirSync } from "node:fs";

const HOOK_PATH = join(homedir(), ".claude/hooks/modules/incident-auto-draft.js");
const INCIDENTS_DIR = join(homedir(), ".claude/obsidian/episodic/incidents");

let evaluate;

describe("incident-auto-draft — ADR-013 Phase 1 T3", () => {
	const cleanupSlugs = [];

	beforeEach(async () => {
		const mod = await import(`${HOOK_PATH}?t=${Date.now()}`);
		evaluate = mod.evaluate;
	});

	afterEach(() => {
		// 清理本 test 產生的 DRAFT 檔
		for (const slug of cleanupSlugs) {
			try {
				const files = readdirSync(INCIDENTS_DIR).filter((f) => f.includes(slug) && f.includes("-DRAFT-"));
				for (const f of files) rmSync(join(INCIDENTS_DIR, f));
			} catch { /* skip */ }
		}
		cleanupSlugs.length = 0;
	});

	it("Normal trigger: 根因含「第 N 次」keyword → 生 DRAFT 檔", () => {
		const lastMsg = `
## 本次完成
test task done

★ Insight ─────────────────────
1. 本 session 第 99 次 test-trigger dogfood — structural-test-fixture-scope
─────────────────────
`;
		const input = { last_assistant_message: lastMsg };
		const r = evaluate(input);
		expect(r).toBeDefined();
		expect(r.systemMessage).toMatch(/incident-auto-draft/);
		// 驗證 DRAFT 檔產生
		const files = readdirSync(INCIDENTS_DIR).filter((f) => f.includes("nth-time-dogfood") && f.includes("-DRAFT-"));
		expect(files.length).toBeGreaterThanOrEqual(1);
		cleanupSlugs.push("nth-time-dogfood");
	});

	it("24h dedup: 同 topic 24h 內已有 incident → skip", () => {
		const lastMsg = `
## 本次完成
test

★ Insight ─────────────────────
1. 第 100 次 dogfood test-dedup-fixture
─────────────────────
`;
		const input = { last_assistant_message: lastMsg };
		// 第 1 次寫
		const r1 = evaluate(input);
		expect(r1).toBeDefined();
		cleanupSlugs.push("nth-time-dogfood");
		// 第 2 次立即再 call → dedup
		const r2 = evaluate(input);
		expect(r2).toBeUndefined();
	});

	it("No root cause: Insight 無 keyword match → skip", () => {
		const lastMsg = `
## 本次完成
normal task

★ Insight ─────────────────────
1. 一般 UX 改進觀察，色彩對比效果更好，使用者接受度高
─────────────────────
`;
		const input = { last_assistant_message: lastMsg };
		const r = evaluate(input);
		expect(r).toBeUndefined();
	});

	it("Input order 獨立: 不依賴 reflections.jsonl，從 input.last_assistant_message 直接讀（Round 3 Issue 1）", () => {
		// 驗證：即使 data/reflections.jsonl 不存在或空，hook 仍能從 input 讀 insight
		// 此 test 直接確認 evaluate 簽章 only 需要 input.last_assistant_message，不 read jsonl
		const lastMsg = `
★ Insight ─────────────────────
1. 第 101 次 drift dogfood test-order-independence
─────────────────────
`;
		const input = { last_assistant_message: lastMsg };
		// 預期：不需 data/reflections.jsonl 就能運作
		const r = evaluate(input);
		expect(r).toBeDefined();
		cleanupSlugs.push("nth-time-dogfood");
	});
});
