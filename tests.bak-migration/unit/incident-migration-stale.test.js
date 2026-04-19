// ADR-013 Phase 1 T6 fixture + T7 migration 5 test
// 對齊 spec/進行中/adr-013-phase-1-mvp.md §T6 / §T7

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, utimesSync } from "node:fs";

const MIGRATION_PATH = join(homedir(), ".claude/scripts/incident-migration.js");
const INCIDENTS_DIR = join(homedir(), ".claude/obsidian/episodic/incidents");

describe("T6 DRAFT 7d stale fixture — 3 boundary case", () => {
	const fixtures = [];

	beforeEach(() => { fixtures.length = 0; });
	afterEach(() => {
		for (const f of fixtures) { try { rmSync(f); } catch {} }
	});

	function createFixture(name, ageMs) {
		const path = join(INCIDENTS_DIR, name);
		writeFileSync(path, "---\nstatus: draft\n---\n# fixture\n");
		const now = Date.now();
		const t = (now - ageMs) / 1000;
		utimesSync(path, t, t);
		fixtures.push(path);
		return path;
	}

	function isStale(filePath, staleMs = 7 * 24 * 60 * 60 * 1000) {
		const fs = require("node:fs");
		const st = fs.statSync(filePath);
		return Date.now() - st.mtimeMs > staleMs;
	}

	it("Case: 7d+1s 的 DRAFT 檔 → stale = true", () => {
		const path = createFixture(`__t6_test_old-DRAFT-2026-01-01.md`, 7 * 24 * 60 * 60 * 1000 + 1000);
		expect(isStale(path)).toBe(true);
	});

	it("Case: 6d23h59m 邊界內 DRAFT → stale = false", () => {
		const path = createFixture(`__t6_test_boundary-DRAFT-2026-01-02.md`, 6 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000);
		expect(isStale(path)).toBe(false);
	});

	it("Case: 剛建的 fresh DRAFT → stale = false", () => {
		const path = createFixture(`__t6_test_fresh-DRAFT-2026-01-03.md`, 0);
		expect(isStale(path)).toBe(false);
	});
});

describe("T7 incident-migration — 2 test", () => {
	const fixturePaths = [];

	beforeEach(() => { fixturePaths.length = 0; });
	afterEach(() => {
		for (const f of fixturePaths) { try { rmSync(f); } catch {} }
	});

	function createIncidentFixture(name, frontmatter) {
		const path = join(INCIDENTS_DIR, name);
		writeFileSync(path, `---\n${frontmatter}\n---\n# ${name}\n`);
		fixturePaths.push(path);
		return path;
	}

	it("migration idempotent: 已有 upgraded_to 的 incident 不被重複改", async () => {
		const { migrateIncidents } = await import(`${MIGRATION_PATH}?t=${Date.now()}`);
		const path = createIncidentFixture(`__t7_test_already-ok.md`, "status: resolved\nupgraded_to: rules/test.md");
		const before = readFileSync(path, "utf-8");
		const r = migrateIncidents();
		expect(r.alreadyOk).toBeGreaterThanOrEqual(1);
		const after = readFileSync(path, "utf-8");
		expect(after).toBe(before); // idempotent — 不改
	});

	it("migration 補 upgraded_to: null: 缺 key 的 incident 被補上", async () => {
		const { migrateIncidents } = await import(`${MIGRATION_PATH}?t=${Date.now()}-2`);
		const path = createIncidentFixture(`__t7_test_missing-key.md`, "status: open");
		const r = migrateIncidents();
		expect(r.migrated).toBeGreaterThanOrEqual(1);
		const after = readFileSync(path, "utf-8");
		expect(after).toMatch(/upgraded_to:\s*null/);
	});
});
