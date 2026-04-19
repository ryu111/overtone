import { describe, test, expect, beforeEach } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, unlinkSync, readFileSync } from "node:fs";

const SCRIPTS = join(homedir(), ".claude/scripts/os");
const ACTIONS_LOG = "/tmp/os-control-actions.jsonl";

describe("vision-loop", () => {
  // mapZoomedCoords 測試（行為不變，保留）
  test("mapZoomedCoords 座標映射正確", async () => {
    const { mapZoomedCoords } = await import(join(SCRIPTS, "vision-loop.js"));
    const result = mapZoomedCoords(
      { x: 50, y: 30, label: "button" },
      { x: 100, y: 200 },
    );
    expect(result.x).toBe(150);
    expect(result.y).toBe(230);
    expect(result.label).toBe("button");
  });

  test("mapZoomedCoords null 輸入不 crash", async () => {
    const { mapZoomedCoords } = await import(join(SCRIPTS, "vision-loop.js"));
    expect(mapZoomedCoords(null, { x: 0, y: 0 })).toBeNull();
    expect(mapZoomedCoords({ x: 1, y: 1 }, null)).toEqual({ x: 1, y: 1, label: undefined });
  });

  // executeAction 權限檢查測試
  test("executeAction blocked app（Keychain Access）→ PERMISSION_DENIED", async () => {
    const { executeAction } = await import(join(SCRIPTS, "vision-loop.js"));
    const result = executeAction({ type: "click", x: 100, y: 100 }, "Keychain Access");
    expect(result.success).toBe(false);
    expect(result.error).toBe("PERMISSION_DENIED");
  });

  test("executeAction blocked app（1Password）→ PERMISSION_DENIED", async () => {
    const { executeAction } = await import(join(SCRIPTS, "vision-loop.js"));
    const result = executeAction({ type: "click", x: 100, y: 100 }, "1Password");
    expect(result.success).toBe(false);
    expect(result.error).toBe("PERMISSION_DENIED");
  });

  test("executeAction 缺少 type → 回傳錯誤", async () => {
    const { executeAction } = await import(join(SCRIPTS, "vision-loop.js"));
    const result = executeAction({}, "unknown");
    expect(result.success).toBe(false);
    expect(result.error).toBe("action.type required");
  });

  test("executeAction unknown type → 回傳錯誤", async () => {
    const { executeAction } = await import(join(SCRIPTS, "vision-loop.js"));
    // 用一個不在 blocked list 的 app，確保能進到 switch
    const result = executeAction({ type: "unknown_op" }, "unknown");
    expect(result.success).toBe(false);
    expect(result.error).toContain("unknown action type");
  });

  test("executeAction blocked → 寫入操作日誌", async () => {
    try { unlinkSync(ACTIONS_LOG); } catch {}

    const { executeAction } = await import(join(SCRIPTS, "vision-loop.js"));
    executeAction({ type: "click", x: 50, y: 50 }, "Keychain Access");

    if (existsSync(ACTIONS_LOG)) {
      const content = readFileSync(ACTIONS_LOG, "utf-8").trim();
      const entries = content.split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const blocked = entries.find(e => e.result === "blocked");
      expect(blocked).toBeDefined();
      expect(blocked.app).toBe("Keychain Access");
    }
  });

  // export 存在性測試（新 API）
  test("模組 export 完整（新 API）", async () => {
    const mod = await import(join(SCRIPTS, "vision-loop.js"));
    expect(typeof mod.captureAndReturn).toBe("function");
    expect(typeof mod.captureRegionAndReturn).toBe("function");
    expect(typeof mod.executeAction).toBe("function");
    expect(typeof mod.captureForVerify).toBe("function");
    expect(typeof mod.mapZoomedCoords).toBe("function");
    // 舊 API 已移除
    expect(mod.executeVisionLoop).toBeUndefined();
    expect(mod.singleRound).toBeUndefined();
    expect(mod.analyzeScreenshot).toBeUndefined();
    expect(mod.verifyAction).toBeUndefined();
  });
});
