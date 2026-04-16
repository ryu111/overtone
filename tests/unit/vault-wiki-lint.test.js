// vault-wiki-lint.test.js — 驗證 scanVaultWikiLint 有實際偵測能力
// 動機：Nova × LLM Wiki 整合討論 Round 3 共識（spec/討論/llm-wiki-nova-integration-round3-ack.md）
//   Manager 驗收要求「lint 找出 ≥ 1 個真 issue」。當前真實 vault 經 _index.md 建立後 lint 回 0 findings，
//   為證明 lint 有實際偵測能力（非永遠回 0），用 fixture vault 跑 broken_link + orphan_page 案例。

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { homedir } from "node:os";
const { scanVaultWikiLint } = await import(
	`${homedir()}/.claude/scripts/lib/vault-wiki-lint.js`
);

describe("scanVaultWikiLint", () => {
	let fixtureRoot;

	beforeAll(() => {
		fixtureRoot = mkdtempSync(join(tmpdir(), "vault-lint-test-"));
		mkdirSync(join(fixtureRoot, "episodic/incidents"), { recursive: true });
		mkdirSync(join(fixtureRoot, "semantic/architecture-decisions"), {
			recursive: true,
		});

		writeFileSync(
			join(fixtureRoot, "_index.md"),
			"# Index\n\n- `episodic/incidents/xd-exists.md` — 存在的檔\n- `episodic/incidents/xd-broken.md` — 故意引用不存在的檔\n",
		);

		writeFileSync(
			join(fixtureRoot, "AGENTS.md"),
			"# AGENTS\n\n參考 `episodic/incidents/xd-exists.md`。\n",
		);

		writeFileSync(
			join(fixtureRoot, "episodic/incidents/xd-exists.md"),
			"# 存在的 incident\n\n內容。\n",
		);

		writeFileSync(
			join(fixtureRoot, "semantic/architecture-decisions/ADR-orphan.md"),
			"# 孤兒 ADR\n\n這個檔沒有被任何其他檔引用。\n",
		);
	});

	afterAll(() => {
		if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
	});

	it("應該偵測到 _index.md 引用的不存在檔案為 broken_link", () => {
		const findings = scanVaultWikiLint(fixtureRoot);
		const brokenLinks = findings.filter((f) => f.category === "broken_link");
		expect(brokenLinks.length).toBeGreaterThan(0);
		expect(
			brokenLinks.some((f) =>
				f.message.includes("episodic/incidents/xd-broken.md"),
			),
		).toBe(true);
	});

	it("應該偵測到 semantic/ADR-orphan.md 為 orphan_page（無檔案引用）", () => {
		const findings = scanVaultWikiLint(fixtureRoot);
		const orphans = findings.filter((f) => f.category === "orphan_page");
		expect(orphans.length).toBeGreaterThan(0);
		expect(
			orphans.some((f) => f.target.includes("ADR-orphan.md")),
		).toBe(true);
	});

	it("不應該把 _index.md / AGENTS.md / README.md 視為 orphan（豁免根目錄導航）", () => {
		const findings = scanVaultWikiLint(fixtureRoot);
		const orphans = findings.filter((f) => f.category === "orphan_page");
		expect(orphans.every((f) => !f.target.endsWith("/_index.md"))).toBe(true);
		expect(orphans.every((f) => !f.target.endsWith("/AGENTS.md"))).toBe(true);
	});

	it("不應該把 skills/*/SKILL.md 等 vault 外引用視為 broken_link", () => {
		const externalRefFile = join(fixtureRoot, "episodic/incidents/xd-ext.md");
		writeFileSync(
			externalRefFile,
			"# ext ref\n\n參考 `skills/component-classification/SKILL.md` 和 `~/.claude/rules/foo.md`。\n",
		);
		const findings = scanVaultWikiLint(fixtureRoot);
		const brokenLinks = findings.filter((f) => f.category === "broken_link");
		expect(
			brokenLinks.every(
				(f) => !f.message.includes("SKILL.md") && !f.message.includes("~/"),
			),
		).toBe(true);
	});

	it("空 vault root 應回空 findings 不 crash", () => {
		const emptyRoot = mkdtempSync(join(tmpdir(), "vault-empty-"));
		try {
			const findings = scanVaultWikiLint(emptyRoot);
			expect(findings).toEqual([]);
		} finally {
			rmSync(emptyRoot, { recursive: true, force: true });
		}
	});
});
