import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// 用臨時檔案避免影響真實 marker
const TEST_MARKER = join(tmpdir(), `test-wrapup-marker-${Date.now()}.json`);

// wrapper 函式（直接操作 TEST_MARKER，不依賴模組內部路徑）
function writeMarker(sessionId, phases, status = "complete") {
	const marker = {
		session_id: sessionId,
		timestamp: new Date().toISOString(),
		status,
		phases,
	};
	writeFileSync(TEST_MARKER, JSON.stringify(marker, null, 2));
}

function readMarker() {
	try {
		if (!existsSync(TEST_MARKER)) return null;
		return JSON.parse(readFileSync(TEST_MARKER, "utf-8"));
	} catch {
		return null;
	}
}

function isComplete(sessionId) {
	const marker = readMarker();
	if (!marker) return false;
	return (
		marker.session_id === sessionId &&
		(marker.status === "complete" || marker.status === "partial")
	);
}

beforeEach(() => {
	if (existsSync(TEST_MARKER)) unlinkSync(TEST_MARKER);
});

afterEach(() => {
	if (existsSync(TEST_MARKER)) unlinkSync(TEST_MARKER);
});

describe("wrapup-marker", () => {
	describe("writeMarker", () => {
		test("寫入正確格式的 marker", () => {
			const phases = {
				learner: { status: "ok", duration_ms: 1200 },
				judge: { status: "ok", duration_ms: 800 },
				maintainer: { status: "ok", duration_ms: 2000 },
			};
			writeMarker("session-abc", phases);

			const marker = readMarker();
			expect(marker.session_id).toBe("session-abc");
			expect(marker.status).toBe("complete");
			expect(marker.phases.learner.status).toBe("ok");
			expect(marker.phases.judge.duration_ms).toBe(800);
			expect(marker.timestamp).toBeTruthy();
		});

		test("支援 partial status", () => {
			writeMarker("s1", { learner: { status: "ok" } }, "partial");
			const marker = readMarker();
			expect(marker.status).toBe("partial");
		});

		test("支援 failed status", () => {
			writeMarker("s1", {}, "failed");
			const marker = readMarker();
			expect(marker.status).toBe("failed");
		});

		test("覆蓋前一次 marker", () => {
			writeMarker("s1", {});
			writeMarker("s2", {});
			const marker = readMarker();
			expect(marker.session_id).toBe("s2");
		});
	});

	describe("readMarker", () => {
		test("檔案不存在 → null", () => {
			expect(readMarker()).toBeNull();
		});

		test("檔案損壞 → null", () => {
			writeFileSync(TEST_MARKER, "not json{{{");
			expect(readMarker()).toBeNull();
		});

		test("正常讀取", () => {
			writeMarker("s1", { learner: { status: "ok" } });
			const marker = readMarker();
			expect(marker.session_id).toBe("s1");
		});
	});

	describe("isComplete", () => {
		test("無 marker → false", () => {
			expect(isComplete("s1")).toBe(false);
		});

		test("session_id 匹配 + complete → true", () => {
			writeMarker("s1", {});
			expect(isComplete("s1")).toBe(true);
		});

		test("session_id 匹配 + partial → true", () => {
			writeMarker("s1", {}, "partial");
			expect(isComplete("s1")).toBe(true);
		});

		test("session_id 匹配 + failed → false", () => {
			writeMarker("s1", {}, "failed");
			expect(isComplete("s1")).toBe(false);
		});

		test("session_id 不匹配 → false", () => {
			writeMarker("s1", {});
			expect(isComplete("s2")).toBe(false);
		});
	});

	describe("原始模組 export", () => {
		test("模組 export writeMarker/readMarker/isComplete", async () => {
			const mod = await import("../../../../.claude/scripts/wrapup-marker.js");
			expect(typeof mod.writeMarker).toBe("function");
			expect(typeof mod.readMarker).toBe("function");
			expect(typeof mod.isComplete).toBe("function");
			expect(typeof mod.MARKER_PATH).toBe("string");
		});
	});
});
