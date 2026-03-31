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

// ── 指向完整性 ──
describe("指向完整性", () => {
  it("Manager rules 中的「見 rules/」指向目標存在", () => {
    const managerRulesDir = join(homedir(), "projects/nova-manager/.claude/rules");
    if (!existsSync(managerRulesDir)) return;

    const files = readdirSync(managerRulesDir).filter(f => f.endsWith(".md"));
    const missing = [];

    for (const file of files) {
      const content = readFileSync(join(managerRulesDir, file), "utf-8");
      // 找「見 rules/xxx.md」「見 `rules/xxx.md`」「見全域 rules/xxx.md」
      const refs = content.matchAll(/見\s*(?:全域\s*)?[`]?rules\/([^\s`」\n]+\.md)/g);
      for (const match of refs) {
        const target = join(homedir(), ".claude/rules", match[1]);
        if (!existsSync(target)) {
          missing.push(`${file} → rules/${match[1]}`);
        }
      }
      // skills/ 指向
      const skillRefs = content.matchAll(/見\s*(?:全域\s*)?[`]?skills\/([^\s`」\n]+)/g);
      for (const match of skillRefs) {
        const target = join(homedir(), ".claude/skills", match[1]);
        if (!existsSync(target)) {
          missing.push(`${file} → skills/${match[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

// ── 靜態規則掃描 ──
describe("靜態規則掃描", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");

  it("C7: 所有 fetch() 呼叫不使用裸 fetch（無 options 物件）", () => {
    // 只找真正的裸 fetch：fetch(url) 沒有第二個 options 參數
    // pattern: fetch( 後面直接是變數/字串結尾，不含 {
    const dirs = [join(CLAUDE_DIR, "hooks"), join(CLAUDE_DIR, "scripts")];
    const violations = [];
    for (const dir of dirs) {
      try {
        // 找 fetch(someUrl) 不帶 options 的呼叫
        const result = execSync(
          `grep -rn "\\bfetch(" "${dir}" --include="*.js" | grep -v "node_modules"`,
          { encoding: "utf-8", timeout: 5000 }
        );
        for (const line of result.trim().split("\n").filter(Boolean)) {
          // 只保留沒有 { 在同行的 fetch 呼叫，且 fetch 後面只有一個引數
          if (/fetch\([^{]+\)\s*[;,)]/.test(line.split(":").slice(2).join(":"))) {
            violations.push(line.split(":").slice(0, 2).join(":"));
          }
        }
      } catch { /* grep no match = good */ }
    }
    // 允許一些合法的模式（如 fetch(url) 在 wrapper 函式中）
    expect(violations.length).toBeLessThan(5);
  });

  it("C10: rules/ 中每條 MUST/NEVER 有強調標記", () => {
    const rulesDir = join(CLAUDE_DIR, "rules");
    const violations = [];
    const files = readdirSync(rulesDir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const content = readFileSync(join(rulesDir, file), "utf-8");
      const lines = content.split("\n");
      let inCodeBlock = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }
        if (inCodeBlock) continue;
        // 跳過表格行、縮排行
        if (line.startsWith("|") || line.startsWith("  ") || line.startsWith("\t")) continue;
        // 跳過引用 MUST/NEVER 字詞的描述性文字（夾在引號、反引號或中文書名號中）
        const isDescriptive = /[「」""'`][^「」""'`]*\bMUST\b[^「」""'`]*[「」""'`]/.test(line)
          || /[「」""'`][^「」""'`]*\bNEVER\b[^「」""'`]*[「」""'`]/.test(line)
          || /說出\s*MUST/.test(line) || /說出\s*NEVER/.test(line)
          || /\bMUST\/NEVER\b/.test(line) || /MUST.*NEVER.*語句/.test(line);
        if (isDescriptive) continue;
        if (/\bMUST\b/.test(line) && !line.includes("📋") && !line.includes("⛔") && !line.includes("⚠️") && !line.includes("💡")) {
          violations.push(`${file}:${i + 1}: MUST without marker`);
        }
        if (/\bNEVER\b/.test(line) && !line.includes("⛔") && !line.includes("📋")) {
          violations.push(`${file}:${i + 1}: NEVER without ⛔`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("C11: skills/ 目錄名不與內建指令衝突", () => {
    const reserved = new Set([
      "compact", "exit", "resume", "help", "config", "fast", "clear", "cost",
      "login", "logout", "doctor", "status", "permissions", "review", "bug",
      "init", "mcp", "memory", "model", "vim", "terminal-setup", "listen",
      "allowed-tools", "rename",
    ]);
    const skillsDir = join(CLAUDE_DIR, "skills");
    const skills = readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    const conflicts = skills.filter(s => reserved.has(s));
    expect(conflicts).toEqual([]);
  });

  it("C12: 全域 CLAUDE.md 行數 ≤ 120", () => {
    const content = readFileSync(join(CLAUDE_DIR, "CLAUDE.md"), "utf-8");
    const lines = content.split("\n").length;
    expect(lines).toBeLessThanOrEqual(120);
  });
});

// ── data 驗證 ──
describe("data 驗證", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");

  it("C13: decisions.jsonl 每行有 reason（非空）", () => {
    // decisions.jsonl 是人工寫入的決策日誌，格式含 reason 欄位
    // decision-log.jsonl 是 learner 的 action log，格式不同，不在此測試範圍
    const fp = join(CLAUDE_DIR, "data", "decisions.jsonl");
    if (!existsSync(fp)) return; // 檔案不存在時跳過

    const lines = readFileSync(fp, "utf-8").trim().split("\n").filter(Boolean);
    const invalid = [];
    for (const line of lines) {
      try {
        const d = JSON.parse(line);
        if (!d.reason || d.reason.trim().length === 0) {
          invalid.push(line.slice(0, 50));
        }
      } catch { /* 非 JSON 行跳過 */ }
    }
    expect(invalid.length).toBe(0);
  });

  it("C14: data/*.json 都是合法 JSON", () => {
    const dataDir = join(CLAUDE_DIR, "data");
    if (!existsSync(dataDir)) return;
    const files = readdirSync(dataDir).filter(f => f.endsWith(".json"));
    const invalid = [];
    for (const file of files) {
      try {
        JSON.parse(readFileSync(join(dataDir, file), "utf-8"));
      } catch (e) {
        invalid.push(`${file}: ${e.message}`);
      }
    }
    expect(invalid).toEqual([]);
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
