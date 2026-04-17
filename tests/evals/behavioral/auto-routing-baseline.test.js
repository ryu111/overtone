/**
 * auto-routing-baseline.test.js — 鎖定 Phase 1.5 P3 前 auto skill 的行為
 *
 * ADR-002 Acceptance Criteria P3 特殊驗收：
 *   搬前 + 搬後 behavioral baseline diff = 0
 *
 * 鎖定維度：
 *   1. SKILL.md 存在
 *   2. SKILL.md 內所有 markdown refs（./references/X.md 或 ../../obsidian/wiki/auto/X.md）全 resolve
 *   3. 核心結構段落（HARD GATE、D0-D4 決策樹）存在
 *   4. references 目錄或搬遷後 wiki/auto/ 至少一處存在
 *
 * 不 mock Claude Code — 這是 artifact-level 驗證，不是 integration test
 */
import { describe, it, expect } from "bun:test";
import { readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";

const AUTO_SKILL_MD = join(homedir(), ".claude/skills/auto/SKILL.md");
const AUTO_REFS_DIR = join(homedir(), ".claude/skills/auto/references");
const AUTO_WIKI_DIR = join(homedir(), ".claude/obsidian/wiki/auto");

function resolveRef(url, sourceAbs) {
    if (/^(https?:|mailto:|#)/.test(url)) return null;
    if (url.startsWith("~/")) return join(homedir(), url.slice(2)).split("#")[0];
    if (url.startsWith("/")) return url.split("#")[0];
    return resolve(dirname(sourceAbs), url).split("#")[0];
}

describe("auto-routing-baseline (ADR-002 P3 驗收)", () => {
    it("SKILL.md 存在", () => {
        expect(existsSync(AUTO_SKILL_MD)).toBe(true);
    });

    it("references 目錄 或 wiki/auto/ 至少一處存在（搬前/搬後都 OK）", () => {
        const hasOld = existsSync(AUTO_REFS_DIR);
        const hasNew = existsSync(AUTO_WIKI_DIR);
        expect(hasOld || hasNew).toBe(true);
    });

    it("所有 refs 全 resolve（markdown link 或 inline code 指向 ./references/ 或 ../../obsidian/wiki/auto/）", () => {
        const rawContent = readFileSync(AUTO_SKILL_MD, "utf8");
        const mdLinks = [...rawContent.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)]
            .filter(([, , url]) => url.includes("references/") || url.includes("obsidian/wiki/auto/"))
            .map(([, text, url]) => ({ text, url }));
        const inlineRefs = [...rawContent.matchAll(/`((?:\.\/references|\.\.\/\.\.\/obsidian\/wiki\/auto)\/[^`\s]+?\.md)`/g)]
            .map((m) => ({ text: "inline", url: m[1] }));
        const allRefs = [...mdLinks, ...inlineRefs];

        expect(allRefs.length).toBeGreaterThan(0);

        const broken = [];
        for (const { text, url } of allRefs) {
            const target = resolveRef(url, AUTO_SKILL_MD);
            if (!target) continue;
            try {
                statSync(target);
            } catch {
                broken.push({ text, url, target });
            }
        }
        if (broken.length > 0) {
            console.log("Broken refs:", JSON.stringify(broken, null, 2));
        }
        expect(broken.length).toBe(0);
    });

    it("核心結構：HARD GATE 段落存在", () => {
        const content = readFileSync(AUTO_SKILL_MD, "utf8");
        expect(content).toMatch(/HARD GATE/);
    });

    it("核心結構：D0-D4 深度路由提及", () => {
        const content = readFileSync(AUTO_SKILL_MD, "utf8");
        for (const d of ["D0", "D1", "D2", "D3", "D4"]) {
            expect(content).toContain(d);
        }
    });

    it("核心結構：HARD GATE 或 routing 決策機制提及", () => {
        const content = readFileSync(AUTO_SKILL_MD, "utf8");
        expect(content).toMatch(/HARD GATE|深度路由|routing/);
    });
});
