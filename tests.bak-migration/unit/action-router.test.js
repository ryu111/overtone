import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";

const SCRIPTS = join(homedir(), ".claude/scripts/os");

describe("action-router", () => {
  test("KNOWN_SCRIPTABLE_APPS 包含常見 app", async () => {
    const { KNOWN_SCRIPTABLE_APPS } = await import(join(SCRIPTS, "action-router.js"));
    expect(KNOWN_SCRIPTABLE_APPS.has("Finder")).toBe(true);
    expect(KNOWN_SCRIPTABLE_APPS.has("Safari")).toBe(true);
    expect(KNOWN_SCRIPTABLE_APPS.has("iTerm2")).toBe(true);
    expect(KNOWN_SCRIPTABLE_APPS.has("System Events")).toBe(true);
  });

  test("scriptable app → route=applescript", async () => {
    const { routeAction } = await import(join(SCRIPTS, "action-router.js"));
    const result = routeAction("點擊按鈕", "Finder");
    expect(result.route).toBe("applescript");
  });

  test("未知 app → route=vision", async () => {
    const { routeAction } = await import(join(SCRIPTS, "action-router.js"));
    const result = routeAction("點擊按鈕", "Notion");
    expect(result.route).toBe("vision");
  });

  test("view-only app + click → blocked", async () => {
    const { routeAction } = await import(join(SCRIPTS, "action-router.js"));
    const result = routeAction("點擊按鈕", "Keychain Access");
    expect(result.route).toBe("blocked");
  });

  test("view-only app + screenshot → allowed", async () => {
    const { checkAppPermission } = await import(join(SCRIPTS, "action-router.js"));
    const perm = checkAppPermission("Keychain Access", "screenshot");
    expect(perm.allowed).toBe(true);
  });

  test("full app + drag → allowed", async () => {
    const { checkAppPermission } = await import(join(SCRIPTS, "action-router.js"));
    const perm = checkAppPermission("Terminal", "drag");
    expect(perm.allowed).toBe(true);
  });

  test("interact app + drag → blocked", async () => {
    const { checkAppPermission } = await import(join(SCRIPTS, "action-router.js"));
    const perm = checkAppPermission("Safari", "drag");
    expect(perm.allowed).toBe(false);
  });

  test("getScaleFactor 回傳 1 或 2", async () => {
    const { getScaleFactor } = await import(join(SCRIPTS, "action-router.js"));
    const factor = getScaleFactor();
    expect([1, 2]).toContain(factor);
  });
});
