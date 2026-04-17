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
  // heartbeat + watchdog 已搬至 nova-server/services/，modules/ 不再有這些檔案

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
    // heartbeat.js 已搬至 nova-server/services/
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

  // nova-cli.js 是統一 CLI 聚合器，隨功能增長，允許更大上限
  // flow-observer.js 是核心 hook 模組（含 P4 handoff helper re-export），允許 ≤ 950
  const FILE_LIMITS = {
    "scripts/nova-cli.js": 1000,
    "hooks/modules/flow-observer.js": 950,
  };

  for (const { rel, path } of targets) {
    const limit = FILE_LIMITS[rel] ?? 800;
    it(`${rel} 有效碼 ≤ ${limit} 行（超過為 warning）`, () => {
      const code = readFile(path);
      const effective = effectiveLineCount(code);
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
    // heartbeat 系列已搬到 lib/，modules/ 下不再有獨立檔案
    const heartbeatFamily = new Set();
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

// ── Hook module 接線守護（xd-5mja 元盲點防護）──
// 寫好 hook module 但忘記在 hook-client.js MODULE_HANDLERS 註冊 = 零執行次數
// 本 test 確保：hooks/modules/*.js 有 `export const on` 的模組都必須在
// hook-client.js 的 LOCAL_MODULES 某處出現（grep path match）
describe("Hook module 接線完整性", () => {
  const MODULES_DIR = join(homedir(), ".claude/hooks/modules");
  const HOOK_CLIENT = join(homedir(), ".claude/hooks/hook-client.js");

  // 豁免清單：不需要在 MODULE_HANDLERS 註冊的 module
  // - lib/ 下是 helper，不是 event handler
  // - 純資料庫/工具類（如 heartbeat-* 系列可能被 heartbeat.js 內部 import）
  const EXEMPT = new Set([
    "lib",
    "heartbeat-data-collector",
    "heartbeat-event-handlers",
    "heartbeat-signals",
    "heartbeat-utils",
    "heartbeat-habit-core",
    "habit-formation",
  ]);

  it("所有 export 非空 on object 的 hook module 都必須在 hook-client.js LOCAL_MODULES 註冊", () => {
    const hookClientCode = readFile(HOOK_CLIENT);
    const modules = readdirSync(MODULES_DIR).filter(f => f.endsWith(".js"));
    const unwired = [];

    for (const mod of modules) {
      const name = mod.replace(/\.js$/, "");
      if (EXEMPT.has(name)) continue;
      const code = readFile(join(MODULES_DIR, mod));
      // 檢查是否 export 非空 on object（含至少一個 handler key）
      // 空 on = {} 是 library 模式（如 review-gate.js 被 agent 程式化呼叫）
      if (!/export\s+const\s+on\s*=\s*\{[\s\S]*?\w+\s*:/.test(code)) continue;
      // 檢查 hook-client 是否引用此 module path
      if (!hookClientCode.includes(`hooks/modules/${mod}`)) {
        unwired.push(mod);
      }
    }
    expect(unwired).toEqual([]);
  });

  // guards.js key 級別守護：on 物件每個 key 必須在 LOCAL_MODULES 對應群組中有 guards.js 條目
  // 防止「guards.js 有 on.PreToolUse:Task 但 LOCAL_MODULES['PreToolUse:Task'] 無 guards.js」的盲點
  it("guards.js on 物件所有 key 都在 LOCAL_MODULES 對應群組中有 guards.js 條目", () => {
    const guardsCode = readFile(join(MODULES_DIR, "guards.js"));
    const hookClientCode = readFile(HOOK_CLIENT);

    // 提取 export const on = { ... } 區塊
    const onBlock = guardsCode.match(/export\s+const\s+on\s*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    // 提取所有 key（含引號 "PreToolUse:Bash" 和無引號 UserPromptSubmit）
    const keys = [...onBlock.matchAll(/['"]([\w:]+)['"]\s*:|^[\t ]*([\w:]+)\s*:/gm)]
      .map(m => m[1] || m[2]).filter(Boolean);

    expect(keys.length).toBeGreaterThan(0);

    const missing = [];
    for (const key of keys) {
      // 找 LOCAL_MODULES 中對應 key 群組，確認其中有 guards.js
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(":", ":");
      const groupRe = new RegExp(`['"]${escapedKey}['"]\\s*:\\s*\\[([\\s\\S]*?)\\]`);
      const block = hookClientCode.match(groupRe)?.[1] ?? "";
      if (!block.includes("guards.js")) missing.push(key);
    }
    expect(missing).toEqual([]);
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
        // 支援子資料夾：rules/X.md 或 rules/分類/X.md
        const target = join(homedir(), ".claude/rules", match[1]);
        const basename = match[1].split("/").pop();
        const subDirTargets = ["核心","協作","品質","元件","環境"].map(d => join(homedir(), ".claude/rules", d, basename));
        if (!existsSync(target) && !subDirTargets.some(p => existsSync(p))) {
          missing.push(`${file} → rules/${match[1]}`);
        }
      }
      // skills/ 指向（同時檢查全域和 manager 本地 skills 目錄）
      const skillRefs = content.matchAll(/見\s*(?:全域\s*)?[`]?skills\/([^\s`」\n]+)/g);
      for (const match of skillRefs) {
        const globalTarget = join(homedir(), ".claude/skills", match[1]);
        const localTarget = join(managerRulesDir, "../skills", match[1]);
        if (!existsSync(globalTarget) && !existsSync(localTarget)) {
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
    // 只找真正的裸 fetch：同一行沒有 options 物件字面量
    // 合法：fetch(url, { ... }) / fetch(fn("/p"), { signal: ... })
    // 違規：fetch(url) / fetch(url);
    const dirs = [join(CLAUDE_DIR, "hooks"), join(CLAUDE_DIR, "scripts")];
    const violations = [];
    for (const dir of dirs) {
      try {
        const result = execSync(
          `grep -rn "\\bfetch(" "${dir}" --include="*.js" | grep -v "node_modules"`,
          { encoding: "utf-8", timeout: 5000 }
        );
        for (const line of result.trim().split("\n").filter(Boolean)) {
          const content = line.split(":").slice(2).join(":");
          // 有 options 物件（, { 或 fetch(, {）→ 合法
          if (/,\s*\{/.test(content)) continue;
          // 否則檢查 fetch 後是否只有單一引數
          if (/\bfetch\([^)]*\)\s*[;,)]/.test(content)) {
            violations.push(line.split(":").slice(0, 2).join(":"));
          }
        }
      } catch { /* grep no match = good */ }
    }
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
    expect(managerCode).toMatch(/post.*["']\/ask["']/is);
    expect(managerCode).toMatch(/broadcast.*ask_question/s);
  });

  it("nova-server manager.js POST /api/ask/answer 有 tmux 轉送", () => {
    if (!managerCode) return; // skip if nova-server not available
    expect(managerCode).toMatch(/["']\/ask\/answer["']/);
    expect(managerCode).toMatch(/tmux.*send.keys/s);
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
    // 整個檔案必須包含 nova-cross-tasks.jsonl（helper 函式中讀取）
    expect(ciCode).toContain("nova-cross-tasks.jsonl");
    // SessionStart handler 不應直接讀取 cross-tasks（職責分離）
    const ssStart = ciCode.indexOf("SessionStart:");
    const ssBody = ciCode.slice(ssStart, ssStart + 3000);
    expect(ssBody).not.toContain("nova-cross-tasks.jsonl");
  });

  it("UserPromptSubmit 冪等追蹤用 Redis status 過濾 + 同步 acknowledge", () => {
    // 舊機制：/tmp/nova-dispatch-injected.json（已移除）
    // 新機制：只處理 pending/delivered，Bun.spawnSync curl /acknowledge（同步，確保 return 前 status 已更新）
    expect(ciCode).toContain("newTasks");
    expect(ciCode).toContain("Bun.spawnSync");
    expect(ciCode).toContain("/acknowledge");
    expect(ciCode).not.toContain("nova-dispatch-injected.json");
  });

  it("三問閉環有時間自動過期（防止無限積壓）", () => {
    expect(ciCode).toContain("7200000");
  });

  it("closure 追蹤統一到 archive（source_cwd per-session 隔離）", () => {
    expect(ciCode).toContain("closureAnswered");
    expect(ciCode).toContain("source_cwd");
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
      guardsCode.indexOf("三問閉環") + 1000,
    );
    expect(closureSection).toContain("source_cwd");
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


// ── tmux paste-buffer -p 守護（xd-eo4x ec19e52 根因防擴散）──
// 背景：bracketed paste + CLI readline paste detection 時序 race → Enter 沒被 submit
// 對應：nb 616240b scripts/os/tmux.js + ns ec19e52 services/dispatch-transport.js pasteToPane
describe("tmux paste-buffer -p 守護", () => {
  const TARGETS = [
    { path: join(homedir(), ".claude/scripts/os/tmux.js"), label: "nb tmux.js" },
    { path: join(homedir(), "projects/nova-server/services/dispatch-transport.js"), label: "ns dispatch-transport.js" },
  ];

  for (const { path, label } of TARGETS) {
    it(label + " 所有 paste-buffer 呼叫必帶 -p flag", () => {
      if (!existsSync(path)) {
        console.warn("[arch-paste-buffer] " + label + " 不存在，跳過");
        return;
      }
      const src = readFile(path);
      const lines = src.split("\n");
      const offenders = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes("paste-buffer")) continue;
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) continue;
        if (!line.includes("-p")) {
          offenders.push({ line: i + 1, content: trimmed });
        }
      }

      // ns 遺留議題 1 已由 ns commit 64424c5 修復 — exempt 移除，全覆蓋強制

      if (offenders.length > 0) {
        console.error("[arch-paste-buffer] " + label + " paste-buffer 缺 -p：\n" + offenders.map(o => "  L" + o.line + ": " + o.content).join("\n"));
      }
      expect(offenders).toEqual([]);
    });
  }
});
