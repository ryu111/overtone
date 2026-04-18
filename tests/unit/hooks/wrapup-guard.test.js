// tests/unit/hooks/wrapup-guard.test.js
// Phase D deliveredAt 冷卻守護測試（xd-yv7v 2026-04-18）
//
// wrapup-guard.js 的 autoCompleteIncomingDispatches 整體依賴 execSync curl + readFileSync，
// 不適合直接 import 作整合測試（外部 I/O 全耦合）。
// 本測試採「純邏輯提取」策略：
//   複製 pending filter 邏輯成獨立純函式，驗證 deliveredAt 冷卻語意正確。
// 若 wrapup-guard.js 未來重構出可注入的 filter，改為直接 import 即可。

import { describe, it, expect } from "bun:test";

// ── 複製 pending filter 邏輯（與 wrapup-guard.js L138-145 同語意）─────────────────
// 若 wrapup-guard.js filter 規則變更，此函式也必須同步更新（architecture test B 守護 source truth）。

function buildPendingFilter(now) {
    return function filterDispatch(d) {
        if (d.status === "completed" || d.status === "failed") return false;
        // 30 秒 sanity：剛建立的不關（Main 可能還沒看到 dispatch）
        if (d.createdAt && now - new Date(d.createdAt).getTime() < 30_000) return false;
        // 60 秒 deliveredAt 冷卻：delivery 是進 Main 視野的明確信號（xd-yv7v 教訓 2026-04-18）
        if (d.deliveredAt && now - new Date(d.deliveredAt).getTime() < 60_000) return false;
        return true;
    };
}

// ── 測試工具 ──────────────────────────────────────────────────────────────────

/** 以毫秒偏移建立 ISO 時間字串（負數 = 過去） */
function isoOffset(now, offsetMs) {
    return new Date(now + offsetMs).toISOString();
}

// ── Phase D deliveredAt 冷卻守護 ──────────────────────────────────────────────

describe("wrapup-guard Phase D pending filter — deliveredAt 冷卻（xd-yv7v）", () => {
    const now = Date.now();
    const filter = buildPendingFilter(now);

    // ── 負例：deliveredAt < 60s 應被跳過（不 auto-complete）

    it("deliveredAt < 60s 且 createdAt > 30s → 跳過（不吞 dispatch）", () => {
        const d = {
            status: "pending",
            createdAt: isoOffset(now, -90_000),   // 90s 前建立，超過 30s sanity
            deliveredAt: isoOffset(now, -30_000),  // 30s 前 delivered，< 60s 冷卻
        };
        // filter 回傳 false = 跳過（不加入 pending list）
        expect(filter(d)).toBe(false);
    });

    it("deliveredAt 剛好在冷卻內（59s）→ 跳過", () => {
        const d = {
            status: "pending",
            createdAt: isoOffset(now, -120_000),
            deliveredAt: isoOffset(now, -59_000),
        };
        expect(filter(d)).toBe(false);
    });

    // ── 正例：deliveredAt > 60s 應被納入 pending（守護 60s 是冷卻不是永不）

    it("deliveredAt > 60s → 納入 pending（可 auto-complete）", () => {
        const d = {
            status: "pending",
            createdAt: isoOffset(now, -180_000),   // 3 分鐘前建立
            deliveredAt: isoOffset(now, -90_000),   // 90s 前 delivered，> 60s
        };
        expect(filter(d)).toBe(true);
    });

    it("deliveredAt 剛好超出冷卻（61s）→ 納入 pending", () => {
        const d = {
            status: "pending",
            createdAt: isoOffset(now, -120_000),
            deliveredAt: isoOffset(now, -61_000),
        };
        expect(filter(d)).toBe(true);
    });

    // ── 無 deliveredAt：退回 createdAt 30s sanity ──────────────────────────

    it("無 deliveredAt + createdAt < 30s → 跳過（30s sanity 保留）", () => {
        const d = {
            status: "pending",
            createdAt: isoOffset(now, -15_000),   // 15s 前建立
            deliveredAt: null,
        };
        expect(filter(d)).toBe(false);
    });

    it("無 deliveredAt + createdAt > 30s → 納入 pending", () => {
        const d = {
            status: "pending",
            createdAt: isoOffset(now, -60_000),
            deliveredAt: undefined,
        };
        expect(filter(d)).toBe(true);
    });

    // ── 已完成的 dispatch 不納入 ──────────────────────────────────────────

    it("status=completed → 跳過（無視時間戳）", () => {
        const d = {
            status: "completed",
            createdAt: isoOffset(now, -300_000),
            deliveredAt: isoOffset(now, -200_000),
        };
        expect(filter(d)).toBe(false);
    });

    it("status=failed → 跳過", () => {
        const d = {
            status: "failed",
            createdAt: isoOffset(now, -300_000),
        };
        expect(filter(d)).toBe(false);
    });
});
