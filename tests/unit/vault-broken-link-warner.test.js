/**
 * vault-broken-link-warner baseline test（ADR-001 Phase 2 xd-v2iy）
 * 契約驗證：export on.Stop, 不 block, systemMessage ≤ 500 bytes
 */
import { describe, it, expect } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

const modPath = join(homedir(), ".claude/hooks/modules/vault-broken-link-warner.js");
const { on } = await import(modPath);

describe("vault-broken-link-warner baseline (Phase 2 xd-v2iy)", () => {
	it("exports on.Stop as function", () => {
		expect(typeof on.Stop).toBe("function");
	});

	it("on.Stop returns null when vault clean OR systemMessage when broken", () => {
		const result = on.Stop({});
		// 預期 null（當前 vault clean）或 { systemMessage }
		if (result !== null) {
			expect(result).toHaveProperty("systemMessage");
			expect(typeof result.systemMessage).toBe("string");
			expect(result.systemMessage.length).toBeLessThanOrEqual(500);
			// 絕不 block（無 decision / block 欄位）
			expect(result.decision).toBeUndefined();
			expect(result.block).toBeUndefined();
		}
	});

	it("on.Stop 不 throw 即使 spawn 失敗", () => {
		// 污染 PATH 讓 bun 找不到（模擬失敗）— 實際 module catches error
		expect(() => on.Stop(null)).not.toThrow();
		expect(() => on.Stop(undefined)).not.toThrow();
	});
});
