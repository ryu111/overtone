// tool-registry.test.js — tool-registry.js 單元測試
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";

const {
  scanTools,
  queryTools,
  getTool,
  getCapabilitySummary,
  checkRegistryAge,
} = await import(join(homedir(), ".claude/scripts/tool-registry.js"));

// ─── 測試環境建立 ──────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), `tool-registry-test-${Date.now()}`);
const SKILLS_DIR = join(TMP_DIR, "skills");
const SCRIPTS_DIR = join(TMP_DIR, "scripts");
const OS_SCRIPTS_DIR = join(TMP_DIR, "scripts", "os");
const DATA_DIR = join(TMP_DIR, "data");
const REGISTRY_PATH = join(DATA_DIR, "tool-registry.json");
const SETTINGS_PATH = join(TMP_DIR, "settings.json");

function makeDeps() {
  return { claudeDir: TMP_DIR, registryPath: REGISTRY_PATH };
}

function makeSkill(name, description) {
  const dir = join(SKILLS_DIR, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n内容`
  );
}

function makeScript(dir, name, commentLine) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.js`), `#!/usr/bin/env bun\n\n// ${name}.js — ${commentLine}\n\nexport function main() {}`);
}

beforeEach(() => {
  mkdirSync(SKILLS_DIR, { recursive: true });
  mkdirSync(SCRIPTS_DIR, { recursive: true });
  mkdirSync(OS_SCRIPTS_DIR, { recursive: true });
  mkdirSync(DATA_DIR, { recursive: true });

  // 預設空 settings.json
  writeFileSync(SETTINGS_PATH, JSON.stringify({}));
});

afterEach(() => {
  try { rmSync(TMP_DIR, { recursive: true }); } catch (e) { /* cleanup */ }
});

// ─── scanTools 測試 ──────────────────────────────────────────────────────────

describe("scanTools", () => {
  test("掃描 skills 並正確提取 frontmatter", async () => {
    makeSkill("debugging", "除錯方法論與根因分析框架");
    makeSkill("security-kb", "安全審查知識庫");

    const result = await scanTools(makeDeps());
    const skillIds = result.tools.filter((t) => t.type === "skill").map((t) => t.id);

    expect(skillIds).toContain("skill:debugging");
    expect(skillIds).toContain("skill:security-kb");
    expect(result.tools.find((t) => t.id === "skill:debugging").description).toContain("除錯");
  });

  test("缺 frontmatter 的 SKILL.md 跳過不 crash", async () => {
    mkdirSync(join(SKILLS_DIR, "broken-skill"), { recursive: true });
    writeFileSync(join(SKILLS_DIR, "broken-skill", "SKILL.md"), "# 沒有 frontmatter 的 skill\n");

    makeSkill("valid", "正常的 skill");
    const result = await scanTools(makeDeps());
    const skillIds = result.tools.filter((t) => t.type === "skill").map((t) => t.id);

    // broken-skill 被跳過
    expect(skillIds).not.toContain("skill:broken-skill");
    // valid 仍然存在
    expect(skillIds).toContain("skill:valid");
  });

  test("掃描 scripts 並提取頭部註解", async () => {
    makeScript(SCRIPTS_DIR, "maintainer", "本地模型驅動的維護 agent");
    makeScript(SCRIPTS_DIR, "judge", "通用品質評估");

    const result = await scanTools(makeDeps());
    const scriptIds = result.tools.filter((t) => t.type === "script").map((t) => t.id);

    expect(scriptIds).toContain("script:maintainer");
    expect(scriptIds).toContain("script:judge");
  });

  test("掃描 os-scripts", async () => {
    makeScript(OS_SCRIPTS_DIR, "screenshot", "macOS 截圖工具");
    makeScript(OS_SCRIPTS_DIR, "clipboard", "剪貼簿操作");

    const result = await scanTools(makeDeps());
    const osIds = result.tools.filter((t) => t.type === "os-script").map((t) => t.id);

    expect(osIds).toContain("os-script:screenshot");
    expect(osIds).toContain("os-script:clipboard");
  });

  test("掃描 mcpServers 並建立工具項目", async () => {
    writeFileSync(
      SETTINGS_PATH,
      JSON.stringify({
        mcpServers: {
          "claude_ai_Notion": { command: "notion-mcp", args: [] },
          "pinchtab": { command: "pinchtab", args: [] },
        },
      })
    );

    const result = await scanTools(makeDeps());
    const mcpIds = result.tools.filter((t) => t.type === "mcp").map((t) => t.id);

    expect(mcpIds).toContain("mcp:claude_ai_Notion");
    expect(mcpIds).toContain("mcp:pinchtab");
  });

  test("settings.json 無 mcpServers 時不報錯", async () => {
    writeFileSync(SETTINGS_PATH, JSON.stringify({ permissions: {} }));
    const result = await scanTools(makeDeps());
    const mcpTools = result.tools.filter((t) => t.type === "mcp");
    expect(mcpTools.length).toBe(0);
  });

  test("CLI 工具固定包含 git 和 gh", async () => {
    const result = await scanTools(makeDeps());
    const cliIds = result.tools.filter((t) => t.type === "cli").map((t) => t.id);

    expect(cliIds).toContain("cli:git");
    expect(cliIds).toContain("cli:gh");
    expect(cliIds).toContain("cli:bun");
    expect(cliIds).toContain("cli:curl");
  });

  test("索引寫入檔案且格式正確", async () => {
    makeSkill("test-skill", "測試 skill");
    const result = await scanTools(makeDeps());

    expect(existsSync(REGISTRY_PATH)).toBe(true);
    expect(result.version).toBe(1);
    expect(typeof result.scannedAt).toBe("string");
    expect(Array.isArray(result.tools)).toBe(true);
  });

  test("工具 ID 格式為 type:name", async () => {
    makeSkill("my-skill", "測試");
    const result = await scanTools(makeDeps());
    const tool = result.tools.find((t) => t.name === "my-skill");
    expect(tool.id).toBe("skill:my-skill");
  });
});

// ─── queryTools 測試 ─────────────────────────────────────────────────────────

describe("queryTools", () => {
  async function setupRegistry() {
    makeSkill("debugging", "除錯方法論");
    makeSkill("security-kb", "安全審查知識");
    makeScript(SCRIPTS_DIR, "judge", "品質評估");
    return await scanTools(makeDeps());
  }

  test("不帶過濾條件時返回所有工具", async () => {
    const registry = await setupRegistry();
    const tools = queryTools({}, { ...makeDeps(), registry });
    expect(tools.length).toBeGreaterThan(0);
  });

  test("type 過濾正確", async () => {
    const registry = await setupRegistry();
    const skills = queryTools({ type: "skill" }, { ...makeDeps(), registry });
    expect(skills.every((t) => t.type === "skill")).toBe(true);
    expect(skills.length).toBeGreaterThanOrEqual(2);
  });

  test("不存在的 type 返回空陣列", async () => {
    const registry = await setupRegistry();
    const tools = queryTools({ type: "nonexistent" }, { ...makeDeps(), registry });
    expect(tools).toEqual([]);
  });

  test("capability 過濾正確", async () => {
    const registry = await setupRegistry();
    // debugging skill 包含 "debug" capability
    const tools = queryTools({ capability: "debug" }, { ...makeDeps(), registry });
    const hasDebugging = tools.some((t) => t.name === "debugging");
    expect(hasDebugging).toBe(true);
  });

  test("索引不存在時返回空陣列", () => {
    const tools = queryTools({}, { registryPath: "/nonexistent/path/registry.json" });
    expect(tools).toEqual([]);
  });
});

// ─── getTool 測試 ─────────────────────────────────────────────────────────────

describe("getTool", () => {
  test("正確返回指定 ID 的工具", async () => {
    makeSkill("debugging", "除錯方法論");
    const registry = await scanTools(makeDeps());
    const tool = getTool("skill:debugging", { ...makeDeps(), registry });
    expect(tool).not.toBeNull();
    expect(tool.id).toBe("skill:debugging");
    expect(tool.type).toBe("skill");
    expect(tool.name).toBe("debugging");
  });

  test("不存在的 ID 返回 null", async () => {
    const registry = await scanTools(makeDeps());
    const tool = getTool("skill:nonexistent", { ...makeDeps(), registry });
    expect(tool).toBeNull();
  });

  test("CLI 工具可查詢", async () => {
    const registry = await scanTools(makeDeps());
    const tool = getTool("cli:git", { ...makeDeps(), registry });
    expect(tool).not.toBeNull();
    expect(tool.type).toBe("cli");
  });
});

// ─── getCapabilitySummary 測試 ────────────────────────────────────────────────

describe("getCapabilitySummary", () => {
  test("每個工具輸出一行", async () => {
    makeSkill("debugging", "除錯方法論");
    makeSkill("security-kb", "安全審查知識");
    const registry = await scanTools(makeDeps());
    const summary = getCapabilitySummary({ ...makeDeps(), registry });

    const lines = summary.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  test("每行格式為 id | description | capabilities", async () => {
    makeSkill("debugging", "除錯方法論");
    const registry = await scanTools(makeDeps());
    const summary = getCapabilitySummary({ ...makeDeps(), registry });

    const debugLine = summary.split("\n").find((l) => l.startsWith("skill:debugging"));
    expect(debugLine).toBeDefined();
    const parts = debugLine.split(" | ");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("skill:debugging");
  });

  test("索引為空時返回空字串", () => {
    const summary = getCapabilitySummary({ registryPath: "/nonexistent/path.json" });
    expect(summary).toBe("");
  });
});

// ─── checkRegistryAge 測試 ───────────────────────────────────────────────────

describe("checkRegistryAge", () => {
  test("索引不存在時 exists=false", () => {
    const result = checkRegistryAge({ registryPath: "/nonexistent/path.json" });
    expect(result.exists).toBe(false);
    expect(result.stale).toBe(false);
  });

  test("剛掃描的索引不 stale", async () => {
    makeSkill("test", "測試");
    await scanTools(makeDeps());
    const result = checkRegistryAge(makeDeps());
    expect(result.exists).toBe(true);
    expect(result.stale).toBe(false);
  });

  test("舊索引標記為 stale", async () => {
    makeSkill("test", "測試");
    const registry = { version: 1, scannedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), tools: [] };
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry));
    const result = checkRegistryAge(makeDeps());
    expect(result.stale).toBe(true);
  });
});

// CLI 整合測試已移至 tests/integration/tool-registry-cli.test.js
