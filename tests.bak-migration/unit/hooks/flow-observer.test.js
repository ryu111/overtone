// tests/unit/hooks/flow-observer.test.js
// Wave 1 治本 fix (xd-flmk)：SubagentStop 不清空 main session routing state
// 根因：sub-agent 繼承 main session cwd，SubagentStop 用 input.cwd 當 key
//       清空 /tmp/nova-routing-level-{proj}.txt 會清掉父 session 的 HARD GATE 分類
// 治本：移除 SubagentStop handler 的 routing/delegate/domain file 清空邏輯
//       Stop handler (main session end) 保留清空職責

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const FLOW_OBSERVER = join(homedir(), ".claude/hooks/modules/flow-observer.js");

/**
 * 擷取 handler 內容用 balanced brace 計算，避免正則在 nested blocks 誤匹配
 * @param {string} src
 * @param {string} handlerName
 * @returns {string}
 */
function extractHandlerBody(src, handlerName) {
  const startRe = new RegExp(`\\b${handlerName}:\\s*\\(input\\)\\s*=>\\s*{`);
  const m = startRe.exec(src);
  if (!m) return "";
  let i = m.index + m[0].length - 1; // 指向 '{'
  let depth = 0;
  let start = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return "";
}

describe("flow-observer SubagentStop 不清 main session routing state (xd-flmk)", () => {
  test("SubagentStop 區塊不含 writeFileSync nova-routing-level (治本 fix 驗證)", () => {
    const src = readFileSync(FLOW_OBSERVER, "utf-8");
    const body = extractHandlerBody(src, "SubagentStop");
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/writeFileSync\([^)]*nova-routing-level-/);
  });

  test("SubagentStop 區塊不含 writeFileSync nova-delegate-model", () => {
    const src = readFileSync(FLOW_OBSERVER, "utf-8");
    const body = extractHandlerBody(src, "SubagentStop");
    expect(body).not.toMatch(/writeFileSync\([^)]*nova-delegate-model-/);
  });

  test("SubagentStop 區塊不含 writeFileSync nova-routing-domain", () => {
    const src = readFileSync(FLOW_OBSERVER, "utf-8");
    const body = extractHandlerBody(src, "SubagentStop");
    expect(body).not.toMatch(/writeFileSync\([^)]*nova-routing-domain-/);
  });

  test("SubagentStop 仍 emit agent_complete event (原功能保留)", () => {
    const src = readFileSync(FLOW_OBSERVER, "utf-8");
    const body = extractHandlerBody(src, "SubagentStop");
    expect(body).toContain('type: "agent_complete"');
    expect(body).toContain("persistEvents(events)");
  });

  test("Stop 區塊仍清 routing file (對比鎖，main session end 保留清空職責)", () => {
    const src = readFileSync(FLOW_OBSERVER, "utf-8");
    const body = extractHandlerBody(src, "Stop");
    expect(body.length).toBeGreaterThan(0);
    expect(body).toMatch(/writeFileSync\([^)]*nova-routing-level-/);
    expect(body).toMatch(/writeFileSync\([^)]*nova-delegate-model-/);
  });

  test("SubagentStop 治本註解留在原位（歷史脈絡）", () => {
    const src = readFileSync(FLOW_OBSERVER, "utf-8");
    const body = extractHandlerBody(src, "SubagentStop");
    expect(body).toMatch(/xd-flmk/);
    expect(body).toMatch(/sub-agent 繼承 main cwd/);
  });
});
