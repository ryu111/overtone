import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
	findCompletedTasks,
	deleteFiles,
	cleanupOnStop,
} from "../../../../.claude/hooks/modules/task-auto-cleanup.js";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpRoot;

function writeTask(sessionId, taskId, status, extra = {}) {
	const dir = join(tmpRoot, sessionId);
	mkdirSync(dir, { recursive: true });
	const task = { id: taskId, subject: `task ${taskId}`, description: "", status, blocks: [], blockedBy: [], ...extra };
	writeFileSync(join(dir, `${taskId}.json`), JSON.stringify(task, null, 2));
}

beforeEach(() => {
	tmpRoot = mkdtempSync(join(tmpdir(), "task-cleanup-"));
});
afterEach(() => {
	try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

describe("findCompletedTasks", () => {
	it("只抓 status=completed", () => {
		writeTask("s1", "1", "completed");
		writeTask("s1", "2", "pending");
		writeTask("s1", "3", "in_progress");
		writeTask("s1", "4", "completed");
		const out = findCompletedTasks("s1", tmpRoot);
		expect(out.length).toBe(2);
	});

	it("空 session 目錄 → []", () => {
		mkdirSync(join(tmpRoot, "empty"), { recursive: true });
		expect(findCompletedTasks("empty", tmpRoot)).toEqual([]);
	});

	it("session 目錄不存在 → []", () => {
		expect(findCompletedTasks("missing", tmpRoot)).toEqual([]);
	});

	it("session_id 為空 → []", () => {
		expect(findCompletedTasks(null, tmpRoot)).toEqual([]);
		expect(findCompletedTasks("", tmpRoot)).toEqual([]);
	});

	it("跳過非 .json / 隱藏檔（.highwatermark / .lock）", () => {
		const dir = join(tmpRoot, "s2");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, ".highwatermark"), "10");
		writeFileSync(join(dir, ".lock"), "");
		writeFileSync(join(dir, "readme.txt"), "not a task");
		writeTask("s2", "5", "completed");
		expect(findCompletedTasks("s2", tmpRoot).length).toBe(1);
	});

	it("壞 JSON 跳過不 crash", () => {
		const dir = join(tmpRoot, "s3");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "broken.json"), "{ invalid json");
		writeTask("s3", "6", "completed");
		expect(findCompletedTasks("s3", tmpRoot).length).toBe(1);
	});
});

describe("deleteFiles", () => {
	it("刪除存在的檔案", () => {
		writeTask("sD", "1", "completed");
		const paths = findCompletedTasks("sD", tmpRoot);
		expect(deleteFiles(paths)).toBe(1);
		expect(existsSync(paths[0])).toBe(false);
	});

	it("刪除不存在的檔案不 crash", () => {
		expect(deleteFiles(["/tmp/definitely-not-exists-xyz.json"])).toBe(0);
	});
});

describe("cleanupOnStop 整合", () => {
	it("session 有 3 completed + 2 pending → 只刪 3 個", () => {
		writeTask("sA", "1", "completed");
		writeTask("sA", "2", "completed");
		writeTask("sA", "3", "completed");
		writeTask("sA", "4", "pending");
		writeTask("sA", "5", "in_progress");
		cleanupOnStop({ session_id: "sA" }, { root: tmpRoot });
		const remaining = readdirSync(join(tmpRoot, "sA")).filter((f) => f.endsWith(".json"));
		expect(remaining.length).toBe(2);
		// 驗證剩下的是 pending 和 in_progress
		const remainingIds = remaining.map((f) => f.replace(".json", "")).sort();
		expect(remainingIds).toEqual(["4", "5"]);
	});

	it("其他 session 不動（session 隔離）", () => {
		writeTask("me", "1", "completed");
		writeTask("other", "1", "completed");
		cleanupOnStop({ session_id: "me" }, { root: tmpRoot });
		expect(existsSync(join(tmpRoot, "me/1.json"))).toBe(false);
		expect(existsSync(join(tmpRoot, "other/1.json"))).toBe(true);
	});

	it("無 session_id → fail-open 回 allow 不 crash", () => {
		expect(() => cleanupOnStop({}, { root: tmpRoot })).not.toThrow();
		expect(cleanupOnStop({}, { root: tmpRoot }).decision).toBe("allow");
	});

	it("目錄不存在 → allow 不 crash", () => {
		expect(cleanupOnStop({ session_id: "ghost" }, { root: tmpRoot }).decision).toBe("allow");
	});

	it("全部 pending → 什麼都不刪", () => {
		writeTask("sP", "1", "pending");
		writeTask("sP", "2", "in_progress");
		cleanupOnStop({ session_id: "sP" }, { root: tmpRoot });
		expect(readdirSync(join(tmpRoot, "sP")).length).toBe(2);
	});
});
