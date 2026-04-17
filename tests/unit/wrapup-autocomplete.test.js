// wrapup-autocomplete.test.js — Phase D autoComplete 測試
// xd-1776387738014-hmqt (2026-04-17)：Stop 時本 session 收到的 dispatch 應被 auto-complete。
// 舊版「> sessionStartAt 不關」邏輯已移除（session 結束 = Main 不再處理）。
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const WRAPUP = join(homedir(), ".claude/scripts/wrapup.js");
const WRAPUP_GUARD = join(homedir(), ".claude/hooks/modules/wrapup-guard.js");

describe("wrapup autoComplete", () => {
  test("wrapup.js export autoComplete 函式", async () => {
    const mod = await import(WRAPUP);
    expect(typeof mod.autoComplete).toBe("function");
  });

  test("autoComplete fail-open on server error (source grep 無副作用, xd-vo4i)", () => {
    // 舊版 await mod.autoComplete() 會實打 POST /complete 污染 pending dispatch（xd-06zm/vo4i 實證）
    // 改為 source grep，鎖 catch fail-open 存在即可
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toMatch(/\/\/ fail-open: server 掛了不阻擋 wrapup/);
    expect(src).toMatch(/console\.error\("\[wrapup\] autoComplete skipped:"/);
  });

  test("wrapup 全流程包含 autoComplete", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("await autoComplete()");
  });

  test("CLI 支援 D / autocomplete 子命令", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain('"d"');
    expect(src).toContain('"autocomplete"');
  });

  test("autoComplete 查詢 cross-dispatch API", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("/api/cross-dispatch?target_cwd=");
    expect(src).toContain("/api/cross-dispatch/complete");
  });

  test("autoComplete 使用 AbortSignal.timeout（fail-open）", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("AbortSignal.timeout(3000)");
  });

  test("autoComplete 附帶 git log verification", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("git log -1 --format=%s");
    expect(src).toContain("verification");
  });

  test("autoComplete 保留 fail-closed on session-start 檔缺失", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("sessionStartAt");
    expect(src).toContain("nova-session-start-");
    expect(src).toContain("if (!sessionStartAt) continue");
  });

  test("autoComplete 保留 30s sanity（剛建立 dispatch 不關）", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("d.createdAt");
    expect(src).toContain("30_000");
  });

  test("regression: autoComplete 不再用 sessionStartAt 過濾本 session dispatch (xd-1776387738014-hmqt)", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    // 確認舊的「> sessionStartAt continue/return false」邏輯已移除
    expect(src).not.toMatch(/getTime\(\)\s*>\s*sessionStartAt/);
  });

  test("autoComplete 摘要包含 git diff stat", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    expect(src).toContain("diffStat");
    expect(src).toContain("git diff --stat");
  });

  test("autoComplete scan 範圍限 pending/delivered，exclude completed/acknowledged (xd-06zm)", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    // 鎖死 scan 只抓 pending/delivered（避免對 completed 冪等 race + 對 acknowledged 搶工作）
    expect(src).toMatch(/if \(d\.status !== "pending" && d\.status !== "delivered"\) continue/);
    // 反向鎖：確保 acknowledged 不再被當作 auto-complete 目標
    expect(src).not.toMatch(/d\.status !== "acknowledged"/);
  });

  test("autoComplete POST 前 race check（GET latest status → skip completed/acknowledged, xd-vo4i）", () => {
    const src = readFileSync(WRAPUP, "utf-8");
    // race protection：POST /complete 前重新 GET 一次（B 方案過濾後再雙檢 A 方案）
    expect(src).toMatch(/race protection/);
    expect(src).toMatch(/const recheck = await fetch/);
    expect(src).toMatch(/latest\.status === "completed" \|\| latest\.status === "acknowledged"/);
    // race check 必須在 POST /complete 之前
    const raceIdx = src.indexOf("race protection");
    const postIdx = src.indexOf("/api/cross-dispatch/complete");
    expect(raceIdx).toBeGreaterThan(0);
    expect(raceIdx).toBeLessThan(postIdx);
  });
});

describe("wrapup-guard Stop hook autoCompleteIncomingDispatches", () => {
  test("wrapup-guard.js 有 autoCompleteIncomingDispatches 函式", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toContain("function autoCompleteIncomingDispatches");
  });

  test("Stop handler 呼叫 autoCompleteIncomingDispatches", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toContain("autoCompleteIncomingDispatches(cwd)");
  });

  test("保留 fail-closed on session-start 檔缺失", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toContain("no session-start file");
  });

  test("保留 30s sanity", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).toContain("30_000");
  });

  test("regression: Stop hook 不再用 sessionStartAt 過濾本 session dispatch (xd-1776387738014-hmqt)", () => {
    const src = readFileSync(WRAPUP_GUARD, "utf-8");
    expect(src).not.toMatch(/getTime\(\)\s*>\s*sessionStartAt/);
  });
});
