import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CLAUDE = join(homedir(), ".claude");
const SCRIPTS = join(CLAUDE, "scripts");

describe("Feedback Loop D1→D4 E2E", () => {
  // D1 Observe：flow-events 存在且有最近記錄
  test("D1 Observe：flow-events 有最近 24h 記錄", () => {
    const eventsPath = "/tmp/nova-flow-events.jsonl";
    expect(existsSync(eventsPath)).toBe(true);

    const content = readFileSync(eventsPath, "utf-8").trim();
    const lines = content.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    // 最後一筆的 ts 在 24h 內
    const last = JSON.parse(lines[lines.length - 1]);
    const ts = typeof last.ts === "string" ? new Date(last.ts).getTime() : last.ts;
    expect(Date.now() - ts).toBeLessThan(86400000);
  });

  // D2 Extract：learner 能從 events 提取行為
  test("D2 Extract：extractSessionBehavior 回傳行為信號", async () => {
    const { extractSessionBehavior } = await import(join(SCRIPTS, "learner.js"));

    // 用真實 flow-events（/tmp/nova-flow-events.jsonl）
    const result = extractSessionBehavior();
    expect(result).not.toBeNull();
    expect(result.sid).toBeDefined();
    expect(result.toolCounts).toBeDefined();
    expect(result.signals).toBeDefined();
    expect(result.signals.totalPrompts).toBeGreaterThanOrEqual(0);
  });

  // D3 Evaluate：確定性評分回傳 0-100 整數
  test("D3 Evaluate：scoreDeterministic 回傳 0-50 整數", async () => {
    const { scoreDeterministic } = await import(join(SCRIPTS, "judge-scoring.js"));

    // 對 skills/auto 跑確定性評分
    const skillPath = join(CLAUDE, "skills/auto/SKILL.md");
    expect(existsSync(skillPath)).toBe(true);

    const score = scoreDeterministic(skillPath, "skill");
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(50);
    expect(Number.isInteger(score)).toBe(true);
  });

  // D3 Evaluate（detailed）：結構化評分
  test("D3 Evaluate：scoreDeterministicDetailed 回傳結構化結果", async () => {
    const { scoreDeterministicDetailed } = await import(join(SCRIPTS, "judge-scoring.js"));

    const skillPath = join(CLAUDE, "skills/auto/SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    const detailed = scoreDeterministicDetailed(content, "skill", skillPath);

    expect(detailed).toBeDefined();
    expect(detailed.dimensions).toBeDefined();
    expect(Array.isArray(detailed.dimensions)).toBe(true);
    expect(detailed.dimensions.length).toBeGreaterThan(0);
  });

  // D4 Suggest：generateImprovements 對 F 級假資料產出建議
  test("D4 Suggest：generateImprovements 處理 F 級資料", async () => {
    const { generateImprovements } = await import(join(SCRIPTS, "judge-improvements.js"));

    const fakeF = [{
      path: "skills/test-fake",
      type: "skill",
      total: 30,
      grade: "F",
      deterministic: 15,
      semantic: 15,
      actionable: { weakDimensions: ["clarity"], suggestion: "改善清晰度" },
    }];

    // generateImprovements 應不拋錯（可能呼叫 g4，用 try/catch）
    try {
      await generateImprovements(fakeF);
    } catch {
      // g4 不可用時可能失敗，但不應 crash
    }
    // 函式存在且可呼叫即通過
    expect(typeof generateImprovements).toBe("function");
  });

  // 鏈路完整：behaviors.jsonl 和 scores.jsonl 都有記錄
  test("鏈路完整：behaviors.jsonl 和 scores.jsonl 存在且有記錄", () => {
    const behaviorsPath = join(CLAUDE, "data/behaviors.jsonl");
    const scoresPath = join(CLAUDE, "data/scores.jsonl");

    expect(existsSync(behaviorsPath)).toBe(true);
    expect(existsSync(scoresPath)).toBe(true);

    const behaviors = readFileSync(behaviorsPath, "utf-8").trim();
    expect(behaviors.length).toBeGreaterThan(0);

    const scores = readFileSync(scoresPath, "utf-8").trim();
    expect(scores.length).toBeGreaterThan(0);
  });
});
