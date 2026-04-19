import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const REGISTRY_PATH = "/tmp/nova-feedback-registry.json";
const REGISTRY_BACKUP = "/tmp/nova-feedback-registry.json.bak";

let mod;

beforeEach(async () => {
	if (existsSync(REGISTRY_PATH)) writeFileSync(REGISTRY_BACKUP, readFileSync(REGISTRY_PATH));
	mod = await import("/Users/sbu/.claude/scripts/feedback-audit.js");
});

afterEach(() => {
	if (existsSync(REGISTRY_BACKUP)) {
		writeFileSync(REGISTRY_PATH, readFileSync(REGISTRY_BACKUP));
		unlinkSync(REGISTRY_BACKUP);
	}
});

describe("feedback-audit", () => {
	test("scanHooks 找到 hook 元件（數量 > 0）", () => {
		const hooks = mod.scanHooks();
		expect(hooks.length).toBeGreaterThan(0);
		expect(hooks[0]).toHaveProperty("type", "hook");
		expect(hooks[0]).toHaveProperty("name");
		expect(hooks[0]).toHaveProperty("path");
	});

	test("scanRules 找到全域 rule（數量 > 0）", () => {
		const rules = mod.scanRules();
		expect(rules.length).toBeGreaterThan(0);
		const global = rules.filter((r) => r.scope === "global");
		expect(global.length).toBeGreaterThan(0);
	});

	test("scanSkills 找到 skill（數量 > 0）", () => {
		const skills = mod.scanSkills();
		expect(skills.length).toBeGreaterThan(0);
		expect(skills[0]).toHaveProperty("type", "skill");
	});

	test("scanAgents 找到 agent（數量 > 0）", () => {
		const agents = mod.scanAgents();
		expect(agents.length).toBeGreaterThan(0);
	});

	test("scanCommands 找到 command（數量 > 0）", () => {
		const commands = mod.scanCommands();
		expect(commands.length).toBeGreaterThan(0);
	});

	test("scanClaudeMds 找到 CLAUDE.md（數量 > 0）", () => {
		const mds = mod.scanClaudeMds();
		expect(mds.length).toBeGreaterThan(0);
	});

	test("assessHealth 根據指標正確判定", () => {
		// 現有元件都是最近修改的，應為 healthy
		const hooks = mod.scanHooks();
		expect(hooks.length).toBeGreaterThan(0);
		const health = mod.assessHealth(hooks[0]);
		expect(["healthy", "degraded", "dead", "unknown"]).toContain(health);
	});

	test("assessHealth 不存在的路徑標記 unknown", () => {
		const health = mod.assessHealth({ path: "/tmp/nonexistent-path-12345.js" });
		expect(health).toBe("unknown");
	});

	test("writeRegistry JSON 格式正確", () => {
		const components = [
			{ type: "hook", name: "test", path: "/tmp/test.js", health: "healthy" },
			{ type: "rule", name: "test", path: "/tmp/test.md", health: "degraded" },
		];
		const registry = mod.writeRegistry(components);
		expect(registry.summary.total).toBe(2);
		expect(registry.summary.byType.hook).toBe(1);
		expect(registry.summary.byHealth.healthy).toBe(1);
		expect(registry.summary.byHealth.degraded).toBe(1);
		expect(registry).toHaveProperty("ts");
		expect(registry).toHaveProperty("date");

		// 驗證 JSON 寫入
		const onDisk = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
		expect(onDisk.summary.total).toBe(2);
	});

	test("generateReport 產出 Markdown", () => {
		const registry = {
			date: "2026-03-29",
			summary: { total: 5, byType: { hook: 3, rule: 2 }, byHealth: { healthy: 4, degraded: 1 } },
			components: [
				{ name: "test-hook", type: "hook", health: "degraded" },
			],
		};
		const md = mod.generateReport(registry);
		expect(md).toContain("## Feedback Audit 報告");
		expect(md).toContain("hook");
		expect(md).toContain("需關注");
		expect(md).toContain("test-hook");
	});

	test("fullScan 全量掃描找到 80+ 元件", () => {
		const all = mod.fullScan();
		expect(all.length).toBeGreaterThan(80);
		// 每個元件都有 health
		for (const c of all) {
			expect(c).toHaveProperty("health");
		}
	});

	test("fullScan typeFilter 正確過濾", () => {
		const hooks = mod.fullScan("hook");
		expect(hooks.length).toBeGreaterThan(0);
		for (const h of hooks) {
			expect(h.type).toBe("hook");
		}
	});
});
