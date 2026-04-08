import { describe, test, expect, afterAll } from "bun:test";
import { join } from "path";
import { homedir } from "os";
import { existsSync, unlinkSync } from "fs";

const BLOCK_PATH = "/tmp/nova-review-block-test-task.json";

describe("review-gate", () => {
  let mod;

  afterAll(() => { try { unlinkSync(BLOCK_PATH); } catch {} });

  test("載入模組", async () => {
    mod = await import(join(homedir(), ".claude/hooks/modules/review-gate.js"));
    expect(mod.checkBlock).toBeDefined();
    expect(mod.recordReject).toBeDefined();
    expect(mod.clearBlock).toBeDefined();
    expect(mod.shouldEscalate).toBeDefined();
  });

  test("初始無 block", () => {
    expect(mod.checkBlock("test-task")).toBeNull();
  });

  test("第 1 次 reject → strikes=1", () => {
    const record = mod.recordReject("test-task", "程式碼有 bug", "reviewer-A");
    expect(record.strikes).toBe(1);
    expect(record.blocked).toBe(true);
    expect(record.feedback).toHaveLength(1);
    expect(record.feedback[0].message).toBe("程式碼有 bug");
    expect(record.feedback[0].reviewer).toBe("reviewer-A");
  });

  test("第 1 次不升級", () => {
    expect(mod.shouldEscalate("test-task")).toBe(false);
  });

  test("第 2 次 reject → strikes=2 → feedback 累積", () => {
    const record = mod.recordReject("test-task", "bug 仍未修復", "reviewer-A");
    expect(record.strikes).toBe(2);
    expect(record.feedback).toHaveLength(2);
  });

  test("第 2 次 → 升級", () => {
    expect(mod.shouldEscalate("test-task")).toBe(true);
  });

  test("clearBlock 清除", () => {
    mod.clearBlock("test-task");
    expect(mod.checkBlock("test-task")).toBeNull();
  });

  test("清除後 shouldEscalate 回傳 false", () => {
    expect(mod.shouldEscalate("test-task")).toBe(false);
  });
});
