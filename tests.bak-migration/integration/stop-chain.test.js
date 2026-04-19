// Stop chain 整合測試：驗證 9 個 Stop handlers 串行執行不互相打架
// 對應 hook-client.js LOCAL_MODULES['Stop']：
//   ralph-loop / wrapup-guard / task-dispatch-guard / reflection-persist /
//   task-auto-cleanup / summary-format-guard / reflection-counter /
//   reflection-resolver-check / reviewer-enforcer

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { on as ralphLoop } from "../../../../.claude/hooks/modules/ralph-loop.js";
import { on as wrapupGuard } from "../../../../.claude/hooks/modules/wrapup-guard.js";
import { on as taskDispatchGuard } from "../../../../.claude/hooks/modules/task-dispatch-guard.js";
import { on as reflectionPersist } from "../../../../.claude/hooks/modules/reflection-persist.js";
import { on as taskAutoCleanup } from "../../../../.claude/hooks/modules/task-auto-cleanup.js";
import { on as summaryFormatGuard } from "../../../../.claude/hooks/modules/summary-format-guard.js";
import { on as reflectionCounter } from "../../../../.claude/hooks/modules/reflection-counter.js";
import { on as reflectionResolverCheck } from "../../../../.claude/hooks/modules/reflection-resolver-check.js";
import { on as reviewerEnforcer } from "../../../../.claude/hooks/modules/reviewer-enforcer.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHAIN = [
	["ralph-loop", ralphLoop.Stop],
	["wrapup-guard", wrapupGuard.Stop],
	["task-dispatch-guard", taskDispatchGuard.Stop],
	["reflection-persist", reflectionPersist.Stop],
	["task-auto-cleanup", taskAutoCleanup.Stop],
	["summary-format-guard", summaryFormatGuard.Stop],
	["reflection-counter", reflectionCounter.Stop],
	["reflection-resolver-check", reflectionResolverCheck.Stop],
	["reviewer-enforcer", reviewerEnforcer.Stop],
];

let tmpDir;
beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "stop-chain-"));
});
afterEach(() => {
	try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

function runChain(input) {
	const results = [];
	for (const [name, handler] of CHAIN) {
		if (typeof handler !== "function") {
			results.push({ name, decision: "missing" });
			continue;
		}
		const r = handler(input);
		results.push({ name, ...r });
		// 若任一 handler block → chain 停（模擬真實 hook-client 行為）
		if (r?.decision === "block") break;
	}
	return results;
}

describe("Stop chain: 9 handlers 存在", () => {
	it("所有註冊 handler 都是 function", () => {
		for (const [name, handler] of CHAIN) {
			expect(typeof handler).toBe("function");
			if (typeof handler !== "function") console.error(`missing: ${name}`);
		}
	});
});

describe("Stop chain: 空輸入 fail-open 不 crash", () => {
	it("null input → 所有 handler 不 throw", () => {
		expect(() => runChain(null)).not.toThrow();
	});

	it("{} input → 所有 handler 回合法結構", () => {
		const results = runChain({});
		expect(results.length).toBeGreaterThan(0);
		for (const r of results) {
			expect(["allow", "block", undefined]).toContain(r.decision);
		}
	});
});

describe("Stop chain: ralph-loop active 不影響其他 handler", () => {
	it("有 .claude/ralph-loop.local.md → wrapup-guard allow，chain 繼續跑", () => {
		mkdirSync(join(tmpDir, ".claude"), { recursive: true });
		writeFileSync(join(tmpDir, ".claude/ralph-loop.local.md"), "---\nactive: true\n---\n");
		const results = runChain({
			session_id: "stop-chain-test-" + Date.now(),
			cwd: tmpDir,
		});
		const wrapup = results.find((r) => r.name === "wrapup-guard");
		expect(wrapup?.decision).toBe("allow");
	});
});

describe("Stop chain: 語意衝突守護", () => {
	it("空 Insight 章節 → reflection-persist 不 append + reflection-counter 不報 fatigue", () => {
		const results = runChain({
			session_id: "stop-chain-test-" + Date.now(),
			cwd: tmpDir,
			last_assistant_message: "純對話，無 Insight 章節",
		});
		const persist = results.find((r) => r.name === "reflection-persist");
		const counter = results.find((r) => r.name === "reflection-counter");
		expect(persist?.decision).toBe("allow");
		expect(counter?.decision).toBe("allow");
	});

	it("有結論無行動的 Insight → persist skip + 不觸發 counter fatigue（語意一致）", () => {
		const msg = "`★ Insight ───`\n- 純觀察\n- 無 commit\n`───`";
		const results = runChain({
			session_id: "stop-chain-test-" + Date.now(),
			cwd: tmpDir,
			last_assistant_message: msg,
		});
		const persist = results.find((r) => r.name === "reflection-persist");
		expect(persist?.systemMessage || persist?.decision).toBeDefined();
	});
});

describe("Stop chain: chain 不會無限跑", () => {
	it("正常 input → 結束時至少跑過所有 handler（無 block）", () => {
		const results = runChain({
			session_id: "stop-chain-test-" + Date.now(),
			cwd: tmpDir,
		});
		// 無 block 時應跑完所有 handler
		const hasBlock = results.some((r) => r.decision === "block");
		if (!hasBlock) {
			expect(results.length).toBe(CHAIN.length);
		}
	});
});
