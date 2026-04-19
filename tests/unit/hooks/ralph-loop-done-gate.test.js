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

  // iter 14 治本：graceful close 需附可驗證 evidence（不再單純 claim 就放行）
  test("graceful close 含 evidence（ctx 數字 / quota / 使用者明示）→ allow", () => {
    expect(isPromptDoneAllowed("本輪完成 → graceful close：ctx > 50% 需新 session")).toBe(true);
    expect(isPromptDoneAllowed("graceful close：ctx usage > 70% 接近上限")).toBe(true);
    expect(isPromptDoneAllowed("graceful close：quota 接近 5h 上限")).toBe(true);
    expect(isPromptDoneAllowed("graceful close：使用者明示暫停")).toBe(true);
  });

  test("graceful close 無 evidence 單純 claim → reject（iter 14 治本 AI self-dismissal）", () => {
    expect(isPromptDoneAllowed("graceful close 本 session")).toBe(false);
    expect(isPromptDoneAllowed("Graceful Close — structural reason")).toBe(false);
    expect(isPromptDoneAllowed("本輪完成 graceful close")).toBe(false);
  });

  test("無 graceful close 且無其他白名單 → reject", () => {
    expect(isPromptDoneAllowed("執行中任務")).toBe(false);
    expect(isPromptDoneAllowed("本輪尚未完成某項")).toBe(false);
  });
});

// iter 12 使用者糾正「停下來多次」治本 baseline (2026-04-19)
describe("下一目標續 iter 強制不 DONE（iter 12 使用者糾正治本）", () => {
  test("state.prompt 含「下一目標：<具體任務>」無 graceful close → NOT allowed（強制續做）", () => {
    expect(isPromptDoneAllowed("本輪完成 → 下一目標：消化 23 建議 inventory 讀 reflections.jsonl")).toBe(false);
    expect(isPromptDoneAllowed("本輪完成 → 下一目標：修 architecture.test.js 4 fail")).toBe(false);
    expect(isPromptDoneAllowed("處理完成 → 下一目標：pick spec/待做 D2 roadmap Phase 1")).toBe(false);
  });

  test("state.prompt 含「下一目標 + graceful close」→ allowed（明示暫停）", () => {
    expect(isPromptDoneAllowed("本輪完成 → 下一目標：修 4 fail（但 graceful close 因 ctx > 70%）")).toBe(true);
    expect(isPromptDoneAllowed("下一目標：X 任務；graceful close：quota 接近上限")).toBe(true);
  });

  test("state.prompt 「下一目標」後無具體任務（< 5 字）→ allowed（視為無實質目標）", () => {
    expect(isPromptDoneAllowed("本輪完成 → 下一目標：X")).toBe(true);
    expect(isPromptDoneAllowed("本輪無剩餘任務，下一目標：待定")).toBe(true);
  });

  test("舊 graceful close 行為：含 ctx evidence 仍 allow", () => {
    expect(isPromptDoneAllowed("本輪完成 → graceful close：ctx > 70%")).toBe(true);
    expect(isPromptDoneAllowed("本輪無剩餘任務")).toBe(true);
  });
});

// iter 14 使用者糾正「找出自驅停止根因」治本 baseline (2026-04-19)
describe("graceful close + deferred pipeline 矛盾偵測（iter 14 治本 AI self-dismissal）", () => {
  test("graceful close + ≥ 2 bullet 下一目標清單 → reject（矛盾）", () => {
    const promptWithPipeline = [
      "本輪完成 → graceful close：ctx > 70%",
      "下一目標清單：",
      "- (1) 做 A",
      "- (2) 做 B",
    ].join("\n");
    expect(isPromptDoneAllowed(promptWithPipeline)).toBe(false);
  });

  test("graceful close + 2 個「下一目標」字串 → reject", () => {
    const p = "下一目標：X 任務。下一目標：Y 任務。graceful close：ctx > 70%";
    expect(isPromptDoneAllowed(p)).toBe(false);
  });

  test("graceful close + 單一下一目標 + evidence → allow", () => {
    const p = "graceful close：ctx > 70%，下一目標：deferred 到 successor";
    expect(isPromptDoneAllowed(p)).toBe(true);
  });

  test("graceful close 無 bullet 無多重目標 + evidence → allow（正常場景）", () => {
    expect(isPromptDoneAllowed("本輪完成 → graceful close：ctx > 80% 需新 session")).toBe(true);
  });
});
