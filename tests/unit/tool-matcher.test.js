// tool-matcher.test.js — tool-matcher.js 單元測試
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";

const {
  matchTools,
  matchToolsByKeyword,
} = await import(join(homedir(), ".claude/scripts/tool-matcher.js"));

// ─── 測試環境建立 ──────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), `tool-matcher-test-${Date.now()}`);
const DATA_DIR = join(TMP_DIR, "data");
const REGISTRY_PATH = join(DATA_DIR, "tool-registry.json");

const MOCK_REGISTRY = {
  version: 1,
  scannedAt: new Date().toISOString(),
  tools: [
    {
      id: "cli:gh",
      name: "gh",
      type: "cli",
      description: "GitHub CLI",
      capabilities: ["github", "pr", "issue"],
      domains: ["dev"],
      deps: [],
      path: "gh",
      lastScanned: new Date().toISOString(),
    },
    {
      id: "cli:git",
      name: "git",
      type: "cli",
      description: "版本控制",
      capabilities: ["git", "vcs", "branch", "merge", "commit"],
      domains: ["dev"],
      deps: [],
      path: "git",
      lastScanned: new Date().toISOString(),
    },
    {
      id: "os-script:screenshot",
      name: "screenshot",
      type: "os-script",
      description: "macOS 截圖工具",
      capabilities: ["screenshot", "visual", "macos"],
      domains: ["os"],
      deps: [],
      path: "/tmp/screenshot.js",
      lastScanned: new Date().toISOString(),
    },
    {
      id: "skill:debugging",
      name: "debugging",
      type: "skill",
      description: "除錯方法論與根因分析框架",
      capabilities: ["debug", "root-cause-analysis", "error-diagnosis"],
      domains: ["dev"],
      deps: [],
      path: "/tmp/debugging/SKILL.md",
      lastScanned: new Date().toISOString(),
    },
    {
      id: "mcp:claude_ai_Notion",
      name: "claude_ai_Notion",
      type: "mcp",
      description: "MCP Server: claude_ai_Notion（notion-mcp）",
      capabilities: ["notion", "docs", "database", "spec"],
      domains: [],
      deps: [],
      path: "claude_ai_Notion",
      lastScanned: new Date().toISOString(),
    },
  ],
};

function makeDeps(overrides = {}) {
  return { registryPath: REGISTRY_PATH, ...overrides };
}

beforeEach(() => {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(MOCK_REGISTRY));
});

afterEach(() => {
  try { rmSync(TMP_DIR, { recursive: true }); } catch (e) { /* cleanup */ }
});

// ─── matchToolsByKeyword 測試 ─────────────────────────────────────────────────

describe("matchToolsByKeyword", () => {
  test("空任務描述返回空推薦", () => {
    const result = matchToolsByKeyword("", MOCK_REGISTRY.tools);
    expect(result.recommended).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  test("空白字串任務描述返回空推薦", () => {
    const result = matchToolsByKeyword("   ", MOCK_REGISTRY.tools);
    expect(result.recommended).toEqual([]);
  });

  test("GitHub PR 任務正確匹配 gh", () => {
    const result = matchToolsByKeyword("管理 GitHub PR review", MOCK_REGISTRY.tools);
    const ids = result.recommended.map((t) => t.id);
    expect(ids).toContain("cli:gh");
  });

  test("截圖任務正確匹配 screenshot", () => {
    const result = matchToolsByKeyword("自動截圖分析畫面", MOCK_REGISTRY.tools);
    const ids = result.recommended.map((t) => t.id);
    expect(ids).toContain("os-script:screenshot");
  });

  test("除錯任務正確匹配 debugging skill", () => {
    const result = matchToolsByKeyword("debug 問題根因分析", MOCK_REGISTRY.tools);
    const ids = result.recommended.map((t) => t.id);
    expect(ids).toContain("skill:debugging");
  });

  test("返回結構包含 id, name, type, score, reason", () => {
    const result = matchToolsByKeyword("GitHub PR", MOCK_REGISTRY.tools);
    expect(result.recommended.length).toBeGreaterThan(0);
    const first = result.recommended[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("type");
    expect(first).toHaveProperty("score");
    expect(first).toHaveProperty("reason");
  });

  test("score 在 0-1 之間", () => {
    const result = matchToolsByKeyword("github 版本控制 debug", MOCK_REGISTRY.tools);
    for (const t of result.recommended) {
      expect(t.score).toBeGreaterThanOrEqual(0);
      expect(t.score).toBeLessThanOrEqual(1);
    }
  });

  test("結果依 score 降序排序", () => {
    const result = matchToolsByKeyword("github pr 管理", MOCK_REGISTRY.tools);
    for (let i = 1; i < result.recommended.length; i++) {
      expect(result.recommended[i - 1].score).toBeGreaterThanOrEqual(result.recommended[i].score);
    }
  });

  test("最多返回 10 個推薦工具", () => {
    // 建立 15 個工具，intent 能命中全部
    const manyTools = Array.from({ length: 15 }, (_, i) => ({
      id: `cli:tool${i}`,
      name: `tool${i}`,
      type: "cli",
      description: `test tool ${i}`,
      capabilities: ["test"],
      domains: ["dev"],
    }));
    const result = matchToolsByKeyword("test tool", manyTools);
    expect(result.recommended.length).toBeLessThanOrEqual(10);
  });

  test("missing 始終為空陣列（關鍵詞匹配無法識別缺失能力）", () => {
    const result = matchToolsByKeyword("量子電腦模擬", MOCK_REGISTRY.tools);
    expect(result.missing).toEqual([]);
  });
});

// ─── matchTools fallback 模式（無 LLM）────────────────────────────────────────

describe("matchTools fallback 模式（無 LLM）", () => {
  // 注入永遠失敗的 askLocalModelJSON，強制走 fallback
  function makeNoLLMDeps() {
    return {
      ...makeDeps(),
      askLocalModelJSON: async () => null,
      queryTools: (filters, _deps) => {
        let tools = MOCK_REGISTRY.tools;
        if (filters?.type) tools = tools.filter((t) => t.type === filters.type);
        return tools;
      },
      getCapabilitySummary: (_deps) =>
        MOCK_REGISTRY.tools.map((t) => `${t.id} | ${t.description} | ${t.capabilities.join(",")}`).join("\n"),
    };
  }

  test("LLM 不可用時 fallback 到關鍵詞匹配，仍返回結果", async () => {
    const result = await matchTools("GitHub PR review", makeNoLLMDeps());
    expect(result).toHaveProperty("recommended");
    expect(result).toHaveProperty("missing");
    expect(Array.isArray(result.recommended)).toBe(true);
  });

  test("fallback 模式下 GitHub PR 任務能找到 gh", async () => {
    const result = await matchTools("管理 GitHub PR", makeNoLLMDeps());
    const ids = result.recommended.map((t) => t.id);
    expect(ids).toContain("cli:gh");
  });

  test("空任務描述返回空推薦", async () => {
    const result = await matchTools("", makeNoLLMDeps());
    expect(result.recommended).toEqual([]);
  });

  test("空白任務描述返回空推薦", async () => {
    const result = await matchTools("   ", makeNoLLMDeps());
    expect(result.recommended).toEqual([]);
  });

  test("返回結構符合規格", async () => {
    const result = await matchTools("截圖分析", makeNoLLMDeps());
    expect(result).toHaveProperty("recommended");
    expect(result).toHaveProperty("missing");
    expect(Array.isArray(result.recommended)).toBe(true);
    expect(Array.isArray(result.missing)).toBe(true);
  });

  test("LLM 返回合法結果時正確對應工具詳情", async () => {
    const deps = {
      ...makeDeps(),
      askLocalModelJSON: async () => ({
        recommended: [{ id: "cli:gh", reason: "GitHub PR 管理", priority: "must" }],
        missing: [],
        confidence: 0.9,
      }),
      queryTools: () => MOCK_REGISTRY.tools,
      getCapabilitySummary: () => "cli:gh | GitHub CLI | github,pr,issue",
    };
    const result = await matchTools("GitHub PR review", deps);
    expect(result.recommended.length).toBeGreaterThan(0);
    expect(result.recommended[0].id).toBe("cli:gh");
    expect(result.recommended[0].name).toBe("gh");
    expect(result.recommended[0].type).toBe("cli");
    expect(typeof result.recommended[0].score).toBe("number");
  });

  test("LLM 推薦不存在的工具 ID 時過濾掉", async () => {
    const deps = {
      ...makeDeps(),
      askLocalModelJSON: async () => ({
        recommended: [
          { id: "cli:nonexistent", reason: "不存在的工具", priority: "must" },
          { id: "cli:gh", reason: "GitHub", priority: "should" },
        ],
        missing: [],
        confidence: 0.7,
      }),
      queryTools: () => MOCK_REGISTRY.tools,
      getCapabilitySummary: () => "cli:gh | GitHub CLI | github,pr",
    };
    const result = await matchTools("GitHub", deps);
    const ids = result.recommended.map((t) => t.id);
    expect(ids).not.toContain("cli:nonexistent");
    expect(ids).toContain("cli:gh");
  });
});

// CLI 整合測試已移至 tests/integration/tool-matcher-cli.test.js
