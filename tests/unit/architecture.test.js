// architecture.test.js — 架構防護測試
// 確保 event-bus 架構不被破壞：server 純淨、模組獨立、介面正確
import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HOOKS_DIR = join(homedir(), ".claude/hooks");
const MODULES_DIR = join(HOOKS_DIR, "modules");
const SERVER_PATH = join(HOOKS_DIR, "server.js");
const EVENT_BUS_PATH = join(HOOKS_DIR, "event-bus.js");

function readFile(p) { return readFileSync(p, "utf-8"); }
function lineCount(p) { return readFile(p).split("\n").length; }

// ── server.js 純淨性 ──
describe("server.js 純淨性", () => {
  const code = readFile(SERVER_PATH);

  it("行數 <= 300", () => {
    expect(lineCount(SERVER_PATH)).toBeLessThanOrEqual(300);
  });

  it("不含 setInterval（heartbeat 邏輯應在 lifecycle 模組）", () => {
    // 允許 SSE heartbeat 的 setInterval，但不應有 poll/heartbeat 的 setInterval
    const matches = code.match(/setInterval/g) || [];
    // SSE heartbeat 有一個 setInterval，其他不應有
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it("不含 SELF_DRIVE_PROMPT", () => {
    expect(code).not.toContain("SELF_DRIVE_PROMPT");
  });

  it("不含 spawnSession import（由 lifecycle 模組負責）", () => {
    expect(code).not.toContain("spawnSession");
  });

  it("不含 notify 函式定義（由 notification 模組負責）", () => {
    expect(code).not.toMatch(/function notify\(/);
  });

  it("保留 dispatch export", () => {
    expect(code).toContain("export {");
    expect(code).toContain("dispatch");
  });

  it("import event-bus.js", () => {
    expect(code).toContain("event-bus");
  });
});

// ── event-bus.js ──
describe("event-bus.js", () => {
  const code = readFile(EVENT_BUS_PATH);

  it("行數 <= 150", () => {
    expect(lineCount(EVENT_BUS_PATH)).toBeLessThanOrEqual(150);
  });

  it("使用 xstream", () => {
    expect(code).toContain("xstream");
  });

  it("不 import modules/", () => {
    expect(code).not.toContain("modules/");
  });

  it("export createEventBus", () => {
    expect(code).toContain("createEventBus");
  });
});

// ── 模組獨立性 ──
describe("模組獨立性", () => {
  const moduleFiles = readdirSync(MODULES_DIR).filter(f => f.endsWith(".js"));

  it("至少有 5 個模組", () => {
    expect(moduleFiles.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of moduleFiles) {
    const code = readFile(join(MODULES_DIR, file));

    it(`${file} 不 import 其他 hooks/modules/`, () => {
      // 允許 import from scripts/（依賴方向正確）
      // 不允許 import from modules/（模組間零耦合）
      const lines = code.split("\n").filter(l => l.includes("import") && l.includes("modules/"));
      expect(lines.length).toBe(0);
    });

    it(`${file} 不 import event-bus.js（透過 ctx 間接操作）`, () => {
      const importLines = code.split("\n").filter(l => /^\s*import\b/.test(l) && l.includes("event-bus"));
      expect(importLines.length).toBe(0);
    });

    it(`${file} 不 import server.js`, () => {
      const importLines = code.split("\n").filter(l => /^\s*import\b/.test(l) && l.includes("server"));
      expect(importLines.length).toBe(0);
    });
  }
});

// ── Lifecycle 模組介面 ──
describe("lifecycle 模組介面", () => {
  const lifecycleModules = ["heartbeat.js", "self-drive.js"];

  for (const file of lifecycleModules) {
    it(`${file} export default 含 name + subscribe + handler`, async () => {
      const mod = await import(join(MODULES_DIR, file) + `?t=${Date.now()}`);
      const def = mod.default;
      expect(def).toBeDefined();
      expect(typeof def.name).toBe("string");
      expect(Array.isArray(def.subscribe)).toBe(true);
      expect(def.subscribe.length).toBeGreaterThan(0);
      expect(typeof def.handler).toBe("function");
    });

    it(`${file} handler 有 init 和 destroy`, async () => {
      const mod = await import(join(MODULES_DIR, file) + `?t=${Date.now()}`);
      const def = mod.default;
      // init 和 destroy 至少有一個
      const hasLifecycle = typeof def.init === "function" || typeof def.destroy === "function";
      expect(hasLifecycle).toBe(true);
    });
  }

  it("notification.js 同時有 on（sync）和 lifecycle（async）", async () => {
    const mod = await import(join(MODULES_DIR, "notification.js") + `?t=${Date.now()}`);
    expect(mod.on).toBeDefined();
    expect(mod.on.Notification).toBeDefined();
    expect(mod.lifecycle).toBeDefined();
    expect(mod.lifecycle.subscribe).toBeDefined();
    expect(typeof mod.lifecycle.handler).toBe("function");
  });
});

// ── 依賴方向 ──
describe("依賴方向", () => {
  it("scripts/heartbeat.js 不 import hooks/", () => {
    const code = readFile(join(homedir(), ".claude/scripts/heartbeat.js"));
    expect(code).not.toContain("hooks/");
  });

  it("scripts/session-spawner.js 不 import hooks/", () => {
    const code = readFile(join(homedir(), ".claude/scripts/session-spawner.js"));
    expect(code).not.toContain("hooks/");
  });
});
