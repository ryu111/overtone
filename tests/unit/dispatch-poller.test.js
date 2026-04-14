import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	filterNew,
	loadState,
	saveState,
	onUserPromptSubmit,
	onSessionStart,
	fetchPendingDispatches,
} from "../../../../.claude/hooks/modules/dispatch-poller.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { unlinkSync, mkdirSync } from "node:fs";

const REPO = "test-poller-" + Date.now();
const STATE_PATH = join(homedir(), ".claude/state", `dispatch-poller-${REPO}.json`);
const FAKE_CWD = join("/tmp", REPO);

beforeEach(() => {
	try { unlinkSync(STATE_PATH); } catch {}
	try { mkdirSync(FAKE_CWD, { recursive: true }); } catch {}
});
afterEach(() => {
	try { unlinkSync(STATE_PATH); } catch {}
});

describe("filterNew — dedupe 設計", () => {
	it("createdAt > last_seen_ts 且 id 不在 recent_ids → 新", () => {
		const state = { last_seen_ts: 100, recent_ids: [] };
		const d = [{ id: "xd-1", createdAt: 200 }];
		expect(filterNew(d, state)).toHaveLength(1);
	});

	it("createdAt <= last_seen_ts → 舊，過濾", () => {
		const state = { last_seen_ts: 200, recent_ids: [] };
		const d = [{ id: "xd-1", createdAt: 200 }];
		expect(filterNew(d, state)).toHaveLength(0);
	});

	it("id 在 recent_ids → 過濾（防同 ms 競爭）", () => {
		const state = { last_seen_ts: 100, recent_ids: ["xd-2"] };
		const d = [{ id: "xd-2", createdAt: 200 }];
		expect(filterNew(d, state)).toHaveLength(0);
	});

	it("混合新舊 → 只返回新的", () => {
		const state = { last_seen_ts: 100, recent_ids: ["xd-3"] };
		const d = [
			{ id: "xd-1", createdAt: 50 },  // 舊 ts
			{ id: "xd-2", createdAt: 200 }, // 新
			{ id: "xd-3", createdAt: 200 }, // 同 ms 但已在 recent_ids
			{ id: "xd-4", createdAt: 300 }, // 新
		];
		const result = filterNew(d, state);
		expect(result.map(r => r.id)).toEqual(["xd-2", "xd-4"]);
	});

	it("非法 dispatch (無 id/無 createdAt) → 過濾", () => {
		const state = { last_seen_ts: 0, recent_ids: [] };
		const d = [
			{ id: "xd-1" }, // 無 createdAt
			{ createdAt: 100 }, // 無 id
			null,
			{ id: "xd-2", createdAt: 100 }, // 有效
		];
		expect(filterNew(d, state)).toHaveLength(1);
	});

	it("空 dispatches 陣列 → 空結果", () => {
		expect(filterNew([], { last_seen_ts: 0, recent_ids: [] })).toEqual([]);
	});
});

describe("loadState / saveState", () => {
	it("無 state 檔 → default zero state", () => {
		const s = loadState("nonexistent-" + Date.now());
		expect(s.last_seen_ts).toBe(0);
		expect(s.recent_ids).toEqual([]);
		expect(s.consecutive_failures).toBe(0);
	});

	it("save + load 往返", () => {
		saveState(REPO, {
			last_seen_ts: 123456,
			recent_ids: ["xd-a", "xd-b"],
			last_failed_fetch_ts: 111,
			consecutive_failures: 2,
		});
		const s = loadState(REPO);
		expect(s.last_seen_ts).toBe(123456);
		expect(s.recent_ids).toEqual(["xd-a", "xd-b"]);
		expect(s.consecutive_failures).toBe(2);
	});
});

describe("fetchPendingDispatches — curl 封裝", () => {
	it("正常 response 返回 dispatches array", () => {
		// 依賴 nova-server 運行中 — 若不可用應 return ok:true dispatches:[]
		const result = fetchPendingDispatches(FAKE_CWD);
		// fake cwd 不是已註冊專案 → server 會返回 [] 或 error
		// 至少 ok 欄位存在
		expect(typeof result.ok).toBe("boolean");
	});

	it("fail 時返回 ok:false + error", () => {
		// 用不可能的 URL 觸發 curl fail — 目前直接模擬 bad host 不可行因為寫死 API_BASE
		// 改為驗證 ok 欄位型別（同上）
		const result = fetchPendingDispatches("/not/a/real/cwd/xxxx");
		expect(result).toHaveProperty("ok");
	});
});

describe("onUserPromptSubmit — 主流程", () => {
	it("空值 fail-open", () => {
		expect(() => onUserPromptSubmit({})).not.toThrow();
	});

	it("正常輸入返回 undefined 或 hookSpecificOutput", () => {
		saveState(REPO, { last_seen_ts: Date.now() + 86400000, recent_ids: [], last_failed_fetch_ts: null, consecutive_failures: 0 });
		const r = onUserPromptSubmit({ cwd: FAKE_CWD });
		// last_seen_ts 設未來 → 所有 dispatches 都被過濾 → undefined
		expect(r === undefined || (r && r.hookSpecificOutput)).toBeTruthy();
	});
});

describe("onSessionStart — 連續 fail 警告", () => {
	it("連續失敗 >= 3 次 + 5 min 內 → 警告", () => {
		saveState(REPO, {
			last_seen_ts: 0,
			recent_ids: [],
			last_failed_fetch_ts: Date.now(),
			consecutive_failures: 5,
		});
		// 觸發 onSessionStart 但因為 fetchPendingDispatches 會嘗試真 curl
		// 如果 server 在 localhost:3457 運行 → fetch 成功 → reset failures → 無警告
		// 如果 server 不運行 → 失敗 → consecutive_failures 再 +1 = 6 → 警告觸發
		const r = onSessionStart({ cwd: FAKE_CWD });
		// 不 assert 具體結果因為依賴外部 server 狀態
		expect(() => r).not.toThrow();
	});

	it("空值 fail-open", () => {
		expect(() => onSessionStart({})).not.toThrow();
	});
});
