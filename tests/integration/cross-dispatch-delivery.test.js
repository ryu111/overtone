// cross-dispatch-delivery.test.js — 收發機制整合測試（紅燈先行）
// 定義期望行為，Phase 2 實作後轉綠燈

import { describe, test, expect, beforeEach, afterEach } from "bun:test";

const BASE = "http://127.0.0.1:3457";
const SOURCE_CWD = "/Users/sbu/projects/nova-brain";
const TARGET_CWD = "/Users/sbu/projects/nova-manager";

async function dispatch(prompt, opts = {}) {
	const res = await fetch(`${BASE}/api/cross-dispatch`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			target_cwd: opts.target_cwd || TARGET_CWD,
			source_cwd: opts.source_cwd || SOURCE_CWD,
			prompt,
			priority: opts.priority || "normal",
		}),
		signal: AbortSignal.timeout(5000),
	});
	return res.json();
}

async function getDispatch(id) {
	const res = await fetch(`${BASE}/api/cross-dispatch?id=${id}`, {
		signal: AbortSignal.timeout(3000),
	});
	return res.json();
}

async function acknowledge(id) {
	const res = await fetch(`${BASE}/api/cross-dispatch/acknowledge`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id }),
		signal: AbortSignal.timeout(3000),
	});
	return res.json();
}

async function complete(id, summary) {
	const res = await fetch(`${BASE}/api/cross-dispatch/complete`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id, summary }),
		signal: AbortSignal.timeout(3000),
	});
	return res.json();
}

// 前置條件：nova-server 必須在線
let serverOnline = false;
try {
	const res = await fetch(`${BASE}/api/cross-dispatch`, { signal: AbortSignal.timeout(2000) });
	serverOnline = res.ok;
} catch { /* offline */ }

describe.skipIf(!serverOnline)("cross-dispatch delivery 整合測試", () => {
	const createdIds = [];

	afterEach(async () => {
		// 清理：完成所有測試建立的 dispatch
		for (const id of createdIds) {
			try { await complete(id, "[test cleanup]"); } catch { /* ignore */ }
		}
		createdIds.length = 0;
	});

	test("1. dispatch → status=pending → acknowledge → status=acknowledged", async () => {
		const result = await dispatch("整合測試 1");
		expect(result.ok).toBe(true);
		createdIds.push(result.id);

		// 初始狀態
		const d1 = await getDispatch(result.id);
		expect(["pending", "delivered"]).toContain(d1.status);

		// acknowledge
		const ackResult = await acknowledge(result.id);
		expect(ackResult.ok).toBe(true);

		// 確認狀態
		const d2 = await getDispatch(result.id);
		expect(d2.status).toBe("acknowledged");
	});

	test("2. dispatch → complete → status=completed + summary", async () => {
		const result = await dispatch("整合測試 2");
		createdIds.push(result.id);

		await complete(result.id, "測試完成摘要");

		const d = await getDispatch(result.id);
		expect(d.status).toBe("completed");
		expect(d.summary).toBe("測試完成摘要");
	});

	test("3. 連發 2 dispatch 同 target → 兩個都有獨立 id", async () => {
		const r1 = await dispatch("連發測試 A");
		const r2 = await dispatch("連發測試 B");
		createdIds.push(r1.id, r2.id);

		expect(r1.id).not.toBe(r2.id);
		expect(r1.ok).toBe(true);
		expect(r2.ok).toBe(true);
	});

	test("4. complete 後 GET ?id= 仍可查到（含 completed 狀態）", async () => {
		const result = await dispatch("歸檔測試");
		createdIds.push(result.id);

		await complete(result.id, "已完成");

		const d = await getDispatch(result.id);
		expect(d).toBeDefined();
		expect(d.status).toBe("completed");
	});

	test("5. delivery 失敗不改狀態（task 有 deliveryAttempts 欄位）", async () => {
		// dispatch 到不存在的 target → delivery 失敗
		const result = await dispatch("delivery 失敗測試", {
			target_cwd: "/nonexistent/path",
		});
		createdIds.push(result.id);

		const d = await getDispatch(result.id);
		// 應保持 pending（delivery 失敗不改狀態）
		expect(d.status).toBe("pending");
		// 期望有 deliveryAttempts 追蹤（Phase 2 實作後生效）
		expect(typeof d.deliveryAttempts).toBe("number");
	});

	test("6. acknowledged 超 1h → stale: true", async () => {
		// 這個測試需要 Phase 2 的 scanStale 實作
		// 目前只驗證 GET /api/cross-dispatch/stale endpoint 存在
		try {
			const res = await fetch(`${BASE}/api/cross-dispatch/stale`, {
				signal: AbortSignal.timeout(3000),
			});
			expect(res.ok).toBe(true);
			const data = await res.json();
			expect(Array.isArray(data)).toBe(true);
		} catch (e) {
			// endpoint 不存在時 FAIL（紅燈預期）
			expect(e).toBeUndefined();
		}
	});

	test("7. GET /api/cross-dispatch/stale → 回傳 stale tasks array", async () => {
		const res = await fetch(`${BASE}/api/cross-dispatch/stale`, {
			signal: AbortSignal.timeout(3000),
		});
		expect(res.ok).toBe(true);
		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
	});

	test("8. dispatch 回傳含 deliveryScheduled 欄位", async () => {
		const result = await dispatch("排程測試");
		createdIds.push(result.id);

		// Phase 2 實作後，POST 回傳應含 deliveryScheduled: true
		expect(result.ok).toBe(true);
		expect(result.deliveryScheduled).toBe(true);
	});
});
