// tests/unit/hooks/context-injector-routing.test.js
// Wave 1 延伸 (xd-flmk)：context-injector SessionStart 僅 startup/clear init routing file
// 根因：SessionStart 有 4 source (startup/resume/clear/compact)
//       compact 是同 session context 壓縮，若清 routing file 會讓 HARD GATE 分類遺失
//       resume 是 continue 工作，同理保留
// 治本：加 source 判斷 if (proj && (source === "startup" || source === "clear"))

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONTEXT_INJECTOR = join(homedir(), ".claude/hooks/modules/context-injector.js");

function extractSessionStartBody(src) {
  const startRe = /\bSessionStart:\s*\(_input\)\s*=>\s*{/;
  const m = startRe.exec(src);
  if (!m) return "";
  let i = m.index + m[0].length - 1;
  let depth = 0;
  const start = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return "";
}

describe("context-injector SessionStart routing file init source gate (xd-flmk)", () => {
  test("SessionStart 清 routing 前判斷 source === startup/clear", () => {
    const src = readFileSync(CONTEXT_INJECTOR, "utf-8");
    const body = extractSessionStartBody(src);
    expect(body.length).toBeGreaterThan(0);
    expect(body).toMatch(/_input\?\.source\s*===\s*"startup"/);
    expect(body).toMatch(/_input\?\.source\s*===\s*"clear"/);
  });

  test("SessionStart init 條件不清 resume (同 session continue)", () => {
    const src = readFileSync(CONTEXT_INJECTOR, "utf-8");
    const body = extractSessionStartBody(src);
    // resume 不在白名單 → routing file 不會被清
    expect(body).not.toMatch(/source\s*===\s*"resume"/);
  });

  test("SessionStart init 條件不清 compact (context 壓縮，HARD GATE 仍有效)", () => {
    const src = readFileSync(CONTEXT_INJECTOR, "utf-8");
    const body = extractSessionStartBody(src);
    // compact 不在白名單 → routing file 不會被清
    expect(body).not.toMatch(/source\s*===\s*"compact"/);
  });

  test("SessionStart 仍 writeFileSync routing-level (startup/clear 時正常 init)", () => {
    const src = readFileSync(CONTEXT_INJECTOR, "utf-8");
    const body = extractSessionStartBody(src);
    // 治本不是完全拿掉 writeFileSync，只是加條件
    expect(body).toMatch(/writeFileSync\(`\/tmp\/nova-routing-level-/);
  });

  test("註解標記 xd-flmk 說明治本脈絡", () => {
    const src = readFileSync(CONTEXT_INJECTOR, "utf-8");
    const body = extractSessionStartBody(src);
    expect(body).toMatch(/xd-flmk/);
  });
});
