import { test } from "bun:test";
import { strictEqual, deepEqual } from "node:assert";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { findCompletedTasks, deleteFiles, cleanupOnStop } from "../../../../.claude/hooks/modules/task-auto-cleanup.js";

function createTestDir(name = "test-tasks") {
	const tmpRoot = join(tmpdir(), name);
	if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
	mkdirSync(tmpRoot, { recursive: true });
	return tmpRoot;
}

test("findCompletedTasks 無目錄時回傳空陣列", () => {
	const tmpRoot = createTestDir("test-1");
	const completed = findCompletedTasks("nonexistent", tmpRoot);
	strictEqual(completed.length, 0);
	rmSync(tmpRoot, { recursive: true, force: true });
});

test("findCompletedTasks 篩選出 status=completed 的 task", () => {
	const tmpRoot = createTestDir("test-2");
	const sessionId = "session-123";
	const sessionDir = join(tmpRoot, sessionId);
	mkdirSync(sessionDir, { recursive: true });

	writeFileSync(join(sessionDir, "task-1.json"), JSON.stringify({ id: "1", status: "pending" }));
	writeFileSync(join(sessionDir, "task-2.json"), JSON.stringify({ id: "2", status: "completed" }));
	writeFileSync(join(sessionDir, "task-3.json"), JSON.stringify({ id: "3", status: "in_progress" }));
	writeFileSync(join(sessionDir, "task-4.json"), JSON.stringify({ id: "4", status: "completed" }));

	const completed = findCompletedTasks(sessionId, tmpRoot);
	strictEqual(completed.length, 2);
	deepEqual(
		completed.map((p) => p.split("/").pop()).sort(),
		["task-2.json", "task-4.json"]
	);

	rmSync(tmpRoot, { recursive: true, force: true });
});

test("findCompletedTasks 跳過 .highwatermark 等隱檔", () => {
	const tmpRoot = createTestDir("test-3");
	const sessionId = "session-456";
	const sessionDir = join(tmpRoot, sessionId);
	mkdirSync(sessionDir, { recursive: true });

	writeFileSync(join(sessionDir, "task-1.json"), JSON.stringify({ status: "completed" }));
	writeFileSync(join(sessionDir, ".highwatermark"), JSON.stringify({ completed: true }));

	const completed = findCompletedTasks(sessionId, tmpRoot);
	strictEqual(completed.length, 1);

	rmSync(tmpRoot, { recursive: true, force: true });
});

test("findCompletedTasks 忽略壞 json 檔案", () => {
	const tmpRoot = createTestDir("test-4");
	const sessionId = "session-789";
	const sessionDir = join(tmpRoot, sessionId);
	mkdirSync(sessionDir, { recursive: true });

	writeFileSync(join(sessionDir, "task-1.json"), JSON.stringify({ status: "completed" }));
	writeFileSync(join(sessionDir, "task-2.json"), "invalid json");

	const completed = findCompletedTasks(sessionId, tmpRoot);
	strictEqual(completed.length, 1);

	rmSync(tmpRoot, { recursive: true, force: true });
});

test("deleteFiles 成功刪除檔案並回傳數量", () => {
	const tmpRoot = createTestDir("test-5");
	const f1 = join(tmpRoot, "file-1.txt");
	const f2 = join(tmpRoot, "file-2.txt");

	writeFileSync(f1, "content-1");
	writeFileSync(f2, "content-2");

	const n = deleteFiles([f1, f2]);
	strictEqual(n, 2);
	strictEqual(existsSync(f1), false);
	strictEqual(existsSync(f2), false);

	rmSync(tmpRoot, { recursive: true, force: true });
});

test("deleteFiles 忽略已不存在的檔案，繼續刪其他的", () => {
	const tmpRoot = createTestDir("test-6");
	const f1 = join(tmpRoot, "file-1.txt");
	const f2 = join(tmpRoot, "file-2.txt");
	const f3 = join(tmpRoot, "nonexistent.txt");

	writeFileSync(f1, "content-1");
	writeFileSync(f2, "content-2");

	const n = deleteFiles([f1, f3, f2]);
	strictEqual(n, 2);
	strictEqual(existsSync(f1), false);
	strictEqual(existsSync(f2), false);

	rmSync(tmpRoot, { recursive: true, force: true });
});

test("cleanupOnStop 無 session_id 時回傳 allow", () => {
	const result = cleanupOnStop({});
	deepEqual(result, { decision: "allow" });
});

test("cleanupOnStop 無 completed task 時回傳 allow", () => {
	const tmpRoot = createTestDir("test-7");
	const sessionId = "session-new";
	const sessionDir = join(tmpRoot, sessionId);
	mkdirSync(sessionDir, { recursive: true });

	writeFileSync(join(sessionDir, "task-1.json"), JSON.stringify({ status: "pending" }));

	const result = cleanupOnStop({ session_id: sessionId }, { root: tmpRoot });
	deepEqual(result, { decision: "allow" });

	rmSync(tmpRoot, { recursive: true, force: true });
});

test("cleanupOnStop 刪除 completed task 後回傳 allow", () => {
	const tmpRoot = createTestDir("test-8");
	const sessionId = "session-cleanup";
	const sessionDir = join(tmpRoot, sessionId);
	mkdirSync(sessionDir, { recursive: true });

	const completedPath = join(sessionDir, "task-1.json");
	writeFileSync(completedPath, JSON.stringify({ status: "completed" }));
	writeFileSync(join(sessionDir, "task-2.json"), JSON.stringify({ status: "pending" }));

	strictEqual(existsSync(completedPath), true);

	const result = cleanupOnStop({ session_id: sessionId }, { root: tmpRoot });
	deepEqual(result, { decision: "allow" });
	strictEqual(existsSync(completedPath), false);
	strictEqual(existsSync(join(sessionDir, "task-2.json")), true);

	rmSync(tmpRoot, { recursive: true, force: true });
});

test("cleanupOnStop session 隔離：只動自己的 session，其他 session task 不動", () => {
	const tmpRoot = createTestDir("test-9");
	const mySession = "session-me";
	const otherSession = "session-other";

	const myDir = join(tmpRoot, mySession);
	const otherDir = join(tmpRoot, otherSession);
	mkdirSync(myDir, { recursive: true });
	mkdirSync(otherDir, { recursive: true });

	const myCompleted = join(myDir, "task-1.json");
	const otherCompleted = join(otherDir, "task-1.json");
	writeFileSync(myCompleted, JSON.stringify({ status: "completed" }));
	writeFileSync(otherCompleted, JSON.stringify({ status: "completed" }));

	cleanupOnStop({ session_id: mySession }, { root: tmpRoot });

	strictEqual(existsSync(myCompleted), false, "自己 session 的 completed task 應被刪除");
	strictEqual(existsSync(otherCompleted), true, "其他 session 的 task 不應被動");

	rmSync(tmpRoot, { recursive: true, force: true });
});

test("cleanupOnStop fail-open：錯誤發生時仍回傳 allow", () => {
	const result = cleanupOnStop({ session_id: null });
	deepEqual(result, { decision: "allow" });
});
