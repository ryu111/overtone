import { describe, test, expect } from "bun:test";

const SERVER = "http://127.0.0.1:3457";

// 跳過整合測試如果 server 沒跑（CI 環境）
let serverUp = false;
try {
  const r = await fetch(`${SERVER}/health`, { signal: AbortSignal.timeout(2000) });
  serverUp = (await r.json()).status === "ok";
} catch {}

const describeE2E = serverUp ? describe : describe.skip;

// 測試 1: cross-dispatch 全流程
describeE2E("cross-dispatch 全流程", () => {
  test("create → acknowledge → complete", async () => {
    // create
    const createRes = await fetch(`${SERVER}/api/cross-dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_cwd: "/tmp/test-source",
        target_cwd: "/tmp/test-target",
        prompt: "E2E test dispatch",
        _skipDelivery: true,
      }),
    });
    const { id } = await createRes.json();
    expect(id).toBeTruthy();

    // acknowledge
    const ackRes = await fetch(`${SERVER}/api/cross-dispatch/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    expect((await ackRes.json()).ok).toBe(true);

    // complete
    const completeRes = await fetch(`${SERVER}/api/cross-dispatch/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, summary: "E2E test done" }),
    });
    expect((await completeRes.json()).ok).toBe(true);
  });
});

// 測試 2: hook dispatch
describeE2E("hook dispatch", () => {
  test("POST /dispatch 回傳結構正確", async () => {
    const res = await fetch(`${SERVER}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "PreToolUse",
        hookEventInput: { tool_name: "Bash", input: { command: "echo test" } },
        cwd: "/tmp/test",
      }),
    });
    const data = await res.json();
    // 應回傳 decision
    expect(data).toHaveProperty("decision");
  });
});

// 測試 3: SSE 推送
describeE2E("SSE 推送", () => {
  test("連線 /events 收到事件（含 replay 事件）", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    let received = false;
    try {
      const res = await fetch(`${SERVER}/events`, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });
      expect(res.ok).toBe(true);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      // 讀取 stream — server 連線後會立即推送 replay 事件
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        if (text.includes("data:")) {
          received = true;
          break;
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") throw e;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }

    expect(received).toBe(true);
  });
});

// 測試 4: hot reload
describeE2E("hot reload", () => {
  test("POST /modules/reload 成功", async () => {
    const res = await fetch(`${SERVER}/modules/reload`, {
      method: "POST",
    });
    const data = await res.json();
    expect(data.ok || data.status === "ok" || res.ok).toBe(true);
  });
});

// 測試 5: health check
describeE2E("health check", () => {
  test("/health 回傳正確結構", async () => {
    const res = await fetch(`${SERVER}/health`);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.title).toBe("nova-server");
    expect(data).toHaveProperty("uptime");
  });
});
