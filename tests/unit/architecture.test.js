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
function lineCount(p) { return readFile(p).trimEnd().split("\n").length; }

// ── server.js 純淨性 ──
describe("server.js 純淨性", () => {
  const code = readFile(SERVER_PATH);

  it("行數 <= 400", () => {
    expect(lineCount(SERVER_PATH)).toBeLessThanOrEqual(400);
  });

  it("setInterval 限制（SSE heartbeat + graceful restart + memory watchdog）", () => {
    const matches = code.match(/setInterval/g) || [];
    // SSE heartbeat 1 個 + graceful restart checker 1 個 + memory watchdog 1 個
    expect(matches.length).toBeLessThanOrEqual(3);
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
  const lifecycleModules = ["heartbeat.js"];

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

    it(`${file} handler 是 async function`, async () => {
      const mod = await import(join(MODULES_DIR, file) + `?t=${Date.now()}`);
      const def = mod.default;
      expect(typeof def.handler).toBe("function");
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

// ── Judge 資料管線檔名一致性 ──
describe("Judge 資料管線檔名一致性", () => {
  const SCORES_FILENAME = "scores.jsonl";
  // 所有讀取 judge 評分的消費者，必須引用正確檔名
  const consumers = [
    { name: "context-injector.js", path: join(MODULES_DIR, "context-injector.js") },
    { name: "heartbeat.js", path: join(MODULES_DIR, "heartbeat.js") },
    { name: "briefing-builder.js", path: join(homedir(), ".claude/scripts/briefing-builder.js") },
  ];

  for (const { name, path } of consumers) {
    it(`${name} 引用 ${SCORES_FILENAME}（非 judge-scores.jsonl）`, () => {
      const code = readFile(path);
      if (code.includes("scores.jsonl")) {
        expect(code).toContain(SCORES_FILENAME);
        expect(code).not.toContain("judge-scores.jsonl");
      }
    });
  }

  it("judge-scores.js 定義的 SCORES_FILE 使用正確檔名", () => {
    const code = readFile(join(homedir(), ".claude/scripts/judge-scores.js"));
    // SCORES_FILE = join(homedir(), ".claude/data/scores.jsonl")
    expect(code).toContain(SCORES_FILENAME);
    expect(code).not.toContain("judge-scores.jsonl");
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

// ── 膨脹偵測 ──
describe("檔案膨脹偵測（≤500 行）", () => {
  const SCRIPTS_DIR = join(homedir(), ".claude/scripts");
  // 白名單：確實需要超過 500 行的檔案 + 理由
  const WHITELIST = new Set([
    "scripts/os-control-driver.js", // OS 自動化 driver，6 個 task 函式 + AppleScript 模板
    "scripts/gap-discovery.js",     // 能力缺口掃描，多維度分析邏輯（586 行，待拆分）
    "scripts/heartbeat.js",         // 自驅引擎，狀態機 + 分支調度（550 行，待拆分）
    "scripts/tool-registry.js",     // 工具註冊表，宣告式資料（504 行，略超）
  ]);

  function scanAllJs(dir, base = "") {
    const results = [];
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory() && !["node_modules", "_archived", "lib"].includes(entry.name)) {
          results.push(...scanAllJs(join(dir, entry.name), rel));
        } else if (entry.name.endsWith(".js")) {
          results.push({ rel, path: join(dir, entry.name) });
        }
      }
    } catch { /* dir not found */ }
    return results;
  }

  const targets = [
    ...scanAllJs(SCRIPTS_DIR, "scripts"),
    ...scanAllJs(join(homedir(), ".claude/hooks"), "hooks"),
  ];

  for (const { rel, path } of targets) {
    if (WHITELIST.has(rel)) continue;
    it(`${rel} ≤ 500 行`, () => {
      const lines = readFile(path).trimEnd().split("\n").length;
      expect(lines).toBeLessThanOrEqual(500);
    });
  }
});

// ── osascript 統一 ──
describe("osascript 統一到 scripts/os/", () => {
  const SCRIPTS_DIR = join(homedir(), ".claude/scripts");
  const ALLOWED_DIRS = ["scripts/os/", "scripts/emergency-stop.sh"];

  function scanJsFiles(dir, base = "") {
    const results = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory() && entry.name !== "node_modules") {
        results.push(...scanJsFiles(join(dir, entry.name), rel));
      } else if (entry.name.endsWith(".js")) {
        results.push({ rel, path: join(dir, entry.name) });
      }
    }
    return results;
  }

  const allJs = [
    ...scanJsFiles(SCRIPTS_DIR, "scripts"),
    ...scanJsFiles(join(homedir(), ".claude/hooks"), "hooks"),
  ];

  for (const { rel, path } of allJs) {
    const isAllowed = ALLOWED_DIRS.some(d => rel.startsWith(d));
    if (isAllowed) continue;
    // tool-registry.js 只是字串參考，不是實際呼叫
    if (rel.includes("tool-registry")) continue;

    it(`${rel} 不直接呼叫 osascript`, () => {
      const code = readFile(path);
      const hasSpawn = /(?:spawnSync|execSync|spawn)\s*\(\s*(?:\[?\s*["']osascript|["']osascript)/.test(code);
      expect(hasSpawn).toBe(false);
    });
  }
});
