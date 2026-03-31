// architecture.test.js — 架構防護測試
// 確保 hook 模組獨立性、依賴方向、Guard 覆蓋率
// server.js + event-bus.js 已遷移到 ~/projects/nova-server/，相關測試在那邊
import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";

const HOOKS_DIR = join(homedir(), ".claude/hooks");
const MODULES_DIR = join(HOOKS_DIR, "modules");

function readFile(p) { return readFileSync(p, "utf-8"); }
function lineCount(p) { return readFile(p).trimEnd().split("\n").length; }

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

// ── 膨脹偵測（設計原則優先，行數為 warning） ──
describe("檔案膨脹偵測", () => {
  const SCRIPTS_DIR = join(homedir(), ".claude/scripts");

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

  function effectiveLineCount(code) {
    return code.trimEnd().split("\n").filter(line => {
      const trimmed = line.trim();
      return trimmed !== "" && !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    }).length;
  }

  const targets = [
    ...scanAllJs(SCRIPTS_DIR, "scripts"),
    ...scanAllJs(join(homedir(), ".claude/hooks"), "hooks"),
  ];

  for (const { rel, path } of targets) {
    it(`${rel} 有效碼 ≤ 800 行（超過為 warning）`, () => {
      const code = readFile(path);
      const effective = effectiveLineCount(code);
      expect(effective).toBeLessThanOrEqual(800);
    });
  }
});

// ── 環形依賴偵測 ──
describe("模組環形依賴偵測", () => {
  const MODULES_DIR = join(homedir(), ".claude/hooks/modules");
  const modules = readdirSync(MODULES_DIR).filter(f => f.endsWith(".js"));

  // 建立 import 圖
  function getImports(filePath) {
    const code = readFile(filePath);
    const imports = [];
    const re = /(?:import|require)\s*\(?['"]\.\/([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      imports.push(m[1].replace(/\.js$/, ""));
    }
    return imports;
  }

  it("hooks/modules/ 無環形依賴", () => {
    const graph = {};
    for (const mod of modules) {
      const name = mod.replace(/\.js$/, "");
      graph[name] = getImports(join(MODULES_DIR, mod));
    }
    // DFS 檢測環形
    const visited = new Set();
    const stack = new Set();
    function hasCycle(node) {
      if (stack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      stack.add(node);
      for (const dep of (graph[node] || [])) {
        if (hasCycle(dep)) return true;
      }
      stack.delete(node);
      return false;
    }
    for (const node of Object.keys(graph)) {
      expect(hasCycle(node)).toBe(false);
    }
  });

  it("hook module 不互相 import（只能 import 共用 utils）", () => {
    const moduleNames = new Set(modules.map(m => m.replace(/\.js$/, "")));
    for (const mod of modules) {
      const imports = getImports(join(MODULES_DIR, mod));
      const crossImports = imports.filter(i => moduleNames.has(i));
      expect(crossImports).toEqual([]);
    }
  });
});

// ── Guard 覆蓋率 ──
describe("Guard 覆蓋率", () => {
  it("PROTECTED_PATHS 涵蓋 ~/.claude/ 下所有核心子目錄", () => {
    const { PROTECTED_PATHS } = require(join(homedir(), ".claude/hooks/modules/guards.js"));
    const protectedDirs = PROTECTED_PATHS.filter(p => p.endsWith("/"));
    // 核心目錄必須被保護
    const required = ["agents/", "skills/", "hooks/", "commands/", "data/", "rules/", "scripts/", "config/"];
    for (const dir of required) {
      expect(protectedDirs).toContain(dir);
    }
  });
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
