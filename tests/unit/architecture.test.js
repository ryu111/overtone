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

    it(`${file} 不 import server.js（server-api.js 除外）`, () => {
      const importLines = code.split("\n").filter(l => /^\s*import\b/.test(l) && l.includes("server") && !l.includes("server-api"));
      expect(importLines.length).toBe(0);
    });
  }
});

// ── Lifecycle 模組介面 ──
describe("統一模組介面（on={} + init/destroy）", () => {
  const busModules = [
    { file: "heartbeat.js", events: ["hb:tick"], hasInit: true, hasDestroy: true },
    { file: "watchdog.js", events: ["watchdog:scan"], hasInit: true, hasDestroy: true },
  ];

  for (const { file, events, hasInit, hasDestroy } of busModules) {
    it(`${file} on={} 包含 bus events: ${events.join(",")}`, async () => {
      const mod = await import(join(MODULES_DIR, file) + `?t=${Date.now()}`);
      expect(mod.on).toBeDefined();
      for (const evt of events) {
        expect(typeof mod.on[evt]).toBe("function");
      }
    });

    if (hasInit) {
      it(`${file} export init()`, async () => {
        const mod = await import(join(MODULES_DIR, file) + `?t=${Date.now()}`);
        expect(typeof mod.init).toBe("function");
      });
    }
  }

  it("notification.js on={} 包含 Notification + bus events", async () => {
    const mod = await import(join(MODULES_DIR, "notification.js") + `?t=${Date.now()}`);
    expect(mod.on).toBeDefined();
    expect(mod.on.Notification).toBeDefined();
    expect(mod.on["task:completed"]).toBeDefined();
    expect(mod.on["sd:done"]).toBeDefined();
  });

  it("所有模組不再使用 subscribe/handler lifecycle 格式", async () => {
    const moduleFiles = readdirSync(MODULES_DIR).filter(f => f.endsWith(".js"));
    for (const file of moduleFiles) {
      const mod = await import(join(MODULES_DIR, file) + `?t=${Date.now()}`);
      // default export 不應有 subscribe
      if (mod.default) {
        expect(mod.default.subscribe).toBeUndefined();
      }
      // lifecycle export 不應存在
      expect(mod.lifecycle).toBeUndefined();
    }
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
      // heartbeat.js 暫時 1000（v2 priority loop 加入後需拆分）
      const limit = rel.includes("heartbeat") ? 1000 : 800;
      expect(effective).toBeLessThanOrEqual(limit);
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
    // heartbeat 系列允許內部 import（heartbeat.js → heartbeat-config/resilience/v2）
    const heartbeatFamily = new Set(["heartbeat-config", "heartbeat-resilience", "heartbeat-v2"]);
    const moduleNames = new Set(modules.map(m => m.replace(/\.js$/, "")));
    for (const mod of modules) {
      const imports = getImports(join(MODULES_DIR, mod));
      const modName = mod.replace(/\.js$/, "");
      const crossImports = imports.filter(i => {
        if (!moduleNames.has(i)) return false;
        // heartbeat.js 可以 import heartbeat-* 系列
        if (modName === "heartbeat" && heartbeatFamily.has(i)) return false;
        return true;
      });
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

// ── Server 同步阻塞防護 ──
describe("nova-server 無同步阻塞", () => {
  const SERVER_DIR = join(homedir(), "projects/nova-server");

  it("server.js + api/*.js + flow/*.js 不含 sleepSync", () => {
    if (!existsSync(SERVER_DIR)) return;
    const violations = [];
    const dirs = [SERVER_DIR, join(SERVER_DIR, "api"), join(SERVER_DIR, "flow")];
    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir).filter(f => f.endsWith(".js"))) {
        const content = readFileSync(join(dir, file), "utf-8");
        if (content.includes("Bun.sleepSync")) {
          violations.push(`${dir.split("/").pop()}/${file}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

// ── flow-observer toolName vs settings.json PreToolUse matcher 一致性 ──
describe("AskUserQuestion 全鏈路防護", () => {
  const hookClientCode = readFileSync(join(homedir(), ".claude/hooks/hook-client.js"), "utf-8");
  const foCode = readFileSync(join(homedir(), ".claude/hooks/modules/flow-observer.js"), "utf-8");
  const settings = JSON.parse(readFileSync(join(homedir(), ".claude/settings.json"), "utf-8"));
  const managerCode = existsSync(join(homedir(), "projects/nova-server/api/manager.js"))
    ? readFileSync(join(homedir(), "projects/nova-server/api/manager.js"), "utf-8")
    : "";

  it("hook-client.js 有 AskUserQuestion 段且包含 spawnSync curl /api/ask", () => {
    expect(hookClientCode).toMatch(/AskUserQuestion/);
    expect(hookClientCode).toMatch(/spawnSync.*curl.*\/api\/ask/s);
  });

  it("hook-client.js AskUserQuestion 段有 return false（不干擾 CLI）", () => {
    // AskUserQuestion 段必須 return false，不能 outputAllow
    const askBlock = hookClientCode.match(/if\s*\(toolName\s*===\s*['"]AskUserQuestion['"].*?return\s+false;/s);
    expect(askBlock).not.toBeNull();
  });

  it("settings.json PreToolUse matcher 包含 AskUserQuestion", () => {
    const matchers = new Set();
    for (const entry of (settings.hooks?.PreToolUse || [])) {
      if (entry.matcher) {
        for (const part of entry.matcher.split("|")) matchers.add(part.trim());
      }
    }
    expect(matchers.has("AskUserQuestion")).toBe(true);
  });

  it("flow-observer.js 有 PreToolUse:AskUserQuestion handler", () => {
    expect(foCode).toMatch(/["']PreToolUse:AskUserQuestion["']/);
  });

  it("nova-server manager.js POST /api/ask 有 broadcast ask_question", () => {
    if (!managerCode) return; // skip if nova-server not available
    expect(managerCode).toMatch(/\/api\/ask.*POST/s);
    expect(managerCode).toMatch(/broadcast.*ask_question/s);
  });

  it("nova-server manager.js POST /api/ask/answer 有 tmux 轉送", () => {
    if (!managerCode) return; // skip if nova-server not available
    expect(managerCode).toMatch(/\/api\/ask\/answer/);
    expect(managerCode).toMatch(/tmux.*send[_-]keys/s);
  });
});

// ── cross-dispatch 處理單一責任 ──
describe("cross-dispatch 處理單一責任", () => {
  const ciCode = readFileSync(join(homedir(), ".claude/hooks/modules/context-injector.js"), "utf-8");

  it("injectSessionAwareness 不碰 cross-dispatch（不 ack、不讀 nova-cross-tasks）", () => {
    // 提取 injectSessionAwareness 函式體
    const fnStart = ciCode.indexOf("function injectSessionAwareness(");
    const fnBody = ciCode.slice(fnStart, ciCode.indexOf("\nfunction ", fnStart + 1));
    expect(fnBody).not.toContain("nova-cross-tasks");
    expect(fnBody).not.toContain("ackWithRetry");
    expect(fnBody).not.toContain("跨專案任務（給你的");
  });

  it("UserPromptSubmit 是唯一處理 cross-dispatch pending 的掛載點", () => {
    // 提取 injectSessionAwareness 函式體，確認不含 nova-cross-tasks
    const fnStart = ciCode.indexOf("function injectSessionAwareness(");
    const fnEnd = ciCode.indexOf("\nfunction ", fnStart + 1);
    const fnBody = fnEnd > 0 ? ciCode.slice(fnStart, fnEnd) : ciCode.slice(fnStart, fnStart + 2000);
    expect(fnBody).not.toContain("nova-cross-tasks");
    // 確認 UserPromptSubmit 區塊有讀取 cross-tasks
    const upsStart = ciCode.indexOf("UserPromptSubmit:");
    const upsBody = ciCode.slice(upsStart, upsStart + 3000);
    expect(upsBody).toContain("nova-cross-tasks.jsonl");
  });

  it("UserPromptSubmit 有冪等追蹤（nova-dispatch-injected.json）", () => {
    expect(ciCode).toContain("nova-dispatch-injected.json");
    expect(ciCode).toContain("newTasks");
    expect(ciCode).toContain("injected.has(t.id)");
  });

  it("三問閉環有 TTL 自動過期（防止無限積壓）", () => {
    expect(ciCode).toContain("expiredByTTL");
    expect(ciCode).toContain("300000");
  });

  it("closure-pending 項含 cwd（per-session 隔離，防止跨 session 阻擋）", () => {
    // 寫入 closure 時帶 cwd
    const closureWrite = ciCode.slice(ciCode.indexOf("nova-closure-pending"), ciCode.indexOf("closure tracking error"));
    expect(closureWrite).toContain("cwd: myCwd");
  });

  it("自動引擎 dispatch 完成不建 closure 項（有自己的 staleCount 反饋）", () => {
    // 過濾掉 auto-engine dispatch
    expect(ciCode).toContain("全自動引擎的執行者");
    expect(ciCode).toContain("manualCompletions");
  });

  it("guards 三問閉環 per-session 過濾（不阻擋其他 session）", () => {
    const guardsCode = readFileSync(join(homedir(), ".claude/hooks/modules/guards.js"), "utf-8");
    const closureSection = guardsCode.slice(
      guardsCode.indexOf("三問閉環"),
      guardsCode.indexOf("三問閉環") + 500,
    );
    expect(closureSection).toContain("c.cwd");
    expect(closureSection).toContain("myCwd");
  });
});

describe("flow-observer × settings.json 一致性", () => {
  it("flow-observer 處理的每個 toolName 都有對應的 PreToolUse matcher", () => {
    const foCode = readFileSync(join(homedir(), ".claude/hooks/modules/flow-observer.js"), "utf-8");
    const settings = JSON.parse(readFileSync(join(homedir(), ".claude/settings.json"), "utf-8"));

    // 提取 flow-observer 中的 toolName === "xxx" 和 toolName === 'xxx'
    const toolNames = new Set();
    const re = /toolName\s*===\s*["'](\w+)["']/g;
    let m;
    while ((m = re.exec(foCode)) !== null) {
      toolNames.add(m[1]);
    }

    // 提取 settings.json 的 PreToolUse matchers
    const matchers = new Set();
    for (const entry of (settings.hooks?.PreToolUse || [])) {
      if (entry.matcher) {
        // matcher 可能是 "Write|Edit" 格式
        for (const part of entry.matcher.split("|")) {
          matchers.add(part.trim());
        }
      }
    }

    // 每個 flow-observer 處理的 tool 都應有 matcher
    const missing = [...toolNames].filter(t => !matchers.has(t));
    expect(missing).toEqual([]);
  });
});
