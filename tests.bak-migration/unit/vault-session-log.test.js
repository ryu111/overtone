/**
 * vault-session-log baseline test（ADR-001 Phase 2 xd-v2iy）
 * 契約 + side effect 驗證：append 到 raw/sessions/YYYY-MM-DD.md，不 throw
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync } from "node:fs";

const modPath = join(homedir(), ".claude/hooks/modules/vault-session-log.js");
const { on } = await import(modPath);

const sessionsDir = join(homedir(), ".claude/obsidian/raw/sessions");

describe("vault-session-log baseline (Phase 2 xd-v2iy)", () => {
	beforeAll(() => {
		mkdirSync(sessionsDir, { recursive: true });
	});

	it("exports on.Stop as function", () => {
		expect(typeof on.Stop).toBe("function");
	});

	it("on.Stop returns null (寫出型 hook 不返 decision)", () => {
		const result = on.Stop({
			cwd: "/tmp/test-project",
			tool_count: 3,
			duration_ms: 30000,
			last_insight: "baseline-test-marker",
		});
		expect(result).toBeNull();
	});

	it("append session line to raw/sessions/<today>.md", () => {
		const today = new Date().toISOString().slice(0, 10);
		const file = join(sessionsDir, `${today}.md`);
		const before = existsSync(file) ? readFileSync(file, "utf8") : "";

		on.Stop({
			cwd: "/tmp/test-vault-session-log",
			tool_count: 7,
			duration_ms: 90000,
			last_insight: "vault-session-log-test-insight-XYZ",
		});

		expect(existsSync(file)).toBe(true);
		const after = readFileSync(file, "utf8");
		expect(after.length).toBeGreaterThan(before.length);
		expect(after).toContain("test-vault-session-log");
		expect(after).toContain("tools=7");
		expect(after).toContain("XYZ");
	});

	it("不 throw 於 payload 缺失", () => {
		expect(() => on.Stop({})).not.toThrow();
		expect(() => on.Stop(null)).not.toThrow();
		expect(() => on.Stop(undefined)).not.toThrow();
	});
});
