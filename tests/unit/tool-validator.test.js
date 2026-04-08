import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "path";
import { homedir } from "os";

describe("tool-validator", () => {
  let handler;

  beforeAll(async () => {
    const mod = await import(join(homedir(), ".claude/hooks/modules/tool-validator.js"));
    handler = mod.on.PostToolUse;
  });

  test("載入模組且 handler 是函式", () => {
    expect(typeof handler).toBe("function");
  });

  test("test fail 注入警告並包含 fail 數量", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "bun test" },
      tool_result: { exitCode: 1, stdout: "3 pass\n2 fail" },
    });
    expect(result.decision).toBe("allow");
    expect(result.hookSpecificOutput?.additionalContext).toContain("⚠️");
    expect(result.hookSpecificOutput?.additionalContext).toContain("2 fail");
  });

  test("test pass 不注入 additionalContext", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "bun test" },
      tool_result: { exitCode: 0, stdout: "5 pass\n0 fail" },
    });
    expect(result.decision).toBe("allow");
    expect(result.hookSpecificOutput?.additionalContext).toBeUndefined();
  });

  test("npm test fail 也能偵測", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      tool_result: { exitCode: 1, stdout: "1 fail" },
    });
    expect(result.hookSpecificOutput?.additionalContext).toContain("⚠️");
  });

  test("build fail 注入警告", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "bun build src/index.ts" },
      tool_result: { exitCode: 1, stdout: "error: cannot resolve" },
    });
    expect(result.hookSpecificOutput?.additionalContext).toContain("Build 失敗");
  });

  test("build pass 不注入", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "bun build src/index.ts" },
      tool_result: { exitCode: 0, stdout: "Build success" },
    });
    expect(result.hookSpecificOutput?.additionalContext).toBeUndefined();
  });

  test("git push reject 注入「被拒絕」警告", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "git push origin main" },
      tool_result: { exitCode: 1, stdout: "! [rejected] main -> main" },
    });
    expect(result.hookSpecificOutput?.additionalContext).toContain("被拒絕");
  });

  test("git push 一般失敗注入網路/認證警告", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "git push origin main" },
      tool_result: { exitCode: 1, stdout: "fatal: could not read Password" },
    });
    expect(result.hookSpecificOutput?.additionalContext).toContain("git push 失敗");
  });

  test("git push 成功不注入", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "git push origin main" },
      tool_result: { exitCode: 0, stdout: "Everything up-to-date" },
    });
    expect(result.hookSpecificOutput?.additionalContext).toBeUndefined();
  });

  test("非 Bash 工具直接放行", () => {
    const result = handler({ tool_name: "Read", tool_input: {} });
    expect(result.decision).toBe("allow");
    expect(result.hookSpecificOutput).toBeUndefined();
  });

  test("tool_name 為 null 直接放行", () => {
    const result = handler({ tool_name: null, tool_input: {} });
    expect(result.decision).toBe("allow");
  });

  test("exit_code 備援欄位（舊格式）", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "bun test" },
      tool_result: { stdout: "1 fail" },
      exit_code: 1,
    });
    expect(result.hookSpecificOutput?.additionalContext).toContain("⚠️");
  });

  test("output 欄位備援（無 stdout）", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "bun test" },
      tool_result: { output: "2 fail", exitCode: 1 },
    });
    expect(result.hookSpecificOutput?.additionalContext).toContain("2 fail");
  });

  test("回傳 hookSpecificOutput 含正確 hookEventName", () => {
    const result = handler({
      tool_name: "Bash",
      tool_input: { command: "bun test" },
      tool_result: { exitCode: 1, stdout: "1 fail" },
    });
    expect(result.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
  });
});
