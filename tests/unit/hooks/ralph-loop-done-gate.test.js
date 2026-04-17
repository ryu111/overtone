// tests/unit/hooks/ralph-loop-done-gate.test.js
// Ralph-loop Phase 3.5/4 promise DONE 釋放 gate (xd-flmk follow-up)
// 根因：原 ralph-loop.js 只做 promise tag 字串匹配，不驗 state.prompt 是否允許 DONE。
//       AI 只要輸出 <promise>DONE</promise> 就被釋放，違反 rules/環境/ralph-loop.md 要求：
//       DONE 只在 state.prompt 明示「本輪無剩餘任務」或「已 deferred 至下輪」時允許。
// 治本：抽 isPromptDoneAllowed helper + Phase 3.5/4 match 條件加 gate。
//       MVP warn-only：未 allowed 時 match 不 release，續跑 Phase 5 iteration++。

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { isPromptDoneAllowed } from "/Users/sbu/.claude/hooks/modules/ralph-loop.js";

const RALPH_LOOP = join(homedir(), ".claude/hooks/modules/ralph-loop.js");

describe("isPromptDoneAllowed runtime 判斷", () => {
  test("空 prompt → allow（無任務）", () => {
    expect(isPromptDoneAllowed("")).toBe(true);
    expect(isPromptDoneAllowed("   ")).toBe(true);
    expect(isPromptDoneAllowed(null)).toBe(true);
    expect(isPromptDoneAllowed(undefined)).toBe(true);
  });

  test("白名單 pattern 各種命中", () => {
    expect(isPromptDoneAllowed("本輪完成")).toBe(true);
    expect(isPromptDoneAllowed("本輪無剩餘任務")).toBe(true);
    expect(isPromptDoneAllowed("本輪任務完成")).toBe(true);
    expect(isPromptDoneAllowed("已 deferred 至下輪")).toBe(true);
    expect(isPromptDoneAllowed("已deferred下輪")).toBe(true);
    expect(isPromptDoneAllowed("等下一個 dispatch")).toBe(true);
    expect(isPromptDoneAllowed("處理完成，等下個任務")).toBe(true);
    expect(isPromptDoneAllowed("Wave 1 完成")).toBe(true);
    expect(isPromptDoneAllowed("all done")).toBe(true);
    expect(isPromptDoneAllowed("ALL DONE")).toBe(true);
  });

  test("原使用者 prompt（未覆寫）→ NOT allowed", () => {
    expect(isPromptDoneAllowed("怎麼又沒有回報")).toBe(false);
    expect(isPromptDoneAllowed("r-loop 有開嗎？怎麼讓你這麼輕易就出去了")).toBe(false);
    expect(isPromptDoneAllowed("你有來自 nova-manager 的跨專案任務")).toBe(false);
  });

  test("含「完成」但不含「本輪/處理/已 deferred」關鍵字 → NOT allowed（避免誤通）", () => {
    expect(isPromptDoneAllowed("找時間再完成這件事")).toBe(false);
    expect(isPromptDoneAllowed("完成度 50%")).toBe(false);
  });
});

describe("ralph-loop.js Phase 3.5/4 已加 DONE gate (source grep 驗證)", () => {
  test("Phase 3.5 promise match 條件含 isPromptDoneAllowed(state.prompt)", () => {
    const src = readFileSync(RALPH_LOOP, "utf-8");
    // 兩處 match 條件都應該加 gate
    const matches = src.match(/if \(promiseText === state\.completion_promise && isPromptDoneAllowed\(state\.prompt\)\) \{/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(2); // Phase 3.5 + Phase 4
  });

  test("ralph-loop.js 無殘留原始未 gated 條件（防 revert）", () => {
    const src = readFileSync(RALPH_LOOP, "utf-8");
    // 沒有「純 completion_promise match」的舊 pattern（除了 helper function 本身）
    const bareMatches = src.match(/if \(promiseText === state\.completion_promise\) \{/g);
    expect(bareMatches).toBeNull();
  });

  test("helper function isPromptDoneAllowed export + xd-flmk 註解", () => {
    const src = readFileSync(RALPH_LOOP, "utf-8");
    expect(src).toMatch(/export function isPromptDoneAllowed\(promptText\)/);
    expect(src).toMatch(/xd-flmk/);
  });
});
