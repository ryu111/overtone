import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";

const CLAUDE_DIR = join(homedir(), ".claude");

describe("磁碟空間守衛", () => {
  let evaluateBash;

  beforeAll(async () => {
    const mod = await import(join(CLAUDE_DIR, "hooks/modules/guards.js"));
    evaluateBash = mod.evaluateBash;
  });

  test("evaluateBash 函式存在", () => {
    expect(typeof evaluateBash).toBe("function");
  });

  test("空間充足時正常放行", () => {
    // 正常環境下磁碟空間 > 5GB，應該放行
    const result = evaluateBash({
      tool_input: { command: "echo hello" },
      cwd: "/Users/sbu/projects/nova-brain",
    });
    expect(result.hookSpecificOutput?.permissionDecision).toBe("allow");
  });
});
