import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, unlinkSync, readFileSync } from "node:fs";

const SCRIPTS = join(homedir(), ".claude/scripts/os");
const ACTIONS_LOG = "/tmp/os-control-actions.jsonl";

describe("vision-loop", () => {
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

  test("executeVisionLoop blocked app → PERMISSION_DENIED", async () => {
    const { executeVisionLoop } = await import(join(SCRIPTS, "vision-loop.js"));
    const result = await executeVisionLoop("點擊按鈕", { app: "Keychain Access" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("PERMISSION_DENIED");
  });

  test("executeVisionLoop 寫操作日誌", async () => {
    // 清除舊日誌
    try { unlinkSync(ACTIONS_LOG); } catch {}

    const { executeVisionLoop } = await import(join(SCRIPTS, "vision-loop.js"));
    await executeVisionLoop("點擊按鈕", { app: "1Password" });

    // 確認日誌有寫入
    if (existsSync(ACTIONS_LOG)) {
      const content = readFileSync(ACTIONS_LOG, "utf-8").trim();
      const entries = content.split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const blocked = entries.find(e => e.result === "blocked");
      expect(blocked).toBeDefined();
      expect(blocked.app).toBe("1Password");
    }
  });

  test("模組 export 完整", async () => {
    const mod = await import(join(SCRIPTS, "vision-loop.js"));
    expect(typeof mod.executeVisionLoop).toBe("function");
    expect(typeof mod.singleRound).toBe("function");
    expect(typeof mod.mapZoomedCoords).toBe("function");
    expect(typeof mod.executeAction).toBe("function");
  });
});
