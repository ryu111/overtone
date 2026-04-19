// agent-harness-architecture.test.js — Phase 5：防止重構成果被破壞
import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CLAUDE = join(homedir(), ".claude");

describe("Agent Harness Architecture", () => {
  // 5.1：dead scripts 不復活
  test("Phase 0A 刪除的 4 個 dead scripts 不存在", () => {
    const dead = [
      "scripts/collect-report-data.sh",
      "scripts/check-closure.sh",
      "scripts/pencil-sync.sh",
      "scripts/scan-dead-code.sh",
    ];
    for (const f of dead) {
      expect(existsSync(join(CLAUDE, f))).toBe(false);
    }
  });

  // 5.2：duplicate wrappers 不復活
  test("Phase 0B 刪除的 5 個 duplicate wrappers 不存在", () => {
    const dead = [
      "scripts/cli/health.js",
      "scripts/cli/gap.js",
      "scripts/cli/gap-fix.js",
      "scripts/cli/wrapup.js",
      "scripts/regression-watch.js",
    ];
    for (const f of dead) {
      expect(existsSync(join(CLAUDE, f))).toBe(false);
    }
  });

  // 5.3：rule 重複不復發（SoT 各只出現 1 處 rule 檔）
  test("防護升級階梯 SoT 只在 失敗與修復.md", () => {
    const rulesDir = join(CLAUDE, "rules");
    let count = 0;
    for (const sub of readdirSync(rulesDir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      for (const f of readdirSync(join(rulesDir, sub.name))) {
        if (!f.endsWith(".md")) continue;
        const content = readFileSync(join(rulesDir, sub.name, f), "utf-8");
        // 排除指向行（含 →、見）
        const lines = content.split("\n").filter(l => /防護升級/.test(l) && !/→|見/.test(l));
        count += lines.length;
      }
    }
    // SoT 在 失敗與修復.md description + 重複犯錯升級段 = 2 行
    expect(count).toBeLessThanOrEqual(2);
  });

  // 5.4：hook Role 註解完整
  test("每個 modules/*.js 頂部有 // Role:", () => {
    const modulesDir = join(CLAUDE, "hooks/modules");
    const files = readdirSync(modulesDir).filter(f => f.endsWith(".js"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const first = readFileSync(join(modulesDir, f), "utf-8").split("\n")[0];
      expect(first).toMatch(/^\/\/ Role:/);
    }
  });

  // 5.5：docs/agent-harness.md 存在
  test("docs/agent-harness.md 存在且包含對照表", () => {
    const p = join(CLAUDE, "docs/agent-harness.md");
    expect(existsSync(p)).toBe(true);
    const content = readFileSync(p, "utf-8");
    expect(content).toContain("三核心");
    expect(content).toContain("Feedback Loop");
  });

  // 5.6：rule 檔 ≤ 50 行
  test("所有 rule 檔 ≤ 50 行", () => {
    const rulesDir = join(CLAUDE, "rules");
    const overLimit = [];
    for (const sub of readdirSync(rulesDir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      for (const f of readdirSync(join(rulesDir, sub.name))) {
        if (!f.endsWith(".md")) continue;
        const content = readFileSync(join(rulesDir, sub.name, f), "utf-8");
        const lines = content.endsWith("\n") ? content.split("\n").length - 1 : content.split("\n").length;
        if (lines > 50) overLimit.push(`${sub.name}/${f} (${lines})`);
      }
    }
    expect(overLimit).toEqual([]);
  });

  // 5.7：commands 白名單（新增需同步更新此測試）
  test("commands/*.md 白名單", () => {
    const cmds = readdirSync(join(CLAUDE, "commands")).filter(f => f.endsWith(".md")).sort();
    expect(cmds).toEqual(["audit.md", "handoff.md", "pr.md", "skill-forge.md"]);
  });
});
