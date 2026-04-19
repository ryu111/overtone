// capability-probe.test.js — 能力邊界探測單元測試
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";

const {
  classifyStrength,
  decayCount,
  getBoundary,
  saveBoundary,
  getWeakCapabilities,
  probeSession,
  isValidCapabilityName,
} = await import(join(homedir(), ".claude/scripts/capability-probe.js"));

// ─── 測試輔助 ────────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), `cap-probe-test-${Date.now()}`);
const DATA_DIR = join(TMP_DIR, "data");
const BOUNDARY_FILE = join(DATA_DIR, "capability-boundary.json");
const IMPROVEMENTS_FILE = join(DATA_DIR, "improvements.jsonl");
const EVENTS_FILE = join(TMP_DIR, "flow-events.jsonl");

function makeDeps(overrides = {}) {
  return {
    boundaryFile: BOUNDARY_FILE,
    dataDir: DATA_DIR,
    improvementsFile: IMPROVEMENTS_FILE,
    existsSync,
    readFileSync,
    appendFileSync: (path, data) => {
      const { appendFileSync: afs } = require("fs");
      afs(path, data);
    },
    mkdirSync,
    writeFileSync,
    ...overrides,
  };
}

function writeEvents(events) {
  writeFileSync(EVENTS_FILE, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

function writeBoundary(boundary) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(BOUNDARY_FILE, JSON.stringify(boundary));
}

beforeEach(() => {
  mkdirSync(DATA_DIR, { recursive: true });
});

afterEach(() => {
  try { rmSync(TMP_DIR, { recursive: true }); } catch (e) { /* cleanup */ }
});

// ─── classifyStrength 測試 ──────────────────────────────────────────────────

describe("classifyStrength", () => {
  test("coverageHits > 0 且 missingHits == 0 → strong", () => {
    expect(classifyStrength({ coverageHits: 5, missingHits: 0 })).toBe("strong");
  });

  test("coverageHits > missingHits → adequate", () => {
    expect(classifyStrength({ coverageHits: 5, missingHits: 3 })).toBe("adequate");
  });

  test("coverageHits <= missingHits 且 coverageHits > 0 → weak", () => {
    expect(classifyStrength({ coverageHits: 2, missingHits: 4 })).toBe("weak");
  });

  test("coverageHits == 0 → missing", () => {
    expect(classifyStrength({ coverageHits: 0, missingHits: 3 })).toBe("missing");
  });

  test("兩者都為 0 → missing", () => {
    expect(classifyStrength({ coverageHits: 0, missingHits: 0 })).toBe("missing");
  });

  test("相等且 > 0 → weak", () => {
    expect(classifyStrength({ coverageHits: 3, missingHits: 3 })).toBe("weak");
  });
});

// ─── decayCount 測試 ────────────────────────────────────────────────────────

describe("decayCount", () => {
  test("0 天不衰減", () => {
    expect(decayCount(100, 0)).toBe(100);
  });

  test("30 天 x0.8", () => {
    expect(decayCount(100, 30)).toBe(80);
  });

  test("90 天 x0.512", () => {
    // 0.8^3 = 0.512 → round(51.2) = 51
    expect(decayCount(100, 90)).toBe(51);
  });

  test("count 為 0 → 永遠回傳 0", () => {
    expect(decayCount(0, 30)).toBe(0);
  });
});

// ─── isValidCapabilityName 測試 ──────────────────────────────────────────────

describe("isValidCapabilityName", () => {
  test("有效英文 slug → true", () => {
    expect(isValidCapabilityName("pdf-parser")).toBe(true);
    expect(isValidCapabilityName("task_description")).toBe(true);
    expect(isValidCapabilityName("hook-error-recovery-framework")).toBe(true);
  });

  test("短中文能力名 ≤4 字 → true", () => {
    expect(isValidCapabilityName("截圖")).toBe(true);
    expect(isValidCapabilityName("通知")).toBe(true);
    expect(isValidCapabilityName("評分維度")).toBe(true);
  });

  test("含空白的描述性文字 → false（prompt 片段）", () => {
    expect(isValidCapabilityName("task description")).toBe(false);
    expect(isValidCapabilityName("具體 rule 內容")).toBe(false);
  });

  test("含中文標點 → false（prompt 片段）", () => {
    expect(isValidCapabilityName("具體 hook 代碼（需提供以執行審查）")).toBe(false);
    expect(isValidCapabilityName("穩定性基準（SLA 需求）")).toBe(false);
  });

  test("純中文超過 4 字 → false（描述性文字）", () => {
    expect(isValidCapabilityName("具體任務描述")).toBe(false);
    expect(isValidCapabilityName("評分維度詳細定義")).toBe(false);
  });

  test("空值或過短過長 → false", () => {
    expect(isValidCapabilityName("")).toBe(false);
    expect(isValidCapabilityName("a")).toBe(false);
    expect(isValidCapabilityName(null)).toBe(false);
    expect(isValidCapabilityName("x".repeat(51))).toBe(false);
  });
});

// ─── getBoundary 測試 ───────────────────────────────────────────────────────

describe("getBoundary", () => {
  test("檔案不存在 → 回傳空模型", () => {
    const boundary = getBoundary(makeDeps());
    expect(boundary.version).toBe(1);
    expect(boundary.capabilities).toEqual({});
    expect(boundary.sessions.total).toBe(0);
  });

  test("正常讀取", () => {
    const data = {
      version: 1,
      capabilities: { git: { coverageHits: 5, missingHits: 0, strength: "strong" } },
      sessions: { total: 10, withGaps: 2, lastAnalyzed: "2026-03-17T00:00:00Z" },
    };
    writeBoundary(data);
    const boundary = getBoundary(makeDeps());
    expect(boundary.capabilities.git.coverageHits).toBe(5);
    expect(boundary.sessions.total).toBe(10);
  });

  test("損壞 JSON → 回傳空模型", () => {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(BOUNDARY_FILE, "not valid json{{{");
    const boundary = getBoundary(makeDeps());
    expect(boundary.version).toBe(1);
    expect(boundary.capabilities).toEqual({});
  });
});

// ─── saveBoundary 測試 ──────────────────────────────────────────────────────

describe("saveBoundary", () => {
  test("寫入並可讀回", () => {
    const data = {
      version: 1,
      capabilities: { test: { coverageHits: 1, missingHits: 0, strength: "strong" } },
      sessions: { total: 1, withGaps: 0, lastAnalyzed: null },
    };
    saveBoundary(data, makeDeps());
    const read = getBoundary(makeDeps());
    expect(read.capabilities.test.coverageHits).toBe(1);
  });
});

// ─── getWeakCapabilities 測試 ───────────────────────────────────────────────

describe("getWeakCapabilities", () => {
  test("過濾 weak + missing", () => {
    writeBoundary({
      version: 1,
      capabilities: {
        git: { coverageHits: 10, missingHits: 0, strength: "strong" },
        database: { coverageHits: 2, missingHits: 4, strength: "weak" },
        browser: { coverageHits: 0, missingHits: 3, strength: "missing" },
        api: { coverageHits: 5, missingHits: 2, strength: "adequate" },
      },
      sessions: { total: 20, withGaps: 5, lastAnalyzed: null },
    });
    const weak = getWeakCapabilities(makeDeps());
    expect(weak.length).toBe(2);
    expect(weak.map((w) => w.name).sort()).toEqual(["browser", "database"]);
  });

  test("無 weak/missing → 空陣列", () => {
    writeBoundary({
      version: 1,
      capabilities: { git: { coverageHits: 10, missingHits: 0, strength: "strong" } },
      sessions: { total: 10, withGaps: 0, lastAnalyzed: null },
    });
    expect(getWeakCapabilities(makeDeps()).length).toBe(0);
  });
});

// ─── probeSession 測試 ──────────────────────────────────────────────────────

describe("probeSession", () => {
  test("空 events 檔案 → 跳過不 crash", async () => {
    const result = await probeSession("/nonexistent/file.jsonl", makeDeps());
    expect(result.skipped).toBeTruthy();
    expect(result.coverage).toBe(1.0);
    expect(result.triggeredImprovements).toEqual([]);
  });

  test("有缺口 → missingHits 增加", async () => {
    writeEvents([
      { sid: 1, type: "prompt_submit", prompt_preview: "管理資料庫 migration" },
      { sid: 1, type: "tool_use", tool_name: "git" },
    ]);

    const deps = makeDeps({
      matchTools: async (intent) => ({
        recommended: [{ id: "git", name: "git" }, { id: "sqlite3", name: "sqlite3" }],
        missing: ["database-migration"],
      }),
    });

    const result = await probeSession(EVENTS_FILE, deps);
    expect(result.intent).toContain("資料庫");
    expect(result.missing).toContain("database-migration");
    expect(result.updatedBoundary.capabilities["database-migration"].missingHits).toBeGreaterThanOrEqual(1);
  });

  test("無缺口 → coverageHits 增加", async () => {
    writeEvents([
      { sid: 1, type: "prompt_submit", prompt_preview: "git commit" },
      { sid: 1, type: "tool_use", tool_name: "git" },
    ]);

    const deps = makeDeps({
      matchTools: async () => ({
        recommended: [{ id: "git", name: "git" }],
        missing: [],
      }),
    });

    const result = await probeSession(EVENTS_FILE, deps);
    expect(result.missing.length).toBe(0);
    expect(result.updatedBoundary.capabilities.git.coverageHits).toBe(1);
    expect(result.updatedBoundary.capabilities.git.strength).toBe("strong");
  });

  test("失敗信號 → missingHits 加倍（+2）", async () => {
    writeEvents([
      { sid: 1, type: "prompt_submit", prompt_preview: "修正資料庫錯誤" },
      { sid: 1, type: "tool_use", tool_name: "git" },
      { sid: 1, type: "hook_error", error: "test error" },
    ]);

    const deps = makeDeps({
      matchTools: async () => ({
        recommended: [{ id: "git", name: "git" }],
        missing: ["database-fix"],
      }),
    });

    const result = await probeSession(EVENTS_FILE, deps);
    expect(result.hasFailureSignals).toBe(true);
    // 失敗信號 +2 而非 +1
    expect(result.updatedBoundary.capabilities["database-fix"].missingHits).toBe(2);
  });

  test("門檻觸發：missingHits >= 3 → improvements.jsonl 寫入", async () => {
    // 預先寫入已有 2 次 missingHits 的邊界
    writeBoundary({
      version: 1,
      capabilities: {
        "web-scraping": { coverageHits: 0, missingHits: 2, lastSeen: new Date().toISOString().slice(0, 10), strength: "missing" },
      },
      sessions: { total: 5, withGaps: 2, lastAnalyzed: null },
    });

    writeEvents([
      { sid: 1, type: "prompt_submit", prompt_preview: "scrape website data" },
      { sid: 1, type: "tool_use", tool_name: "curl" },
    ]);

    const deps = makeDeps({
      matchTools: async () => ({
        recommended: [{ id: "curl", name: "curl" }],
        missing: ["web-scraping"],
      }),
    });

    const result = await probeSession(EVENTS_FILE, deps);
    expect(result.triggeredImprovements.length).toBeGreaterThanOrEqual(1);
    expect(result.triggeredImprovements[0].capability).toBe("web-scraping");
    expect(result.triggeredImprovements[0].source).toBe("capability-probe");

    // 驗證 improvements.jsonl 已寫入
    expect(existsSync(IMPROVEMENTS_FILE)).toBe(true);
    const raw = readFileSync(IMPROVEMENTS_FILE, "utf-8").trim();
    const entry = JSON.parse(raw);
    expect(entry.type).toBe("capability-gap");
    expect(entry.capability).toBe("web-scraping");
  });

  test("多 prompt 合併 intent", async () => {
    writeEvents([
      { sid: 2, type: "prompt_submit", prompt_preview: "建立資料庫" },
      { sid: 2, type: "prompt_submit", prompt_preview: "新增 migration" },
      { sid: 2, type: "tool_use", tool_name: "sqlite3" },
      { sid: 1, type: "prompt_submit", prompt_preview: "舊 session 不該出現" },
    ]);

    const deps = makeDeps({
      matchTools: async () => ({ recommended: [], missing: [] }),
    });

    const result = await probeSession(EVENTS_FILE, deps);
    expect(result.intent).toContain("建立資料庫");
    expect(result.intent).toContain("新增 migration");
    expect(result.intent).not.toContain("舊 session");
  });

  test("boundary.json 損壞 → 從空模型重建", async () => {
    writeFileSync(BOUNDARY_FILE, "corrupted{{{");
    writeEvents([
      { sid: 1, type: "prompt_submit", prompt_preview: "test" },
      { sid: 1, type: "tool_use", tool_name: "git" },
    ]);

    const deps = makeDeps({
      matchTools: async () => ({ recommended: [{ id: "git", name: "git" }], missing: [] }),
    });

    const result = await probeSession(EVENTS_FILE, deps);
    expect(result.updatedBoundary.version).toBe(1);
    expect(result.updatedBoundary.capabilities.git.coverageHits).toBe(1);
  });

  test("無效能力名稱（prompt 片段）被過濾 → 不寫入 boundary", async () => {
    writeEvents([
      { sid: 1, type: "prompt_submit", prompt_preview: "評估 hook 品質" },
      { sid: 1, type: "tool_use", tool_name: "grep" },
    ]);

    const deps = makeDeps({
      matchTools: async () => ({
        recommended: [{ id: "grep", name: "grep" }],
        missing: [
          "具體 hook 代碼（需提供以執行審查）",
          "具體任務描述",
          "task description",
          "hook-quality-checker",
        ],
      }),
    });

    const result = await probeSession(EVENTS_FILE, deps);
    // 只有 "hook-quality-checker" 通過驗證
    expect(result.missing).toContain("hook-quality-checker");
    expect(result.missing).not.toContain("具體 hook 代碼（需提供以執行審查）");
    expect(result.missing).not.toContain("具體任務描述");
    expect(result.missing).not.toContain("task description");
    expect(result.updatedBoundary.capabilities["hook-quality-checker"]).toBeDefined();
    expect(result.updatedBoundary.capabilities["具體任務描述"]).toBeUndefined();
  });

  test("歷史無效 boundary 條目在 probe 時被清理", async () => {
    writeBoundary({
      version: 1,
      capabilities: {
        "valid-tool": { coverageHits: 3, missingHits: 0, lastSeen: "2026-03-17", strength: "strong" },
        "具體 hook 代碼（需提供以執行審查）": { coverageHits: 0, missingHits: 5, lastSeen: "2026-03-16", strength: "missing" },
        "評分維度詳細定義": { coverageHits: 0, missingHits: 4, lastSeen: "2026-03-16", strength: "missing" },
      },
      sessions: { total: 10, withGaps: 3, lastAnalyzed: null },
    });

    writeEvents([
      { sid: 1, type: "prompt_submit", prompt_preview: "test" },
      { sid: 1, type: "tool_use", tool_name: "git" },
    ]);

    const deps = makeDeps({
      matchTools: async () => ({ recommended: [{ id: "git", name: "git" }], missing: [] }),
    });

    const result = await probeSession(EVENTS_FILE, deps);
    // valid-tool 保留，無效條目被清理
    expect(result.updatedBoundary.capabilities["valid-tool"]).toBeDefined();
    expect(result.updatedBoundary.capabilities["具體 hook 代碼（需提供以執行審查）"]).toBeUndefined();
    expect(result.updatedBoundary.capabilities["評分維度詳細定義"]).toBeUndefined();
  });
});
