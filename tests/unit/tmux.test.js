import { describe, test, expect, mock } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";

const TMUX = join(homedir(), ".claude/scripts/os/tmux.js");

function makeDeps(responses = {}) {
  const calls = [];
  const fn = mock((cmd, opts) => {
    calls.push(cmd);
    if (responses.throw) throw new Error(responses.throw);
    for (const [pattern, value] of Object.entries(responses)) {
      if (pattern !== "throw" && cmd.includes(pattern)) {
        if (typeof value === "function") return value(cmd, opts);
        return value;
      }
    }
    return "";
  });
  return { execSync: fn, calls };
}

describe("tmux", () => {
  test("checkAvailability — tmux 已安裝", async () => {
    const { checkAvailability } = await import(TMUX);
    const deps = makeDeps({ "which tmux": "/usr/local/bin/tmux" });
    expect(checkAvailability(deps).available).toBe(true);
  });

  test("checkAvailability — tmux 未安裝", async () => {
    const { checkAvailability } = await import(TMUX);
    const deps = makeDeps({ throw: "not found" });
    const result = checkAvailability(deps);
    expect(result.available).toBe(false);
  });

  test("listSessions — 過濾 nova- 前綴", async () => {
    const { listSessions } = await import(TMUX);
    const deps = makeDeps({
      "list-sessions": "nova-brain|1711900000|0\nnova-quant|1711900001|1\nother-session|1711900002|0\n",
    });
    const result = listSessions(deps);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("nova-brain");
    expect(result[1].attached).toBe(true);
  });

  test("hasSession — 存在", async () => {
    const { hasSession } = await import(TMUX);
    const deps = makeDeps({});
    expect(hasSession("nova-brain", deps)).toBe(true);
  });

  test("hasSession — 不存在", async () => {
    const { hasSession } = await import(TMUX);
    const deps = makeDeps({ throw: "session not found" });
    expect(hasSession("nova-brain", deps)).toBe(false);
  });

  test("findOrCreateSession — 新建", async () => {
    const { findOrCreateSession } = await import(TMUX);
    let callCount = 0;
    const deps = {
      execSync: mock((cmd) => {
        if (cmd.includes("has-session")) { callCount++; throw new Error("not found"); }
        if (cmd.includes("new-session")) return "";
        return "";
      }),
    };
    const result = findOrCreateSession("brain", {}, deps);
    expect(result.sessionName).toBe("nova-brain");
    expect(result.isNew).toBe(true);
  });

  test("sendKeys — 送文字 + Enter", async () => {
    const { sendKeys } = await import(TMUX);
    const deps = makeDeps({});
    sendKeys("nova-brain", "echo hello", deps);
    expect(deps.calls).toHaveLength(3); // load-buffer + paste-buffer + Enter
    expect(deps.calls[0]).toContain("load-buffer");
    expect(deps.calls[1]).toContain("paste-buffer");
    expect(deps.calls[2]).toContain("Enter");
  });

  test("sendKeys — 特殊字元不被 shell 解讀", async () => {
    const { sendKeys } = await import(TMUX);
    const deps = makeDeps({});
    sendKeys("nova-brain", 'echo $HOME "hello" `date`', deps);
    // load-buffer 確保 $HOME 不被展開
    expect(deps.calls[0]).toContain("load-buffer");
  });

  test("sendKeys — 支援 session:window 格式的 target", async () => {
    const { sendKeys } = await import(TMUX);
    const deps = makeDeps({});
    sendKeys("nova-brain:0", "echo hello", deps);
    // target 帶冒號格式應完整傳遞給 tmux（load-buffer + paste-buffer + Enter）
    expect(deps.calls[1]).toContain('"nova-brain:0"'); // paste-buffer
    expect(deps.calls[2]).toContain('"nova-brain:0"'); // Enter
    expect(deps.calls[2]).toContain("Enter");
  });

  test("capturePaneOutput — 讀取輸出", async () => {
    const { capturePaneOutput } = await import(TMUX);
    const deps = makeDeps({ "capture-pane": "line1\nline2\nline3\n" });
    const output = capturePaneOutput("nova-brain", 50, deps);
    expect(output).toBe("line1\nline2\nline3");
  });

  test("killSession — 成功", async () => {
    const { killSession } = await import(TMUX);
    const deps = makeDeps({});
    expect(killSession("nova-brain", deps)).toBe(true);
  });

  test("killSession — session 不存在", async () => {
    const { killSession } = await import(TMUX);
    const deps = makeDeps({ throw: "not found" });
    expect(killSession("nova-brain", deps)).toBe(false);
  });

  test("isSessionIdle — 有 ❯ prompt 回傳 true", async () => {
    const { isSessionIdle } = await import(TMUX);
    const deps = makeDeps({ "capture-pane": "some output\n❯ " });
    expect(isSessionIdle("nova-brain", deps)).toBe(true);
  });

  test("isSessionIdle — 無 prompt 回傳 false", async () => {
    const { isSessionIdle } = await import(TMUX);
    const deps = makeDeps({ "capture-pane": "running tests...\nstill working" });
    expect(isSessionIdle("nova-brain", deps)).toBe(false);
  });

  test("isSessionIdle — capture 失敗回傳 false", async () => {
    const { isSessionIdle } = await import(TMUX);
    const deps = makeDeps({ throw: "no session" });
    expect(isSessionIdle("nova-brain", deps)).toBe(false);
  });

  test("sendKeysWhenIdle — idle 時立即送出", async () => {
    const { sendKeysWhenIdle } = await import(TMUX);
    const deps = makeDeps({ "capture-pane": "❯ " });
    const result = await sendKeysWhenIdle("nova-brain", "echo hi", { maxWaitMs: 5000, pollMs: 100 }, deps);
    expect(result.sent).toBe(true);
    expect(result.timedOut).toBeUndefined();
  });

});
