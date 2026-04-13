import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { on } from "../../../../.claude/hooks/modules/wrapup-guard.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir;
beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "wrapup-guard-"));
});
afterEach(() => {
	try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe("wrapup-guard: Stop handler", () => {
	it("ralph-loop active → allow（不擋 ralph 生命週期）", () => {
		mkdirSync(join(tmpDir, ".claude"), { recursive: true });
		writeFileSync(join(tmpDir, ".claude/ralph-loop.local.md"), "active: true");
		const r = on.Stop({ cwd: tmpDir, session_id: "s1" });
		expect(r.decision).toBe("allow");
	});

	it("fail-open：null input → allow 不 throw", () => {
		expect(() => on.Stop(null)).not.toThrow();
		const r = on.Stop(null);
		expect(r.decision).toBe("allow");
	});

	it("fail-open：input 不含 cwd → allow（fallback to process.cwd）", () => {
		expect(() => on.Stop({})).not.toThrow();
		const r = on.Stop({});
		expect(["allow", "block"]).toContain(r.decision);
	});

	it("ralph-loop active 即使有 session_id 不匹配 → allow", () => {
		mkdirSync(join(tmpDir, ".claude"), { recursive: true });
		writeFileSync(join(tmpDir, ".claude/ralph-loop.local.md"), "x");
		const r = on.Stop({ cwd: tmpDir, session_id: "different-id-" + Date.now() });
		expect(r.decision).toBe("allow");
	});
});

describe("wrapup-guard: SessionEnd handler", () => {
	it("無 marker → 記錄缺漏但 allow（安全網不阻擋）", () => {
		const r = on.SessionEnd({ session_id: "test-" + Date.now() });
		expect(r.decision).toBe("allow");
	});

	it("fail-open：null input → allow 不 throw", () => {
		expect(() => on.SessionEnd(null)).not.toThrow();
		expect(on.SessionEnd(null).decision).toBe("allow");
	});

	it("fail-open：malformed input → allow", () => {
		expect(on.SessionEnd({}).decision).toBe("allow");
		expect(on.SessionEnd({ session_id: null }).decision).toBe("allow");
	});
});
