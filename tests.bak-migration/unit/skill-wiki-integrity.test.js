/**
 * skill-wiki-integrity baseline test（ADR-002 Phase 1.5 Setup）
 *
 * 守護：
 *   強引用 broken → exit 1
 *   orphan wiki → warn not fail
 *   禁反向守護（不掃 wiki→SKILL）— xd-2c4m 教訓
 *
 * 被掃者：~/.claude/scripts/skill-wiki-integrity.js
 */
import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";

const SCRIPT = join(homedir(), ".claude/scripts/skill-wiki-integrity.js");

function runIn(root, args = []) {
    const out = spawnSync("bun", [SCRIPT, ...args], {
        env: { ...process.env, CLAUDE_ROOT: root },
        encoding: "utf8",
    });
    return { code: out.status, stdout: out.stdout, stderr: out.stderr };
}

function makeFixture() {
    const root = mkdtempSync(join(tmpdir(), "skill-wiki-integrity-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    mkdirSync(join(root, "obsidian/wiki"), { recursive: true });
    return root;
}

describe("skill-wiki-integrity baseline (ADR-002 Q2)", () => {
    it("clean repo (SKILL.md 引用存在 wiki) → exit 0 pass", () => {
        const root = makeFixture();
        mkdirSync(join(root, "skills/foo"));
        mkdirSync(join(root, "obsidian/wiki/foo"));
        writeFileSync(join(root, "obsidian/wiki/foo/bar.md"), "content");
        writeFileSync(
            join(root, "skills/foo/SKILL.md"),
            "ref: [bar](../../obsidian/wiki/foo/bar.md)",
        );
        const { code, stdout } = runIn(root);
        expect(code).toBe(0);
        expect(stdout).toContain("Strong broken (SKILL→wiki): 0");
        expect(stdout).toContain("Result: PASS");
        rmSync(root, { recursive: true });
    });

    it("強引用 broken（SKILL.md 指 wiki 不存在）→ exit 1 fail", () => {
        const root = makeFixture();
        mkdirSync(join(root, "skills/foo"));
        mkdirSync(join(root, "obsidian/wiki/foo"));
        writeFileSync(
            join(root, "skills/foo/SKILL.md"),
            "ref: [missing](../../obsidian/wiki/foo/ghost.md)",
        );
        const { code, stdout } = runIn(root);
        expect(code).toBe(1);
        expect(stdout).toContain("Strong broken (SKILL→wiki): 1");
        expect(stdout).toContain("ghost.md");
        rmSync(root, { recursive: true });
    });

    it("orphan wiki dir（wiki/X 存 skills/X 不存）→ warn not fail", () => {
        const root = makeFixture();
        mkdirSync(join(root, "obsidian/wiki/orphan"));
        writeFileSync(join(root, "obsidian/wiki/orphan/content.md"), "x");
        const { code, stdout } = runIn(root);
        expect(code).toBe(0);
        expect(stdout).toContain("Orphan wiki dirs: 1");
        expect(stdout).toContain("orphan");
        rmSync(root, { recursive: true });
    });

    it("反向守護不執行（wiki 有檔 SKILL 沒引用 → 不 fail）— xd-2c4m 守護", () => {
        const root = makeFixture();
        mkdirSync(join(root, "skills/foo"));
        mkdirSync(join(root, "obsidian/wiki/foo"));
        writeFileSync(join(root, "skills/foo/SKILL.md"), "no refs here");
        writeFileSync(join(root, "obsidian/wiki/foo/unreferenced.md"), "content");
        const { code } = runIn(root);
        expect(code).toBe(0);
        rmSync(root, { recursive: true });
    });

    it("backtick 內範例語法不抓 false positive", () => {
        const root = makeFixture();
        mkdirSync(join(root, "skills/foo"));
        mkdirSync(join(root, "obsidian/wiki/foo"));
        writeFileSync(
            join(root, "skills/foo/SKILL.md"),
            "範例：`[text](../../obsidian/wiki/foo/nonexistent.md)` 這是語法示例",
        );
        const { code, stdout } = runIn(root);
        expect(code).toBe(0);
        expect(stdout).toContain("Strong broken (SKILL→wiki): 0");
        rmSync(root, { recursive: true });
    });

    it("--json mode 輸出 parseable JSON", () => {
        const root = makeFixture();
        const { stdout } = runIn(root, ["--json"]);
        const parsed = JSON.parse(stdout);
        expect(parsed).toHaveProperty("strong_broken_count");
        expect(parsed).toHaveProperty("orphan_wiki_count");
        expect(parsed).toHaveProperty("pass");
        rmSync(root, { recursive: true });
    });
});
