// session-end-autoreport.test.js — 整條 session-end auto-report 鏈路 regression
// xd-1776387738014-hmqt 使用者升級修復：每次 session 結束應 auto-complete 本 session 內收到的 dispatch
//
// 此測試鎖定：
// 1. settings.json hooks.Stop 有接 hook-client.js
// 2. hook-client.js LOCAL_MODULES.Stop 含 wrapup-guard.js
// 3. wrapup-guard.js Stop handler 有呼叫 autoCompleteIncomingDispatches
// 4. autoCompleteIncomingDispatches 會關「本 session 內收到 + 超過 30s」的 pending dispatch
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SETTINGS = join(homedir(), ".claude/settings.json");
const HOOK_CLIENT = join(homedir(), ".claude/hooks/hook-client.js");
const WRAPUP_GUARD = join(homedir(), ".claude/hooks/modules/wrapup-guard.js");

describe("session-end auto-report chain (xd-1776387738014-hmqt)", () => {
  test("settings.json 掛 Stop hook 到 hook-client.js", () => {
    const settings = JSON.parse(readFileSync(SETTINGS, "utf-8"));
    const stopHooks = settings?.hooks?.Stop;
    expect(Array.isArray(stopHooks)).toBe(true);
    const hasHookClient = stopHooks.some((entry) =>
      Array.isArray(entry?.hooks) &&
      entry.hooks.some((h) => (h?.command || "").includes("hook-client.js")),
    );
    expect(hasHookClient).toBe(true);
  });

  test("hook-client.js Stop LOCAL_MODULES 含 wrapup-guard.js", () => {
    const src = readFileSync(HOOK_CLIENT, "utf-8");
    // Stop block 包含 wrapup-guard
    const stopBlock = src.match(/['"]Stop['"]\s*:\s*\[[\s\S]*?\]/);
    expect(stopBlock).not.toBeNull();
    expect(stopBlock[0]).toContain("wrapup-guard.js");
  });

  test("wrapup-guard.js Stop handler 呼叫 autoCompleteIncomingDispatches", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toMatch(/Stop:\s*\(input\)\s*=>/);
    expect(src).toContain("autoCompleteIncomingDispatches(cwd)");
  });

  test("autoCompleteIncomingDispatches 呼叫 /cross-dispatch/complete API", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toContain("/complete");
    expect(src).toContain("/cross-dispatch");
  });

  test("autoCompleteIncomingDispatches 先 /review 再 /complete（approve 防 reviewerFindings 擋）", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toContain("/review");
    expect(src).toContain("approved");
    const fn = src.match(/function autoCompleteIncomingDispatches[\s\S]+?\n\}/);
    expect(fn).not.toBeNull();
    // /review 必須在 /complete 之前
    const reviewIdx = fn[0].indexOf("/review");
    const completeIdx = fn[0].indexOf("/complete");
    expect(reviewIdx).toBeGreaterThan(-1);
    expect(completeIdx).toBeGreaterThan(-1);
    expect(reviewIdx).toBeLessThan(completeIdx);
  });

  test("fail-closed 保護：無 session-start 檔時不關任何 dispatch", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toContain("no session-start file");
    // 未取得 sessionStartAt 時 early return
    expect(src).toMatch(/if\s*\(\s*!sessionStartAt\s*\)/);
  });

  test("30s sanity 保護：剛到的 dispatch 不關", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toContain("30_000");
  });

  test("本 session 內收到的 dispatch 不再被過濾（regression for xd-1776387738014-hmqt）", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    // 舊版會在 filter 中比較 createdAt > sessionStartAt skip，現已移除
    expect(src).not.toMatch(/new Date\(d\.createdAt\)\.getTime\(\)\s*>\s*sessionStartAt/);
  });

  test("ralph-loop active 時放行（不觸發 auto-complete）", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toContain("ralph-loop.local.md");
  });

  test("Stop summary 標註 auto-complete 來源讓 Manager 透明化", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toContain("auto-complete via wrapup-guard Stop hook");
  });
});
