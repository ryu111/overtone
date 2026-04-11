// wrapup-autocomplete.test.js — Phase D autoComplete 測試
import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const WRAPUP = join(homedir(), ".claude/scripts/wrapup.js");

describe("wrapup autoComplete", () => {
  test("wrapup.js export autoComplete 函式", async () => {
    const mod = await import(WRAPUP);
    expect(typeof mod.autoComplete).toBe("function");
  });

  test("autoComplete 函式 fail-open（server 離線不 throw）", async () => {
    const mod = await import(WRAPUP);
    // server 可能離線，autoComplete 應該 gracefully skip
    await expect(mod.autoComplete()).resolves.toBeUndefined();
  });

  test("wrapup 全流程包含 autoComplete", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("await autoComplete()");
  });

  test("CLI 支援 D / autocomplete 子命令", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain('"d"');
    expect(src).toContain('"autocomplete"');
  });

  test("autoComplete 查詢 cross-dispatch API", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("/api/cross-dispatch?target_cwd=");
    expect(src).toContain("/api/cross-dispatch/complete");
  });

  test("autoComplete 使用 AbortSignal.timeout（fail-open）", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("AbortSignal.timeout(3000)");
  });

  test("autoComplete 附帶 git log verification", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("git log -1 --oneline");
    expect(src).toContain("verification");
  });
});
