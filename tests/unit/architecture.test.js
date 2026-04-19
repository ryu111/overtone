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

  // xd adr008-phase2-flow-observer-wire (2026-04-19): flow-observer key-level 接線守護
  // 根因：PostToolUse handler 定義在 flow-observer 但未接到 LOCAL_MODULES
  // → testRun 永不遞增 → reflect-guard 每次 commit 都誤觸發
  // 同根因：UserPromptSubmit / Stop 也曾漏接（本 session 治本一併補）
  it("flow-observer 關鍵 handler 在 LOCAL_MODULES 對應群組註冊（防 testRun 累加缺失類 bug）", () => {
    const hookClientCode = readFile(HOOK_CLIENT);
    // flow-observer 有 runtime 副作用的 handler 必接（非純 data emit）
    const CRITICAL_KEYS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "PreCompact", "PostCompact"];
    const missing = [];
    for (const key of CRITICAL_KEYS) {
      const groupRe = new RegExp("['\"]" + key + "['\"]\\s*:\\s*\\[([\\s\\S]*?)\\]");
      const block = hookClientCode.match(groupRe)?.[1] ?? "";
      if (!block.includes("flow-observer.js")) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  // xd 2026-04-18: chain-integrity scanner 必須認得 LOCAL_MODULES runtime 載入
  // 防「36 筆 hooks/modules/*.js 被誤判 orphan 淹沒真 orphan」回歸
  // iter 19 方案 C 單點拆：Phase 1 移至 scripts/lib/chain-integrity-ref.js
  it("chain-integrity scanner 認得 LOCAL_MODULES runtime 載入", () => {
    const src = readFileSync(join(homedir(), ".claude/scripts/lib/chain-integrity-ref.js"), "utf-8");
    expect(src).toMatch(/function\s+collectRuntimeLoaderRefs\s*\(/);
    expect(src).toContain("hook-client.js");
    expect(src).toContain("for (const p of collectRuntimeLoaderRefs())");
  });

  // xd 2026-04-18 Q3: chain-integrity scanner 必須讀 component-lifecycle.json allowlist_notes
  // SSoT coupling 原則：lifecycle governance SoT 決定「有效元件」定義，scanner 須 couple
  // 防「戰略儲備元件繼續被列 orphan → daily-report 脫敏」回歸
  // iter 19 方案 C 單點拆：Phase 1 移至 scripts/lib/chain-integrity-ref.js
  it("chain-integrity scanner 讀 allowlist_notes 豁免戰略儲備", () => {
    const src = readFileSync(join(homedir(), ".claude/scripts/lib/chain-integrity-ref.js"), "utf-8");
    expect(src).toMatch(/function\s+loadLifecycleAllowlistNotes\s*\(/);
    expect(src).toContain("component-lifecycle.json");
    expect(src).toContain("allowlist_notes");
    expect(src).toContain("exemptedCount");
    // 必須 log 豁免數（避免靜默豁免）
    expect(src).toMatch(/log\(`Orphan 判定：\$\{exemptedCount\}/);
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

  // xd-gfoq：e5df485 歸檔 5 個 skill 漏掉 rule 引用守護 → 全域 rules 補同等檢查
  it("全域 rules 中的「見 skills/」指向目標存在", () => {
    const globalRulesDir = join(homedir(), ".claude/rules");
    if (!existsSync(globalRulesDir)) return;

    const subDirs = ["核心", "協作", "品質", "元件", "環境"];
    const missing = [];

    const scanDir = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) scanDir(join(dir, entry.name));
        else if (entry.name.endsWith(".md")) {
          const file = join(dir, entry.name);
          const content = readFileSync(file, "utf-8");
          // 支援「見 skills/...」「派生來源：skills/...」「詳見 skills/...」
          const skillRefs = content.matchAll(/(?:見|來源[：:])\s*(?:全域\s*)?[`]?skills\/([^\s`」\n；;]+)/g);
          for (const match of skillRefs) {
            const target = join(homedir(), ".claude/skills", match[1]);
            if (!existsSync(target)) {
              missing.push(`${file.replace(homedir() + "/", "")} → skills/${match[1]}`);
            }
          }
        }
      }
    };

    // 掃根目錄 + 5 個子分類
    for (const entry of readdirSync(globalRulesDir, { withFileTypes: true })) {
      if (entry.isDirectory() && subDirs.includes(entry.name)) {
        scanDir(join(globalRulesDir, entry.name));
      } else if (entry.name.endsWith(".md")) {
        const content = readFileSync(join(globalRulesDir, entry.name), "utf-8");
        const skillRefs = content.matchAll(/(?:見|來源[：:])\s*(?:全域\s*)?[`]?skills\/([^\s`」\n；;]+)/g);
        for (const match of skillRefs) {
          const target = join(homedir(), ".claude/skills", match[1]);
          if (!existsSync(target)) {
            missing.push(`rules/${entry.name} → skills/${match[1]}`);
          }
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

  it("C12: 全域 CLAUDE.md 行數 ≤ 100 (Stage 1.0-H 外移 Blueprint+ADR pointer 收緊 125→100, xd-ah9v)", () => {
    const content = readFileSync(join(CLAUDE_DIR, "CLAUDE.md"), "utf-8");
    const lines = content.split("\n").length;
    expect(lines).toBeLessThanOrEqual(100);
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

    // Wave1 P2（iter 3）— 防 vacuous pass：若有人刪光 paste-buffer 呼叫
    // test 仍 pass（offenders.length=0）。加 existence assertion。
    it(label + " 必含 ≥1 paste-buffer -p 呼叫（防 S1 regression）", () => {
      if (!existsSync(path)) {
        console.warn("[arch-paste-buffer-exists] " + label + " 不存在，跳過");
        return;
      }
      const src = readFile(path);
      const lines = src.split("\n");
      let count = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) continue;
        if (line.includes("paste-buffer") && line.includes("-p")) count++;
      }
      expect(count).toBeGreaterThanOrEqual(1);
    });
  }
});

// ── ask-user-question-enforcer 存在性守護（xd-jze6）──
describe("ask-user-question-enforcer 存在性", () => {
  it("hooks/modules/ask-user-question-enforcer.js 存在", () => {
    expect(existsSync(join(homedir(), ".claude/hooks/modules/ask-user-question-enforcer.js"))).toBe(true);
  });
});

// ── md-link 格式統一守護（xd-ek2d Round 7）──
describe("寫作規範 md-link 唯一 SoT", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");

  it("rules/環境/寫作規範.md 明示 md-link 強制", () => {
    const path = join(CLAUDE_DIR, "rules/環境/寫作規範.md");
    const content = readFile(path);
    expect(content).toMatch(/vault-internal.*markdown link.*\[display\]\(path\.md\)/);
    expect(content).toMatch(/NEVER 用 backtick 包 path/);
  });

  // iter 19 方案 C 單點拆：REF_PATTERNS 移至 scripts/lib/chain-integrity-ref.js
  it("chain-integrity.js REF_PATTERNS 僅含 md-link", () => {
    const path = join(CLAUDE_DIR, "scripts/lib/chain-integrity-ref.js");
    const content = readFile(path);
    const refBlockMatch = content.match(/const REF_PATTERNS = \[([\s\S]*?)\];/);
    expect(refBlockMatch).toBeTruthy();
    const block = refBlockMatch[1];
    expect(block).not.toMatch(/backtick 包裹的路徑/);
    expect(block).not.toMatch(/見 X.*backtick/);
    expect(block).toMatch(/Markdown link/);
  });

  it("rules/ + skills/ 下無 vault-internal backtick path refs", () => {
    const targetDirs = ["rules", "skills", "agents", "commands"];
    const offenders = [];
    for (const dir of targetDirs) {
      const files = walkMd(join(CLAUDE_DIR, dir));
      for (const f of files) {
        const content = readFile(f);
        const m = content.match(/`(?:skills|rules|hooks|agents|commands|obsidian|docs)\/[a-zA-Z0-9/_.-]+\.md`/g);
        if (m) offenders.push({ file: f.replace(CLAUDE_DIR + "/", ""), refs: m.slice(0, 3) });
      }
    }
    // docs/vision.md 是 nova-brain scope, exempt
    const filtered = offenders.filter(o => !o.refs.every(r => r.includes("docs/vision.md") || r.includes("docs/常駐服務") || r.includes("docs/架構演進") || r.includes("docs/製作規範") || r.includes("docs/目標場景")));
    if (filtered.length > 0) console.error("[arch-md-link] offenders:\n" + JSON.stringify(filtered, null, 2));
    expect(filtered).toEqual([]);
  });
});

function walkMd(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const { readdirSync, statSync } = require("node:fs");
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walkMd(p));
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out;
}

// ── wrapup-guard Stop auto-complete 順序守護（xd-43j5 2026-04-18）──
// 根因：原 Phase 0 (autoCompleteIncomingDispatches) 在 ralph-loop check 之前無條件執行，
// 每次 ralph iter Stop 誤關 Main 正在處理的 incoming dispatch → 氾濫假通知。
// 正確順序：ralph-loop active → early return allow（不 auto-complete）；非 ralph 才 auto-complete。
describe("wrapup-guard Stop auto-complete 順序", () => {
  const WRAPUP_GUARD_PATH = join(homedir(), ".claude/hooks/modules/wrapup-guard.js");

  it("wrapup-guard.js ralph-loop check 早於 autoCompleteIncomingDispatches 呼叫", () => {
    const src = readFileSync(WRAPUP_GUARD_PATH, "utf-8");
    const stopHandlerStart = src.indexOf("Stop: (input)");
    expect(stopHandlerStart).toBeGreaterThan(-1);
    // 取 Stop handler 主體（從 Stop: 到下個 SessionEnd 或檔尾）
    const stopBody = src.slice(stopHandlerStart);
    const ralphCheckIdx = stopBody.indexOf("ralph-loop.local.md");
    const autoCompleteCallIdx = stopBody.indexOf("autoCompleteIncomingDispatches(cwd)");
    expect(ralphCheckIdx).toBeGreaterThan(-1);
    expect(autoCompleteCallIdx).toBeGreaterThan(-1);
    // ralph check 必須先於 auto-complete 呼叫
    expect(ralphCheckIdx).toBeLessThan(autoCompleteCallIdx);
  });

  it("ralph-loop existsSync check 分支結尾有 return allow", () => {
    const src = readFileSync(WRAPUP_GUARD_PATH, "utf-8");
    // 提取 ralph check block 到 return allow，驗證分支結尾確實 early return allow
    // （中間可含 canary exception auto-complete 呼叫 — xd-43j5 治本擴充 2026-04-18）
    const m = src.match(/if\s*\(existsSync\(ralphFile\)\)\s*\{[\s\S]*?return\s*\{\s*decision:\s*["']allow["']/);
    expect(m).not.toBeNull();
  });

  // xd-43j5 治本擴充 (2026-04-18)：ralph 分支對 canary dispatch 例外 auto-complete
  // 根因：canary self-dispatch 累積 4 次 (xd-75gb/kwn1/oiqw/y76x) 無主 → ralph early return 導致無 auto-complete
  // 治本：ralph 分支 return 前 predicate filter auto-complete priority=low + prompt 含 canary 的 dispatch
  it("ralph-loop 分支對 canary dispatch 例外 auto-complete", () => {
    const src = readFileSync(WRAPUP_GUARD_PATH, "utf-8");
    const ralphBlockMatch = src.match(/if\s*\(existsSync\(ralphFile\)\)\s*\{([\s\S]*?)return\s*\{\s*decision:\s*["']allow["']/);
    expect(ralphBlockMatch).not.toBeNull();
    const ralphBlock = ralphBlockMatch[1];
    // ralph 分支 body 必含 autoCompleteIncomingDispatches 呼叫（帶 predicate）
    expect(ralphBlock).toContain("autoCompleteIncomingDispatches(cwd,");
    // predicate 必判 priority=low + prompt 含 canary 字樣
    expect(ralphBlock).toMatch(/priority\s*===\s*["']low["']/);
    expect(ralphBlock).toMatch(/canary/i);
  });

  it("autoCompleteIncomingDispatches 支援 predicate 參數", () => {
    const src = readFileSync(WRAPUP_GUARD_PATH, "utf-8");
    // function signature 必含 predicate 參數（預設 () => true 保舊呼叫原行為）
    expect(src).toMatch(/function\s+autoCompleteIncomingDispatches\s*\(\s*cwd\s*,\s*predicate/);
    // filter 必呼叫 predicate(d)
    expect(src).toMatch(/return\s+predicate\(d\)/);
  });
});

// ── xd-0pcx R2 Rule 廣意化 Phase 2 候選 2：任務管理 + 總結格式 → 任務生命週期（2026-04-18）──
// Manager Round 2 ack: Q1 45-50 行規模 / Q2 grep+sed 批量 (no redirect) / Q3 加 d) 正向引用守護
describe("候選 2 合併守護：任務生命週期", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");
  const readFile2 = (p) => readFileSync(p, "utf-8");

  // A. 合併後檔案存在性
  it("rules/核心/任務生命週期.md 存在", () => {
    expect(existsSync(join(CLAUDE_DIR, "rules/核心/任務生命週期.md"))).toBe(true);
  });

  // B. 被合檔案消失性（防 drift 舊檔復辟）
  it("舊任務管理.md + 總結格式.md 已刪除", () => {
    expect(existsSync(join(CLAUDE_DIR, "rules/核心/任務管理.md"))).toBe(false);
    expect(existsSync(join(CLAUDE_DIR, "rules/環境/總結格式.md"))).toBe(false);
  });

  // C. 否定式守護：舊 rule 名稱不在任何 hub README md-link 中
  it("舊 rule md-link 零引用於 hub README", () => {
    const hubs = [
      "rules/核心/README.md",
      "rules/環境/README.md",
      "rules/README.md",
    ];
    const oldNames = ["任務管理.md", "總結格式.md"];
    for (const hub of hubs) {
      const content = readFile2(join(CLAUDE_DIR, hub));
      for (const name of oldNames) {
        expect(content).not.toMatch(new RegExp(`\\[.*\\]\\(.*${name}\\)`));
      }
    }
  });

  // d. 正向守護（xd-7w7b R2 Q3 d 加）：新 rule md-link 在 hub README 引用
  it("新任務生命週期.md 被 rules/核心/README.md md-link 引用", () => {
    const readme = readFile2(join(CLAUDE_DIR, "rules/核心/README.md"));
    expect(readme).toMatch(/\]\(任務生命週期\.md\)/);
  });

  // iter 21 使用者糾正「tasklist 又沒有顯示」— ralph-loop 每 iter 必 TaskCreate
  it("任務生命週期.md 含 ralph-loop iter 必 TaskCreate 條款", () => {
    const src = readFile2(join(CLAUDE_DIR, "rules/核心/任務生命週期.md"));
    expect(src).toMatch(/ralph-loop.*每\s*iter.*TaskCreate/);
    expect(src).toMatch(/NEVER.*iter 內跳過 TaskCreate/);
  });
});

// ── xd-7w7b R2 Rule 廣意化 Phase 2 候選 4：canonical-引用驗證 + 呼叫者邊界 → caller-邊界（2026-04-18）──
describe("候選 4 合併守護：caller-邊界", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");
  const readFile4 = (p) => readFileSync(p, "utf-8");

  it("rules/元件/caller-邊界.md 存在", () => {
    expect(existsSync(join(CLAUDE_DIR, "rules/元件/caller-邊界.md"))).toBe(true);
  });

  it("舊 canonical-引用驗證.md + 呼叫者邊界.md 已刪除", () => {
    expect(existsSync(join(CLAUDE_DIR, "rules/協作/canonical-引用驗證.md"))).toBe(false);
    expect(existsSync(join(CLAUDE_DIR, "rules/元件/呼叫者邊界.md"))).toBe(false);
  });

  it("舊 rule md-link 零引用於 hub README", () => {
    const hubs = [
      "rules/協作/README.md",
      "rules/元件/README.md",
      "rules/README.md",
    ];
    const oldNames = ["canonical-引用驗證.md", "呼叫者邊界.md"];
    for (const hub of hubs) {
      const content = readFile4(join(CLAUDE_DIR, hub));
      for (const name of oldNames) {
        expect(content).not.toMatch(new RegExp(`\\[.*\\]\\(.*${name}\\)`));
      }
    }
  });

  it("新 caller-邊界.md 被 rules/元件/README.md md-link 引用", () => {
    const readme = readFile4(join(CLAUDE_DIR, "rules/元件/README.md"));
    expect(readme).toMatch(/\]\(caller-邊界\.md\)/);
  });
});

// ── xd-hbar R2 C 方案 Rule 廣意化 Phase 2 候選 1：討論式派發+持久化+完成即討論 → 討論生命週期，對等討論可見性 → 多方協作（2026-04-18）──
describe("候選 1 合併守護：討論生命週期 + 多方協作", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");
  const readFile1 = (p) => readFileSync(p, "utf-8");

  // === 討論生命週期.md ===
  it("rules/協作/討論生命週期.md 存在", () => {
    expect(existsSync(join(CLAUDE_DIR, "rules/協作/討論生命週期.md"))).toBe(true);
  });

  it("舊 3 檔已刪除（討論式派發 + 持久化 + 完成即討論）", () => {
    expect(existsSync(join(CLAUDE_DIR, "rules/協作/討論式派發.md"))).toBe(false);
    expect(existsSync(join(CLAUDE_DIR, "rules/協作/討論式派發持久化.md"))).toBe(false);
    expect(existsSync(join(CLAUDE_DIR, "rules/協作/完成即討論.md"))).toBe(false);
  });

  it("討論生命週期.md 舊 md-link 零引用於 hub README", () => {
    const hubs = ["rules/協作/README.md", "rules/README.md"];
    const oldNames = ["討論式派發.md", "討論式派發持久化.md", "完成即討論.md"];
    for (const hub of hubs) {
      const content = readFile1(join(CLAUDE_DIR, hub));
      for (const name of oldNames) {
        expect(content).not.toMatch(new RegExp(`\\[.*\\]\\(.*${name}\\)`));
      }
    }
  });

  it("新 討論生命週期.md 被 rules/協作/README.md md-link 引用", () => {
    const readme = readFile1(join(CLAUDE_DIR, "rules/協作/README.md"));
    expect(readme).toMatch(/\]\(討論生命週期\.md\)/);
  });

  // === 多方協作.md ===
  it("rules/協作/多方協作.md 存在", () => {
    expect(existsSync(join(CLAUDE_DIR, "rules/協作/多方協作.md"))).toBe(true);
  });

  it("舊對等討論可見性.md 已刪除", () => {
    expect(existsSync(join(CLAUDE_DIR, "rules/協作/對等討論可見性.md"))).toBe(false);
  });

  it("對等討論可見性.md md-link 零引用於 hub README", () => {
    const hubs = ["rules/協作/README.md", "rules/README.md"];
    for (const hub of hubs) {
      const content = readFile1(join(CLAUDE_DIR, hub));
      expect(content).not.toMatch(/\]\(.*對等討論可見性\.md\)/);
    }
  });

  it("新 多方協作.md 被 rules/協作/README.md md-link 引用", () => {
    const readme = readFile1(join(CLAUDE_DIR, "rules/協作/README.md"));
    expect(readme).toMatch(/\]\(多方協作\.md\)/);
  });

  // xd 2026-04-18 使用者糾正反饋（iter 3）：記 rule 第 1 次升級
  // (a) complete alreadyCompleted 必發新 dispatch 避免 peer 看不到定案
  // (b) 自驅發現 adjacency 不 defer — 防自驅短暫化反模式
  it("討論生命週期.md 含 alreadyCompleted 必發新 dispatch 條款", () => {
    const content = readFile1(join(CLAUDE_DIR, "rules/協作/討論生命週期.md"));
    expect(content).toContain("alreadyCompleted");
    expect(content).toMatch(/必發新 dispatch|重送定案/);
  });

  it("回饋與進化.md 含 adjacency 不 defer 條款", () => {
    const content = readFile1(join(CLAUDE_DIR, "rules/品質/回饋與進化.md"));
    expect(content).toContain("自驅短暫化反模式");
    expect(content).toMatch(/adjacency.*立即做完不 defer/);
  });
});

// ── ADR-008 Phase 1 搬家守護（2026-04-19）──
describe("ADR-008 Phase 1: nb → nova 搬家預鋪", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");
  const readFileAdr = (p) => readFileSync(p, "utf-8");

  it("ADR-008 檔案存在", () => {
    expect(existsSync(join(CLAUDE_DIR, "obsidian/semantic/architecture-decisions/ADR-008-nb-to-nova-full-migration.md"))).toBe(true);
  });

  it("~/.claude/CLAUDE.md 保留 Blueprint md-link trace（身份段外移）", () => {
    const claudeMd = readFileAdr(join(CLAUDE_DIR, "CLAUDE.md"));
    expect(claudeMd).toContain("## Blueprint");
    expect(claudeMd).toMatch(/\]\(obsidian\/semantic\/agent-identity\/nova\.md\)/);
    // Blueprint 內容主體外移 — CLAUDE.md 不再含完整 agent_id/core_objective 等欄位
  });

  it("agent-identity/nova.md 存在且含完整 Blueprint (ADR-007 D1 + ADR-008)", () => {
    const novaMd = readFileAdr(join(CLAUDE_DIR, "obsidian/semantic/agent-identity/nova.md"));
    expect(novaMd).toMatch(/agent_id:\s*nova\b/);
    expect(novaMd).toMatch(/alias:.*nova-brain/);
    expect(novaMd).toContain("core_objective");
    expect(novaMd).toContain("non_negotiables");
    expect(novaMd).toContain("pipeline");
  });

  it("global-element-guard.js 身份判定讀 CLAUDE.md agent_id", () => {
    const guard = readFileAdr(join(CLAUDE_DIR, "hooks/modules/global-element-guard.js"));
    expect(guard).toMatch(/function\s+readAgentId\s*\(/);
    expect(guard).toContain("AUTHORIZED_AGENTS");
    expect(guard).toMatch(/Set\(\["nova",\s*"nova-brain"\]\)/);
    // cwd fallback safety net 必須保留（過渡期）
    expect(guard).toContain("cwd.includes(\"nova-brain\")");
    expect(guard).toMatch(/cwd\.startsWith\(CLAUDE_DIR\)/);
  });

  it("session-ctl.js 含 nova entry 指向 ~/.claude", () => {
    const sctl = readFileAdr(join(CLAUDE_DIR, "scripts/session-ctl.js"));
    expect(sctl).toMatch(/"nova":\s*join\(homedir\(\),\s*"\.claude"\)/);
    // legacy nova-brain 映射保留（過渡兼容）
    expect(sctl).toMatch(/"nova-brain":\s*join\(homedir\(\),\s*"\.claude"\)/);
  });

  it("cli/dispatch.js 含 nova entry 指向 ~/.claude", () => {
    const disp = readFileAdr(join(CLAUDE_DIR, "scripts/cli/dispatch.js"));
    expect(disp).toMatch(/"nova":\s*join\(homedir\(\),\s*"\.claude"\)/);
  });
});

// ── xd-vepo R2 dv8g 自驅叢集 soft grouping 守護（Q1.C + Q2.C + Q3.C 2026-04-18）──
describe("dv8g 自驅叢集 cross-cutting 守護", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");
  const readFileDv = (p) => readFileSync(p, "utf-8");

  // Q1.C: rules/核心/README.md + skills/README.md 含「自驅叢集」section
  it("rules/核心/README.md 含自驅叢集 section", () => {
    const readme = readFileDv(join(CLAUDE_DIR, "rules/核心/README.md"));
    expect(readme).toContain("自驅叢集（cross-cutting concern）");
  });

  it("skills/README.md 含自驅叢集 section", () => {
    const readme = readFileDv(join(CLAUDE_DIR, "skills/README.md"));
    expect(readme).toContain("自驅叢集（cross-cutting concern）");
  });

  // Q2.C: 3 skills description NOT 段含 cross-skill 邊界
  it("auto-drive NOT 段含 → feedback-loop + → self-evolution 邊界", () => {
    const src = readFileDv(join(CLAUDE_DIR, "skills/auto-drive/SKILL.md"));
    expect(src).toContain("→ feedback-loop");
    expect(src).toContain("→ self-evolution");
  });

  it("feedback-loop NOT 段含 → auto-drive + → self-evolution 邊界", () => {
    const src = readFileDv(join(CLAUDE_DIR, "skills/feedback-loop/SKILL.md"));
    expect(src).toContain("→ auto-drive");
    expect(src).toContain("→ self-evolution");
  });

  it("self-evolution NOT 段含 → auto-drive + → feedback-loop 邊界", () => {
    const src = readFileDv(join(CLAUDE_DIR, "skills/self-evolution/SKILL.md"));
    expect(src).toContain("→ auto-drive");
    expect(src).toContain("→ feedback-loop");
  });

  // Q3.C: ADR-003 §8.5 自驅叢集對應表
  it("ADR-003 §8.5 自驅叢集對應表存在", () => {
    const adr = readFileDv(join(CLAUDE_DIR, "obsidian/semantic/architecture-decisions/ADR-003-four-capabilities-closed-loop.md"));
    expect(adr).toContain("### 8.5 自驅叢集");
    expect(adr).toMatch(/sense \+ detect 合流/);
    expect(adr).toMatch(/learn/);
    expect(adr).toMatch(/fix/);
  });
});

// ── iter 10 使用者糾正「有建議就不用停」baseline (2026-04-19) ──
describe("ralph-loop 7/24 持續運轉紀律 baseline", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");
  const rulePath = join(CLAUDE_DIR, "rules/環境/ralph-loop.md");

  it("ralph-loop.md 含 7/24 持續運轉紀律 section", () => {
    const src = readFileSync(rulePath, "utf-8");
    expect(src).toContain("7/24 持續運轉紀律");
  });

  it("ralph-loop.md NEVER「接下來的建議」列選項後 graceful close", () => {
    const src = readFileSync(rulePath, "utf-8");
    expect(src).toMatch(/NEVER.*接下來的建議.*選項.*graceful\s*close/);
  });

  it("ralph-loop.md NEVER 用「需另開 session」當 graceful close 理由", () => {
    const src = readFileSync(rulePath, "utf-8");
    expect(src).toMatch(/NEVER.*需另開\s*session|非本\s*loop\s*scope/);
  });

  it("ralph-loop.md MUST 四場景白名單 graceful close", () => {
    const src = readFileSync(rulePath, "utf-8");
    expect(src).toMatch(/graceful\s*close\s*僅限.*ctx.*quota.*使用者明示/s);
  });

  it("ralph-loop.md MUST pick 至少一項續 iter 反模式識別（iter 13 複選升級）", () => {
    const src = readFileSync(rulePath, "utf-8");
    expect(src).toContain("選項表格 ≥ 2 項");
    expect(src).toMatch(/pick 其中至少一項（複選更佳）續 iter/);
  });

  // iter 14 使用者糾正「找出自驅停止根因」治本 wording (2026-04-19)
  it("ralph-loop.md 含 iter 14 AI self-dismissal 治本條款", () => {
    const src = readFileSync(rulePath, "utf-8");
    expect(src).toMatch(/NEVER.*AI 主觀 claim graceful close/);
    expect(src).toContain("可驗證 evidence");
    expect(src).toMatch(/NEVER.*graceful close.*AND.*下一目標清單.*AND.*下一目標/s);
  });
});

// ── Stage 1.0-E hub cascade SSoT 守護（xd-35ku Round 2 全採 E）──
describe("hub cascade SSoT 完整性", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");
  const { readdirSync: rd, statSync: st, existsSync: ex } = require("node:fs");

  const categories = ["協作", "核心", "品質", "元件", "環境"];
  for (const cat of categories) {
    it(`rules/${cat}/README.md 列出該類全部 *.md`, () => {
      const dir = join(CLAUDE_DIR, "rules", cat);
      const mdFiles = rd(dir).filter(f => f.endsWith(".md") && f !== "README.md");
      const readme = readFile(join(dir, "README.md"));
      const missing = mdFiles.filter(f => !readme.includes(`](${f})`));
      if (missing.length) console.error(`[hub-cascade] rules/${cat}/ 漏連: ${missing.join(", ")}`);
      expect(missing).toEqual([]);
    });
  }

  it("skills/README.md 列出全部 skills/*/SKILL.md", () => {
    const dir = join(CLAUDE_DIR, "skills");
    const skillDirs = rd(dir).filter(d => {
      const p = join(dir, d);
      return st(p).isDirectory() && ex(join(p, "SKILL.md")) && d !== "_archived";
    });
    const readme = readFile(join(dir, "README.md"));
    const missing = skillDirs.filter(d => !readme.includes(`](${d}/SKILL.md)`));
    if (missing.length) console.error(`[hub-cascade] skills 漏連: ${missing.join(", ")}`);
    expect(missing).toEqual([]);
  });

  it("agents/README.md 列出全部 agents md-link (top + kfc/)", () => {
    const dir = join(CLAUDE_DIR, "agents");
    const topAgents = rd(dir).filter(f => f.endsWith(".md") && f !== "README.md");
    const kfcDir = join(dir, "kfc");
    const kfcAgents = ex(kfcDir)
      ? rd(kfcDir).filter(f => f.endsWith(".md")).map(f => `kfc/${f}`)
      : [];
    const all = [...topAgents, ...kfcAgents];
    const readme = readFile(join(dir, "README.md"));
    const missing = all.filter(f => !readme.includes(`](${f})`));
    if (missing.length) console.error(`[hub-cascade] agents 漏連: ${missing.join(", ")}`);
    expect(missing).toEqual([]);
  });

  it("ADR index hub README.md 列出全部 ADR-*.md (Stage 1.0-H xd-ah9v)", () => {
    const adrDir = join(CLAUDE_DIR, "obsidian/semantic/architecture-decisions");
    if (!ex(adrDir)) return;
    const adrFiles = rd(adrDir).filter(f => f.startsWith("ADR-") && f.endsWith(".md"));
    const readmePath = join(adrDir, "README.md");
    if (!ex(readmePath)) {
      console.error(`[hub-cascade] ADR index hub 不存在: ${readmePath}`);
      expect(ex(readmePath)).toBe(true);
      return;
    }
    const readme = readFile(readmePath);
    const missing = adrFiles.filter(f => !readme.includes(`](${f})`));
    if (missing.length) console.error(`[hub-cascade] ADR 漏連 index hub: ${missing.join(", ")}`);
    expect(missing).toEqual([]);
  });

  it("CLAUDE.md 指向 Nova Blueprint + 全域元件歸屬規則 (Stage 1.0-H xd-ah9v)", () => {
    const claudemd = readFile(join(CLAUDE_DIR, "CLAUDE.md"));
    expect(claudemd).toContain("](obsidian/semantic/nova-blueprint.md)");
    expect(claudemd).toContain("](rules/協作/跨專案協作.md)");
  });

  it("Nova Blueprint 指向 ADR index hub (Stage 1.0-H xd-ah9v)", () => {
    const bpPath = join(CLAUDE_DIR, "obsidian/semantic/nova-blueprint.md");
    if (!ex(bpPath)) {
      console.error(`[hub-cascade] Nova Blueprint 不存在: ${bpPath}`);
      expect(ex(bpPath)).toBe(true);
      return;
    }
    const blueprint = readFile(bpPath);
    expect(blueprint).toContain("](architecture-decisions/README.md)");
  });

  it("hub BFS reachability: 所有 hub README 從 CLAUDE.md 直達或經 nova-blueprint.md 2 跳可達 (Stage 1.0-H xd-ah9v)", () => {
    const claudemd = readFile(join(CLAUDE_DIR, "CLAUDE.md"));
    const bpPath = join(CLAUDE_DIR, "obsidian/semantic/nova-blueprint.md");
    const blueprint = ex(bpPath) ? readFile(bpPath) : "";
    // 必要 hub: rules/README, skills/README, agents/README
    // nova-blueprint.md 相對路徑到 ~/.claude/{rules,skills,agents}/README.md = ../../{dir}/README.md
    const hubs = [
      { path: "rules/README.md", bpRel: "../../rules/README.md" },
      { path: "skills/README.md", bpRel: "../../skills/README.md" },
      { path: "agents/README.md", bpRel: "../../agents/README.md" },
    ];
    const missing = hubs.filter(h =>
      !claudemd.includes(`](${h.path})`) && !blueprint.includes(`](${h.bpRel})`)
    );
    if (missing.length) console.error(`[hub-cascade] hub 未從 CLAUDE.md 可達（直達 or 經 blueprint）: ${missing.map(h => h.path).join(", ")}`);
    expect(missing).toEqual([]);
  });
});

// ── wrapup-guard Phase D deliveredAt 冷卻守護（xd-yv7v 2026-04-18）─────────────────
describe("wrapup-guard Phase D deliveredAt 冷卻守護 (xd-yv7v 2026-04-18)", () => {
  const WRAPUP_PATH = join(homedir(), ".claude/hooks/modules/wrapup-guard.js");

  it("A. wrapup-guard.js 存在", () => {
    expect(existsSync(WRAPUP_PATH)).toBe(true);
  });

  it("B. autoCompleteIncomingDispatches 含 deliveredAt 60s 冷卻判斷", () => {
    const content = readFile(WRAPUP_PATH);
    // 驗證 deliveredAt 與 60_000 同時存在於 filter 邏輯
    expect(content).toMatch(/deliveredAt[\s\S]*?60_000|60_000[\s\S]*?deliveredAt/);
  });

  it("C. createdAt 30s sanity 保留（不被誤刪）", () => {
    const content = readFile(WRAPUP_PATH);
    expect(content).toMatch(/createdAt[\s\S]*?30_000/);
  });
});

// ── 自驅 Bundle manifest SoT 守護 (B' 2026-04-18) ──
describe("自驅 Bundle manifest SoT 守護 (B' 2026-04-18)", () => {
  const MANIFEST = join(homedir(), ".claude/config/bundles/self-driven.manifest.yaml");

  it("A. self-driven.manifest.yaml 存在", () => {
    expect(existsSync(MANIFEST)).toBe(true);
  });

  it("B. manifest schema 合法（schema_version + bundle_id + members）", () => {
    const c = readFileSync(MANIFEST, "utf-8");
    expect(c).toMatch(/schema_version:\s*1/);
    expect(c).toMatch(/bundle_id:\s*self-driven/);
    expect(c).toMatch(/members:/);
  });

  it("C. manifest 每成員 path 實檔存在（防 drift）", () => {
    const c = readFileSync(MANIFEST, "utf-8");
    const paths = [...c.matchAll(/^\s*-\s+path:\s+(\S+)/gm)].map(m => m[1]);
    const missing = paths.filter(p => !existsSync(join(homedir(), ".claude", p)));
    expect(missing).toEqual([]);
  });
});

// xd-adr008-phase1.5: ADR-008 Phase 1 搬家後遺症治本守護（2026-04-19）
// 問題：cwd=/Users/sbu/.claude → basename=".claude"（dot 前綴怪檔名 /tmp/nova-handoff-.claude.md）
// 修法：所有取 project name from cwd 的 callsites 必走 cwdToProject() helper（讀 projects.json SoT）
describe("cwd → project 命名一致性（ADR-008 Phase 1.5）", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");
  const HELPER_PATH = join(CLAUDE_DIR, "hooks/lib/cwd-to-project.js");

  it("A. cwd-to-project helper 存在", () => {
    expect(existsSync(HELPER_PATH)).toBe(true);
  });

  it("B. helper 能將 /Users/sbu/.claude 解成 nova-brain（SoT=projects.json）", async () => {
    const { cwdToProject } = await import(HELPER_PATH);
    expect(cwdToProject("/Users/sbu/.claude")).toBe("nova-brain");
    expect(cwdToProject("/Users/sbu/projects/nova-manager")).toBe("nova-manager");
    expect(cwdToProject("")).toBe("unknown");
    expect(cwdToProject(null)).toBe("unknown");
  });

  it("C. hooks/ 與 scripts/ 不得殘留 cwd.split(\"/\").pop() 反模式（project 名提取）", () => {
    // 允許：非 cwd 變數的 split pop（filename / path segment 等）
    // 禁止：用 basename(cwd) 當 project 名
    const dirs = [join(CLAUDE_DIR, "hooks"), join(CLAUDE_DIR, "scripts")];
    const violations = [];
    for (const dir of dirs) {
      try {
        // 找所有 <cwdVar>.split("/").pop() 模式，排除 cwd-to-project.js 本身
        const result = execSync(
          `grep -rn "\\bcwd[^\\.]*\\.split.*pop" "${dir}" --include="*.js" | grep -v cwd-to-project`,
          { encoding: "utf-8", timeout: 5000 }
        );
        for (const line of result.trim().split("\n").filter(Boolean)) {
          // 允許 list：non-cwd 變數（source_cwd/target_cwd 記錄在跨 dispatch 追蹤表，已審查 OK）
          // 但此測試主張：凡是 <X>cwd.split("/").pop() 都該用 helper
          violations.push(line);
        }
      } catch { /* grep no match = good */ }
    }
    if (violations.length > 0) {
      console.log("違反 cwd→project 一致性：\n" + violations.join("\n"));
    }
    expect(violations.length).toBe(0);
  });
});

// xd-adr008-phase1.5-gap2: helper fallback 死角守護（2026-04-19）
// 若 data/projects.json 遺失 nova-brain canonical 條目，cwdToProject("/Users/sbu/.claude") 會
// fallback 回 basename=".claude"（dot 前綴，重現 bug）。鎖定 SoT 條目完整性。
describe("projects.json SoT canonical 條目完整性（ADR-008 Phase 1.5 gap 2）", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");
  const PROJECTS_JSON = join(CLAUDE_DIR, "data/projects.json");

  it("D. projects.json 必含 cwd=/Users/sbu/.claude 的 canonical 條目（name=nova-brain）", () => {
    const projects = JSON.parse(readFileSync(PROJECTS_JSON, "utf-8"));
    const match = projects.find(p => p.cwd === join(homedir(), ".claude"));
    expect(match).toBeDefined();
    expect(match?.name).toBe("nova-brain");
  });

  it("E. cwdToProject(~/.claude) 實際返回 'nova-brain'（不依賴 fallback）", async () => {
    const { cwdToProject, _resetCacheForTest } = await import(join(CLAUDE_DIR, "hooks/lib/cwd-to-project.js"));
    _resetCacheForTest();
    expect(cwdToProject(join(homedir(), ".claude"))).toBe("nova-brain");
  });
});

// xd-adr008-phase1.5-face2: basename(cwd) 同 bug family（2026-04-19）
// C 條只抓 cwd.split("/").pop()，遺漏 basename(cwd) 同等反模式
// 發現契機：vault-session-log.js / dispatch-poller / ctx-tracker 等 5 檔使用 basename(cwd)
describe("basename(cwd) 反模式零殘留（ADR-008 Phase 1.5 face 2）", () => {
  const CLAUDE_DIR = join(homedir(), ".claude");

  it("F. hooks/ 與 scripts/ 不得用 basename(cwd|x.cwd|payload.cwd) 當 project 名", () => {
    const dirs = [join(CLAUDE_DIR, "hooks"), join(CLAUDE_DIR, "scripts")];
    const violations = [];
    for (const dir of dirs) {
      try {
        const result = execSync(
          `grep -rn "basename(.*cwd\\|basename(.*\\.cwd" "${dir}" --include="*.js" | grep -v cwd-to-project`,
          { encoding: "utf-8", timeout: 5000 }
        );
        for (const line of result.trim().split("\n").filter(Boolean)) {
          violations.push(line);
        }
      } catch { /* no match = good */ }
    }
    if (violations.length > 0) {
      console.log("違反 basename(cwd) 反模式：\n" + violations.join("\n"));
    }
    expect(violations.length).toBe(0);
  });
});

// Phase A (iter 2-11 cluster) — routing-level CLI + rule 升級
describe("Phase A: routing-level CLI", () => {
	it("scripts/routing-level.js 存在且輸出 canonical project name", () => {
		const fs = require("node:fs");
		const path = `${require("node:os").homedir()}/.claude/scripts/routing-level.js`;
		expect(fs.existsSync(path)).toBe(true);
	});
	it("rules/核心/深度路由.md 引用 routing-level.js (非 basename $PWD)", () => {
		const fs = require("node:fs");
		const content = fs.readFileSync(`${require("node:os").homedir()}/.claude/rules/核心/深度路由.md`, "utf-8");
		expect(content).toContain("routing-level.js");
	});
	it("manage-component.js 支援 script/rule/command 3 類", () => {
		const fs = require("node:fs");
		const content = fs.readFileSync(`${require("node:os").homedir()}/.claude/scripts/manage-component.js`, "utf-8");
		expect(content).toContain('"script", "rule", "command"');
		expect(content).toContain("createScript");
		expect(content).toContain("createRule");
		expect(content).toContain("createCommand");
	});
});
