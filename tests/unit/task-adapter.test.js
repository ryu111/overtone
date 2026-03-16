// task-adapter.test.js — R4.3 任務快速適應機制單元測試
import { describe, it, expect, beforeEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";

import {
  classifyTask,
  keywordOverlap,
  decayConfidence,
  selectBestPlan,
  loadPatterns,
  savePatterns,
  lookupPattern,
  planForTask,
  recordOutcome,
  listPatterns,
  prunePatterns,
} from "/Users/sbu/.claude/scripts/task-adapter.js";

// ─── 測試輔助 ────────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), `task-adapter-test-${Date.now()}`);
const PATTERNS_FILE = join(TMP_DIR, "task-patterns.json");

/**
 * in-memory FS mock：所有 IO 在 Map 中進行，不觸碰真實檔案系統
 */
function makeMemoryDeps(initialData = null) {
  const store = new Map();
  if (initialData !== null) {
    store.set(PATTERNS_FILE, JSON.stringify(initialData, null, 2));
  }
  return {
    patternsFile: PATTERNS_FILE,
    existsSync: (path) => store.has(path),
    readFileSync: (path) => {
      if (!store.has(path)) throw new Error(`ENOENT: ${path}`);
      return store.get(path);
    },
    writeFileSync: (path, content) => { store.set(path, content); },
    mkdirSync: () => {},
    _store: store,
    _read: () => {
      const raw = store.get(PATTERNS_FILE);
      return raw ? JSON.parse(raw) : null;
    },
  };
}

/** 建立有有效模式的 deps */
function makeDepsWithPattern(type, confidence, daysOld = 0) {
  const lastSeen = new Date(Date.now() - daysOld * 86400000).toISOString();
  const data = {
    version: 1,
    patterns: {
      [type]: {
        type,
        keywords: ["fix", "bug", "auth"],
        successfulPlans: [
          { tools: ["bash", "editor"], depth: "D1", successCount: 5, failCount: 1, consecutiveFails: 0, lastUsed: lastSeen, avgDuration: 120 },
        ],
        totalAttempts: 6,
        lastSeen,
        confidence,
      },
    },
    stats: { totalPatterns: 1, totalAttempts: 6, lastUpdated: lastSeen },
  };
  return makeMemoryDeps(data);
}

// ─── classifyTask ────────────────────────────────────────────────────────────

describe("classifyTask", () => {
  it('英文 "fix bug in auth module" → bug-fix', () => {
    const { type } = classifyTask("fix bug in auth module");
    expect(type).toBe("bug-fix");
  });

  it('中文 "建立新功能" → feature', () => {
    const { type } = classifyTask("建立新功能");
    expect(type).toBe("feature");
  });

  it('混合 "security audit 安全" → security', () => {
    const { type } = classifyTask("security audit 安全");
    expect(type).toBe("security");
  });

  it('"review the PR code" → code-review', () => {
    const { type } = classifyTask("review the PR code");
    expect(type).toBe("code-review");
  });

  it('"重構 cleanup 整理" → refactor', () => {
    const { type } = classifyTask("重構 cleanup 整理");
    expect(type).toBe("refactor");
  });

  it('"寫測試 coverage" → test', () => {
    const { type } = classifyTask("寫測試 coverage");
    expect(type).toBe("test");
  });

  it('"更新文件 readme" → docs', () => {
    const { type } = classifyTask("更新文件 readme");
    expect(type).toBe("docs");
  });

  it('"deploy ci cd release" → deploy', () => {
    const { type } = classifyTask("deploy ci cd release");
    expect(type).toBe("deploy");
  });

  it('"database migration sql" → data', () => {
    const { type } = classifyTask("database migration sql");
    expect(type).toBe("data");
  });

  it('"frontend component css" → ui', () => {
    const { type } = classifyTask("frontend component css");
    expect(type).toBe("ui");
  });

  it('"infra server daemon hook" → infra', () => {
    const { type } = classifyTask("infra server daemon hook");
    expect(type).toBe("infra");
  });

  it('"skill forge 知識學習" → skill', () => {
    const { type } = classifyTask("skill forge 知識學習");
    expect(type).toBe("skill");
  });

  it('無匹配 "random text" → general', () => {
    const { type } = classifyTask("random text");
    expect(type).toBe("general");
  });

  it('空字串 → general', () => {
    const { type } = classifyTask("");
    expect(type).toBe("general");
  });

  it('空字串 keywords 為空陣列', () => {
    const { keywords } = classifyTask("");
    expect(keywords).toEqual([]);
  });

  it('有效描述 keywords 包含提取詞彙', () => {
    const { keywords } = classifyTask("fix bug auth");
    expect(keywords).toContain("fix");
    expect(keywords).toContain("bug");
    expect(keywords).toContain("auth");
  });
});

// ─── keywordOverlap ──────────────────────────────────────────────────────────

describe("keywordOverlap", () => {
  it("完全相同 → 1.0", () => {
    expect(keywordOverlap(["a", "b", "c"], ["a", "b", "c"])).toBe(1.0);
  });

  it("完全不同 → 0", () => {
    expect(keywordOverlap(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("部分重疊 → 正確 Jaccard 值", () => {
    // 交集 {b}，聯集 {a,b,c,d}，Jaccard = 1/4 = 0.25
    expect(keywordOverlap(["a", "b"], ["b", "c", "d"])).toBeCloseTo(1 / 4, 5);
  });

  it("空陣列 A → 0", () => {
    expect(keywordOverlap([], ["a", "b"])).toBe(0);
  });

  it("空陣列 B → 0", () => {
    expect(keywordOverlap(["a", "b"], [])).toBe(0);
  });

  it("兩者皆空 → 0", () => {
    expect(keywordOverlap([], [])).toBe(0);
  });

  it("null 輸入 → 0", () => {
    expect(keywordOverlap(null, ["a"])).toBe(0);
    expect(keywordOverlap(["a"], null)).toBe(0);
  });
});

// ─── decayConfidence ─────────────────────────────────────────────────────────

describe("decayConfidence", () => {
  it("0 天 → 不衰減", () => {
    expect(decayConfidence(0.8, 0)).toBeCloseTo(0.8, 5);
  });

  it("30 天 → x0.8", () => {
    expect(decayConfidence(1.0, 30)).toBeCloseTo(0.8, 5);
  });

  it("60 天 → x0.64", () => {
    expect(decayConfidence(1.0, 60)).toBeCloseTo(0.64, 5);
  });

  it("90 天 → x0.512", () => {
    expect(decayConfidence(1.0, 90)).toBeCloseTo(0.512, 5);
  });

  it("負數天數 → 視為 0 天不衰減", () => {
    expect(decayConfidence(0.8, -5)).toBeCloseTo(0.8, 5);
  });
});

// ─── selectBestPlan ──────────────────────────────────────────────────────────

describe("selectBestPlan", () => {
  it("空陣列 → null", () => {
    expect(selectBestPlan([])).toBeNull();
  });

  it("null → null", () => {
    expect(selectBestPlan(null)).toBeNull();
  });

  it("單元素 → 回傳該元素", () => {
    const plan = { tools: ["a"], depth: "D1", successCount: 3, failCount: 1, consecutiveFails: 0, lastUsed: "2026-01-01", avgDuration: 100 };
    expect(selectBestPlan([plan])).toBe(plan);
  });

  it("按成功率降序排列，取最佳", () => {
    const low = { tools: [], depth: "D1", successCount: 1, failCount: 3, consecutiveFails: 0, lastUsed: "2026-01-01", avgDuration: 100 };
    const high = { tools: [], depth: "D2", successCount: 9, failCount: 1, consecutiveFails: 0, lastUsed: "2026-01-01", avgDuration: 100 };
    expect(selectBestPlan([low, high])).toBe(high);
  });

  it("成功率相同 → 最近使用優先", () => {
    const older = { tools: [], depth: "D1", successCount: 5, failCount: 5, consecutiveFails: 0, lastUsed: "2026-01-01", avgDuration: 100 };
    const newer = { tools: [], depth: "D2", successCount: 5, failCount: 5, consecutiveFails: 0, lastUsed: "2026-03-01", avgDuration: 100 };
    expect(selectBestPlan([older, newer])).toBe(newer);
  });

  it("成功率和 lastUsed 相同 → avgDuration 升序（最短優先）", () => {
    const slow = { tools: [], depth: "D1", successCount: 5, failCount: 5, consecutiveFails: 0, lastUsed: "2026-01-01", avgDuration: 300 };
    const fast = { tools: [], depth: "D2", successCount: 5, failCount: 5, consecutiveFails: 0, lastUsed: "2026-01-01", avgDuration: 100 };
    expect(selectBestPlan([slow, fast])).toBe(fast);
  });
});

// ─── loadPatterns / savePatterns ─────────────────────────────────────────────

describe("loadPatterns", () => {
  it("檔案不存在 → 回傳空模型", () => {
    const deps = makeMemoryDeps();
    const data = loadPatterns(deps);
    expect(data.version).toBe(1);
    expect(data.patterns).toEqual({});
  });

  it("損壞 JSON → 回傳空模型", () => {
    const deps = makeMemoryDeps();
    deps._store.set(PATTERNS_FILE, "{ broken json {{");
    const data = loadPatterns(deps);
    expect(data.patterns).toEqual({});
  });

  it("patterns 非 object → 回傳空模型", () => {
    const deps = makeMemoryDeps();
    deps._store.set(PATTERNS_FILE, JSON.stringify({ version: 1, patterns: null, stats: {} }));
    const data = loadPatterns(deps);
    expect(data.patterns).toEqual({});
  });

  it("有效 JSON → 正確解析", () => {
    const initial = { version: 1, patterns: { "bug-fix": { type: "bug-fix", confidence: 0.8 } }, stats: {} };
    const deps = makeMemoryDeps(initial);
    const data = loadPatterns(deps);
    expect(data.patterns["bug-fix"].type).toBe("bug-fix");
  });
});

describe("savePatterns", () => {
  it("正確寫入並可讀回", () => {
    const deps = makeMemoryDeps();
    const toSave = { version: 1, patterns: { "test": { type: "test", confidence: 0.7 } }, stats: {} };
    savePatterns(toSave, deps);
    const read = loadPatterns(deps);
    expect(read.patterns["test"].confidence).toBe(0.7);
  });
});

// ─── lookupPattern ────────────────────────────────────────────────────────────

describe("lookupPattern", () => {
  it("空 patterns → null", () => {
    const deps = makeMemoryDeps();
    expect(lookupPattern("fix bug", deps)).toBeNull();
  });

  it("精確匹配存在 + confidence >= 0.6 → 回傳 pattern", () => {
    const deps = makeDepsWithPattern("bug-fix", 0.8, 0);
    const result = lookupPattern("fix bug in auth", deps);
    expect(result).not.toBeNull();
    expect(result.pattern.type).toBe("bug-fix");
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("精確匹配存在 + confidence < 0.6 → 回傳 null", () => {
    // 低信心 + 過期讓衰減後 < 0.6
    const deps = makeDepsWithPattern("bug-fix", 0.3, 0);
    const result = lookupPattern("fix bug", deps);
    expect(result).toBeNull();
  });

  it("無精確匹配 + 模糊匹配 Jaccard >= 0.4 → 回傳", () => {
    // feature 類型，但用 fix/bug 關鍵詞搜索，利用模糊匹配
    const lastSeen = new Date().toISOString();
    const data = {
      version: 1,
      patterns: {
        "test-overlap": {
          type: "test-overlap",
          keywords: ["fix", "bug", "module"],
          successfulPlans: [],
          totalAttempts: 1,
          lastSeen,
          confidence: 0.9,
        },
      },
      stats: {},
    };
    const deps = makeMemoryDeps(data);
    // "fix bug" → keywords: ["fix", "bug"]，與 ["fix","bug","module"] 交集 2，聯集 3，Jaccard = 0.667
    const result = lookupPattern("fix bug", deps);
    expect(result).not.toBeNull();
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("無任何匹配 → null", () => {
    const deps = makeDepsWithPattern("feature", 0.9, 0);
    // feature 的 keywords 是英文 fix/bug，但我們搜的是完全不同的詞
    const result = lookupPattern("ui component css 介面", deps);
    // feature 的 keywords 是 ["fix","bug","auth"]，與 ui 完全不重疊
    expect(result).toBeNull();
  });
});

// ─── planForTask ──────────────────────────────────────────────────────────────

describe("planForTask", () => {
  it("空描述 → source: fallback", async () => {
    const deps = makeMemoryDeps();
    const plan = await planForTask("", {}, deps);
    expect(plan.source).toBe("fallback");
    expect(plan.taskType).toBe("general");
  });

  it("已知模式（pattern 存在 + confidence >= 0.6）→ source: pattern", async () => {
    const deps = makeDepsWithPattern("bug-fix", 0.8, 0);
    const plan = await planForTask("fix bug auth", {}, deps);
    expect(plan.source).toBe("pattern");
    expect(plan.taskType).toBe("bug-fix");
    expect(plan.tools).toBeDefined();
    expect(plan.depth).toBeDefined();
  });

  it("未知類型（mock matchTools 成功）→ source: exploration", async () => {
    const deps = makeMemoryDeps();
    deps.matchTools = async () => ({ recommended: [{ id: "bash", name: "Bash" }], missing: [] });
    deps.suggestDepth = () => ({ depth: "D2", reason: "test" });
    const plan = await planForTask("some new task xyz", {}, deps);
    expect(plan.source).toBe("exploration");
    expect(plan.tools.length).toBeGreaterThan(0);
  });

  it("未知類型（mock matchTools 失敗）→ source: fallback，depth 來自 suggestDepth", async () => {
    const deps = makeMemoryDeps();
    deps.matchTools = async () => { throw new Error("matchTools 不可用"); };
    deps.suggestDepth = () => ({ depth: "D3", reason: "test" });
    const plan = await planForTask("some task", {}, deps);
    expect(plan.source).toBe("fallback");
    expect(plan.depth).toBe("D3");
  });

  it("所有依賴失敗 → 不 throw，回傳 fallback", async () => {
    const deps = makeMemoryDeps();
    deps.matchTools = async () => { throw new Error("網路失敗"); };
    deps.suggestDepth = () => { throw new Error("模組失敗"); };
    let plan;
    expect(async () => {
      plan = await planForTask("some task", {}, deps);
    }).not.toThrow();
    plan = await planForTask("some task", {}, deps);
    expect(plan.source).toBe("fallback");
  });
});

// ─── recordOutcome ────────────────────────────────────────────────────────────

describe("recordOutcome", () => {
  it("新模式建立：patterns 中新增一筆", () => {
    const deps = makeMemoryDeps();
    recordOutcome("fix bug in login", ["bash", "editor"], "D1", true, 60, deps);
    const data = deps._read();
    expect(data.patterns["bug-fix"]).toBeDefined();
    expect(data.patterns["bug-fix"].totalAttempts).toBe(1);
  });

  it("更新現有模式：successCount +1", () => {
    const deps = makeDepsWithPattern("bug-fix", 0.8, 0);
    // successfulPlans[0].tools = ["bash", "editor"], depth = "D1"
    recordOutcome("fix auth bug", ["bash", "editor"], "D1", true, 100, deps);
    const data = deps._read();
    const plan = data.patterns["bug-fix"].successfulPlans[0];
    expect(plan.successCount).toBe(6); // 原本 5，+1
  });

  it("失敗記錄：failCount +1", () => {
    const deps = makeDepsWithPattern("bug-fix", 0.8, 0);
    recordOutcome("fix auth bug", ["bash", "editor"], "D1", false, 0, deps);
    const data = deps._read();
    const plan = data.patterns["bug-fix"].successfulPlans[0];
    expect(plan.failCount).toBe(2); // 原本 1，+1
  });

  it("連續失敗 3 次：該 PlanRecord 被清除", () => {
    const deps = makeMemoryDeps();
    // 先建立一個全新的 plan
    recordOutcome("fix bug", ["tool-a"], "D1", false, 0, deps);
    recordOutcome("fix bug", ["tool-a"], "D1", false, 0, deps);
    recordOutcome("fix bug", ["tool-a"], "D1", false, 0, deps);
    const data = deps._read();
    // 連續失敗 3 次，PlanRecord 應被清除
    const plans = data.patterns["bug-fix"]?.successfulPlans || [];
    const removed = plans.find((p) => p.depth === "D1" && JSON.stringify(p.tools.sort()) === JSON.stringify(["tool-a"]));
    expect(removed).toBeUndefined();
  });

  it("成功 → confidence +0.1", () => {
    const deps = makeDepsWithPattern("bug-fix", 0.8, 0);
    recordOutcome("fix auth bug", ["bash", "editor"], "D1", true, 0, deps);
    const data = deps._read();
    expect(data.patterns["bug-fix"].confidence).toBeCloseTo(0.9, 5);
  });

  it("失敗 → confidence -0.15", () => {
    const deps = makeDepsWithPattern("bug-fix", 0.8, 0);
    recordOutcome("fix auth bug", ["bash", "editor"], "D1", false, 0, deps);
    const data = deps._read();
    expect(data.patterns["bug-fix"].confidence).toBeCloseTo(0.65, 5);
  });

  it("confidence 上限 1.0", () => {
    const deps = makeDepsWithPattern("bug-fix", 1.0, 0);
    recordOutcome("fix auth bug", ["bash", "editor"], "D1", true, 0, deps);
    const data = deps._read();
    expect(data.patterns["bug-fix"].confidence).toBe(1.0);
  });

  it("confidence 下限 0.0", () => {
    const deps = makeDepsWithPattern("bug-fix", 0.05, 0);
    recordOutcome("fix auth bug", ["bash", "editor"], "D1", false, 0, deps);
    const data = deps._read();
    expect(data.patterns["bug-fix"].confidence).toBe(0.0);
  });

  it("重複呼叫相同參數 → 更新而非重複建立", () => {
    const deps = makeMemoryDeps();
    recordOutcome("fix bug", ["bash"], "D1", true, 60, deps);
    recordOutcome("fix bug", ["bash"], "D1", true, 80, deps);
    const data = deps._read();
    const plans = data.patterns["bug-fix"].successfulPlans;
    // 只有一筆 PlanRecord，不是兩筆
    expect(plans.length).toBe(1);
    expect(plans[0].successCount).toBe(2);
  });
});

// ─── prunePatterns ────────────────────────────────────────────────────────────

describe("prunePatterns", () => {
  it("清除 confidence < 0.3 的模式", () => {
    const lastSeen = new Date().toISOString();
    const data = {
      version: 1,
      patterns: {
        "bug-fix": { type: "bug-fix", keywords: [], successfulPlans: [], totalAttempts: 1, lastSeen, confidence: 0.2 },
        "feature":  { type: "feature",  keywords: [], successfulPlans: [], totalAttempts: 1, lastSeen, confidence: 0.8 },
      },
      stats: {},
    };
    const deps = makeMemoryDeps(data);
    const result = prunePatterns(deps);
    expect(result.removed).toBe(1);
    expect(result.remaining).toBe(1);
    const saved = deps._read();
    expect(saved.patterns["bug-fix"]).toBeUndefined();
    expect(saved.patterns["feature"]).toBeDefined();
  });

  it("清除 30 天未使用的模式", () => {
    const oldDate = new Date(Date.now() - 31 * 86400000).toISOString();
    const recentDate = new Date().toISOString();
    const data = {
      version: 1,
      patterns: {
        "old":    { type: "old",    keywords: [], successfulPlans: [], totalAttempts: 1, lastSeen: oldDate,    confidence: 0.9 },
        "recent": { type: "recent", keywords: [], successfulPlans: [], totalAttempts: 1, lastSeen: recentDate, confidence: 0.9 },
      },
      stats: {},
    };
    const deps = makeMemoryDeps(data);
    const result = prunePatterns(deps);
    expect(result.removed).toBe(1);
    expect(result.remaining).toBe(1);
    const saved = deps._read();
    expect(saved.patterns["old"]).toBeUndefined();
    expect(saved.patterns["recent"]).toBeDefined();
  });

  it("保留有效模式（confidence >= 0.3 且 <= 30 天）", () => {
    const lastSeen = new Date().toISOString();
    const data = {
      version: 1,
      patterns: {
        "keep": { type: "keep", keywords: [], successfulPlans: [], totalAttempts: 1, lastSeen, confidence: 0.5 },
      },
      stats: {},
    };
    const deps = makeMemoryDeps(data);
    const result = prunePatterns(deps);
    expect(result.removed).toBe(0);
    expect(result.remaining).toBe(1);
  });

  it("空 patterns → removed: 0, remaining: 0", () => {
    const deps = makeMemoryDeps();
    const result = prunePatterns(deps);
    expect(result.removed).toBe(0);
    expect(result.remaining).toBe(0);
  });
});

// ─── 邊界條件 ─────────────────────────────────────────────────────────────────

describe("邊界條件", () => {
  it("loadPatterns 損壞 JSON → 回傳空模型，不 throw", () => {
    const deps = makeMemoryDeps();
    deps._store.set(PATTERNS_FILE, "not json at all!!");
    expect(() => loadPatterns(deps)).not.toThrow();
    const data = loadPatterns(deps);
    expect(data.patterns).toEqual({});
  });

  it("loadPatterns 檔案不存在 → 回傳空模型，不 throw", () => {
    const deps = makeMemoryDeps();
    expect(() => loadPatterns(deps)).not.toThrow();
    const data = loadPatterns(deps);
    expect(data.patterns).toEqual({});
  });

  it("recordOutcome 後 patterns 數量 > 100 → 自動 prune 至 100", () => {
    const deps = makeMemoryDeps();
    // 建立 101 個不同 type（使用不同 description）
    for (let i = 0; i < 101; i++) {
      // 強制建立 general 以外的 type：直接操作 store
      const data = loadPatterns(deps);
      data.patterns[`type-${i}`] = {
        type: `type-${i}`,
        keywords: [`keyword-${i}`],
        successfulPlans: [],
        totalAttempts: 0,
        lastSeen: new Date().toISOString(),
        confidence: 0.5 + (i * 0.001),
      };
      savePatterns(data, deps);
    }
    // 再 recordOutcome 一次觸發 prune
    recordOutcome("fix bug", ["bash"], "D1", true, 0, deps);
    const data = deps._read();
    expect(Object.keys(data.patterns).length).toBeLessThanOrEqual(100);
  });

  it("planForTask 全部依賴失敗 → 不 throw，回傳 fallback", async () => {
    const deps = makeMemoryDeps();
    deps.matchTools = async () => { throw new Error("service down"); };
    deps.suggestDepth = () => { throw new Error("module error"); };
    const plan = await planForTask("some task abc", {}, deps);
    expect(plan).toBeDefined();
    expect(plan.source).toBe("fallback");
    expect(plan.taskType).toBeDefined();
    expect(plan.depth).toBeDefined();
  });

  it("recordOutcome 重複相同參數 → PlanRecord 只有一筆", () => {
    const deps = makeMemoryDeps();
    for (let i = 0; i < 5; i++) {
      recordOutcome("test coverage", ["bash"], "D1", true, 60, deps);
    }
    const data = deps._read();
    const plans = data.patterns["test"]?.successfulPlans || [];
    expect(plans.length).toBe(1);
    expect(plans[0].successCount).toBe(5);
  });
});

// ─── listPatterns ─────────────────────────────────────────────────────────────

describe("listPatterns", () => {
  it("空 patterns → 空陣列", () => {
    const deps = makeMemoryDeps();
    expect(listPatterns(deps)).toEqual([]);
  });

  it("有模式 → 回傳陣列", () => {
    const deps = makeDepsWithPattern("bug-fix", 0.8, 0);
    const list = listPatterns(deps);
    expect(list.length).toBe(1);
    expect(list[0].type).toBe("bug-fix");
  });
});
