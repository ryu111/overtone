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
  // spawnSync mock：紀錄 argv 陣列和 stdin 內容，回傳空 stdout
  const spawnCalls = [];
  const spawnFn = mock((argv, opts = {}) => {
    spawnCalls.push({ argv, stdin: opts.stdin });
    return { stdout: new Uint8Array(), stderr: new Uint8Array(), exitCode: 0 };
  });
  return { execSync: fn, spawnSync: spawnFn, calls, spawnCalls };
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

  test("sendKeys — 送文字 + Enter（paste-buffer -p + 延遲 + Enter 三步）", async () => {
    const { sendKeys } = await import(TMUX);
    const deps = makeDeps({});
    sendKeys("nova-brain", "echo hello", deps);
    // load-buffer 走 spawnSync（stdin pipe）
    expect(deps.spawnCalls).toHaveLength(1);
    expect(deps.spawnCalls[0].argv).toEqual(["tmux", "load-buffer", "-"]);
    // execSync 三步：paste-buffer -p、sleep 0.1、send-keys Enter
    expect(deps.calls).toHaveLength(3);
    expect(deps.calls[0]).toContain("paste-buffer -p");
    expect(deps.calls[1]).toBe("sleep 0.1");
    expect(deps.calls[2]).toContain("Enter");
  });

  test("sendKeys — Enter 漏送 regression（xd-1776371446495-n2ke）", async () => {
    const { sendKeys } = await import(TMUX);
    const deps = makeDeps({});
    sendKeys("nova-brain", "任意文字", deps);
    // regression 鎖定：paste-buffer 必須加 -p（bracketed paste），
    // paste 與 Enter 之間必須有 sleep，Enter 不可緊接 paste（否則被 CLI 當 paste 最末字元）
    const idxPaste = deps.calls.findIndex((c) => c.includes("paste-buffer"));
    const idxSleep = deps.calls.findIndex((c) => c.includes("sleep"));
    const idxEnter = deps.calls.findIndex((c) => c.includes("Enter"));
    expect(idxPaste).toBeGreaterThanOrEqual(0);
    expect(idxSleep).toBeGreaterThan(idxPaste);
    expect(idxEnter).toBeGreaterThan(idxSleep);
    expect(deps.calls[idxPaste]).toContain("-p"); // 明示 bracketed paste
  });

  test("sendKeys — 特殊字元不被 shell 解讀", async () => {
    const { sendKeys } = await import(TMUX);
    const deps = makeDeps({});
    const payload = 'echo $HOME "hello" `date`';
    sendKeys("nova-brain", payload, deps);
    // stdin pipe 確保 $HOME、backtick 不被 shell 展開（整串原文傳遞）
    const stdin = deps.spawnCalls[0].stdin;
    const decoded = new TextDecoder().decode(stdin);
    expect(decoded).toBe(payload);
  });

  test("sendKeys — 支援 session:window 格式的 target", async () => {
    const { sendKeys } = await import(TMUX);
    const deps = makeDeps({});
    sendKeys("nova-brain:0", "echo hello", deps);
    // target 帶冒號格式應完整傳遞給 tmux paste-buffer（calls[0]）+ Enter（calls[2]，calls[1] 是 sleep）
    expect(deps.calls[0]).toContain('"nova-brain:0"'); // paste-buffer -p
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
