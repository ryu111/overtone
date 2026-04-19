// harness-cli.test.js — nova harness CLI 指令測試
import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CLAUDE = join(homedir(), ".claude");
const HARNESS = join(CLAUDE, "scripts/cli/harness.js");

describe("nova harness CLI", () => {
  test("harness.js 存在且可 import", async () => {
    expect(existsSync(HARNESS)).toBe(true);
    const mod = await import(HARNESS);
    expect(typeof mod.default).toBe("function");
  });

  test("harness.js 包含 compliance 統計邏輯", () => {
    const src = readFileSync(HARNESS, "utf-8");
    expect(src).toContain("session-compliance.jsonl");
    expect(src).toContain("guard-blocks.jsonl");
    expect(src).toContain("selfReviewRate");
  });

  test("harness.js 包含 hook coverage 計算", () => {
    const src = readFileSync(HARNESS, "utf-8");
    expect(src).toContain("Hook Coverage");
    expect(src).toContain("hook-client.js");
    expect(src).toContain("allEvents");
  });

  test("harness.js 包含 top violations 排行", () => {
    const src = readFileSync(HARNESS, "utf-8");
    expect(src).toContain("Top Violations");
    expect(src).toContain(".sort(");
    expect(src).toContain(".slice(0, 5)");
  });

  test("nova-cli.js 有 harness 路由", () => {
    const cli = readFileSync(join(CLAUDE, "scripts/nova-cli.js"), "utf-8");
    expect(cli).toContain('"harness"');
    expect(cli).toContain("harness.js");
  });
});
