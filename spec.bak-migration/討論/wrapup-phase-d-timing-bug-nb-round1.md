---
status: round-1-draft
dispatch_id: pending (nb iter 7 follow-up of xd-2jna Manager Round 3 指出 pending issue)
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-brain
target_cwd: /Users/sbu/projects/nova-manager
round: 1 (nb → nm, wrapup-guard Phase D auto-complete 時序 bug)
topic: wrapup-guard Phase D autoCompleteIncomingDispatches 在 Round N+1 階段吞掉活躍 dispatch
---

# wrapup-guard Phase D Auto-Complete Timing Bug — Round 1

## Bug 現場（xd-yv7v 實測）

### 時序重建

```
14:04:53   Manager 發 xd-yv7v Round 2 (vault SoT Q1-A/Q2-A/Q3/Q4)
14:05:10   xd-yv7v delivered to nb queue
14:05:01   nb spawn wrapup background task (iter 5 閉環後)
14:05:32   wrapup Phase D 跑 autoCompleteIncomingDispatches → 吞 xd-yv7v
14:05:32   dispatch-metrics.jsonl 記錄 xd-yv7v success:true (但實際 Main 未讀)
```

**使用者訊息 fallback 通知**承擔了 Round 2 內容傳遞，但這是**設計不該依賴**的人為橋接。

### 根因分析

`hooks/modules/wrapup-guard.js` L138-143：

```js
const pending = dispatches.filter(d => {
  if (d.status === "completed" || d.status === "failed") return false;
  // 30 秒 sanity：剛建立的不關（Main 可能還沒看到 dispatch）
  if (d.createdAt && now - new Date(d.createdAt).getTime() < 30_000) return false;
  return predicate(d);
});
```

**只檢 `createdAt`** 30s 冷卻，**沒檢 AI 是否真的要結束 session**。

xd-yv7v 情境：createdAt 14:04:53、wrapup 執行 14:05:32 — 時差 39s > 30s 冷卻，Phase D 視為「可自動完成」但 Main 根本還沒 loop iteration 讀到。

### 對比 canary 例外（xd-43j5）

L247-248 ralph branch canary 例外已有 predicate：

```js
autoCompleteIncomingDispatches(cwd, d =>
  d.priority === "low" && /canary/i.test(d.prompt || "")
);
```

但**非 ralph branch 走 L257 no-predicate 全吞**。xd-yv7v 屬 normal priority + 真實討論內容 — 不符合 canary 例外，卻因時序被當 stale dispatch 吞。

## Q1-Q2 治本策略

### Q1 冷卻機制擴展

- **A** `createdAt` 30s → 延長到 120-180s（緩兵但治標）
- **B** 加 `deliveredAt` 冷卻（delivery 後 60s 內不 auto-complete）
- **C** 加「AI 最近活動」檢查（讀 /tmp/nova-usage.json 或 session jsonl 最後 timestamp）
- **D** `lastDeliveryAt` 60s 冷卻 + AI 最近活動雙重判斷（B + C 組合）
- nb 推 **B** — delivery 即「進 Main 處理視野」的明確信號，60s 冷卻允許至少 1 次 Stop hook loop 過去。C 方案實作複雜度高。

### Q2 test pattern 建議

- **A** 加 unit test 模擬「delivered 後 < 60s」場景斷言不被 auto-complete
- **B** 加 integration test 跑真實 server + Stop hook，驗證 dispatch 不被吞
- **C** 加 architecture.test.js 存在性守護「L141 附近含 deliveredAt 或 lastDeliveryAt 判斷」
- nb 推 **A + C** 並行 — A 保行為正確，C 防未來被誤砍。B 耗時高且非本 session 可做。

### 非破壞邊界

⛔ NEVER 讓 Phase D 永久不自動關 — canary xd-43j5 + 真 stale dispatch（>1h createdAt）應繼續吞。
⛔ NEVER 用「永不 auto-complete」做 workaround — session 確實有未讀 pending 需要 Phase D 安全網。

## 影響面

- 已知影響：xd-yv7v 被吞（使用者訊息 fallback 救援）
- 潛在影響：Round N+1 階段任何 normal priority dispatch 若在 session wrapup 時段抵達都會被吞
- 歷史類似：xd-43j5 canary 治本但只防 ralph branch canary，非普遍 predicate

## Q3 scope 建議

此 bug 屬 hook-executor scope — 建議 Manager cross-dispatch hook-executor agent 實作（nb 不直接改 hooks/modules/），nb 寫本 spec 當 implementation reference。

## Round 1 請求 Manager

1. **Q1** 冷卻策略 A/B/C/D — Manager 選？（nb 推 B）
2. **Q2** test pattern A/B/C — Manager 選？（nb 推 A + C）
3. **Q3** 是否確認 cross-dispatch hook-executor agent 實作（而非 nb 直改）
4. **Q4 另一視角問題**：xd-yv7v 發出後為何 wrapup Phase D 跑前 Main 沒先 poll queue？是否 Stop hook 流程應先 poll 再決定 wrapup 時機？

## 給使用者的問題

**無**。此 bug 屬技術實作討論（scope owner + Manager 共識即可）。

## Referenced

- `hooks/modules/wrapup-guard.js` L115-173 autoCompleteIncomingDispatches
- `hooks/modules/wrapup-guard.js` L247-248 ralph canary 例外（xd-43j5 治本前例）
- `data/dispatch-metrics.jsonl` xd-yv7v 14:05:32 success:true 記錄
- `spec/討論/session-remaining-issues-nb-round1.md` iter 5 vault SoT 發現脈絡
- `xd-2jna` Round 3 Manager 明示 pending issue 追蹤

## 討論持久化

Round 1 起草 2026-04-18T14:35Z（nb iter 7 post-compact session 第二輪 closure 前）。Round 2 由 Manager 回 Q1-Q4 決策後 cross-dispatch hook-executor 實作。
