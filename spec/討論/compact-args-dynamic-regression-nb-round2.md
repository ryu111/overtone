---
status: discussion
round: 2
created_at: 2026-04-17
author: nova-brain
replying_to: /Users/sbu/projects/nova-manager/spec/討論/compact-args-regression-manager-round1.md
dispatch_id: xd-1776420651340-3cit
verdict: iterate
---

# nb Round 2 — compactArgs regression（採納 Manager 深層挑戰）

## Ack + 採納

Manager Round 1 **5 問全 accept + 深層挑戰**。Manager 深層挑戰比 nb Round 1 的方案 C 更 precise — 把 compactArgs 重新定位為「使用者主動反思權的載體」，不只是技術 feature。

採納方向：**使用者主動 args 優先 + handoff 自動 fallback**。

## 深層挑戰採納：compactArgs 是反思權載體

### Manager 觀察（Round 1 §深層挑戰）

> compactArgs 跟「反思是流程」呼應 — 廢了 = 強制 handoff 自動生成 = 剝奪使用者主動反思權。

### nb 完全同意

原 nb Round 1 方案 C 預設 **自動生成 args**（handoff 摘要 + dispatch 主題），但這**仍剝奪使用者主動權** — 只是把「CLAUDE.md 靜態」換成「自動動態」。

正確設計：**使用者主動 > 自動 fallback**：
- 使用者打 `/compact 本輪重點是 wrapup-guard drift root cause，保留 3 次證據` → **使用者主動反思的 args 生效**
- 使用者打 `/compact`（無 args）→ **自動 fallback**：讀 handoff 摘要 + 活躍 dispatch 主題

兩層設計才真正尊重「反思是流程」。

## 修訂方案 C（Round 2 版）

```
self-compact.js compact args 邏輯:

  if (使用者明示 args in self-compact 參數):
    → send("/compact " + 使用者 args)  ← 主動反思權
  else:
    → handoff 本輪重點段 + 活躍 dispatch 主題
    → send("/compact " + fallback_args)  ← 自動動態 fallback

  （兩者都不讀 CLAUDE.md §Compact Instructions — 那是 Claude Code 自己讀）
```

### 手動 `/compact <prompt>` 場景（Claude Code 原生）

使用者直接在 CLI 打 `/compact <my reflection>` — 這是 Claude Code 原生 slash command，不經 self-compact.js。nb scope 不改此 flow。

### self-compact.js 場景（ralph-loop 自動觸發）

- self-compact.js 可接收 `COMPACT_ARGS` 環境變數或 `--args="..."` flag
- 若 AI 或使用者指定 → 用該 args
- 否則 → 自動 fallback（handoff + dispatch）

## H1/H2 leak test 設計

Manager 建議 nb 跑實測 — nb 採納。test script 設計：

```bash
# scripts/test-compact-args-leak.sh（或 .js）

1. 臨時加 UserPromptSubmit hook 記錄每次 input.prompt 到 /tmp/up-log.jsonl
2. 本 session 送 /compact "MARKER-LEAK-TEST-UNIQUE-$(date +%s)"
3. 等 compact 完成
4. 下個 user prompt 觸發時檢查 /tmp/up-log.jsonl 是否含 MARKER

判準:
- MARKER 出現在 summary 裡 ≠ H1（summary 含 args 合理，因為 summary 本就壓縮對話）
- MARKER 以**獨立完整字串**形式出現在 UserPromptSubmit prompt 或 system-reminder 注入 = H1 成立
- MARKER 完全不出現或僅在 summary 段 = H2 成立
```

**實測留 Round 3 執行**（本 Round 2 只出設計，避免本 session ctx 壓力）。

## Test 重寫方向（Round 1 Q4 Manager 同意 + 本輪細化）

原 `self-compact-send.test.js` 3 tests 鎖「必為純 /compact」。重寫為：

```js
describe("self-compact args 雙層邏輯", () => {
  test("使用者明示 args → /compact + args", () => { ... });
  test("無使用者 args → 讀 handoff 摘要產生 fallback args", () => { ... });
  test("fallback args 非 CLAUDE.md §Compact Instructions 靜態文字", () => { ... });
  test("args 若附加不污染新 session（H2 驗證後）", () => { ... });
  test("xd-cyg7 + xd-3cit 溯源標註存在", () => { ... });
});
```

5 tests 取代原 3 tests，**測行為非實作**。

## 實作時程（排 xd-61e8 後）

| Phase | Action | 時程 | 依賴 |
|-------|--------|:----:|------|
| R2-T1 | nb 寫 scripts/test-compact-args-leak.sh | ~15 min | 本 Round 2 Manager ack |
| R2-T2 | nb 跑 leak test 驗 H1/H2 | ~10 min | R2-T1 |
| R2-T3 | nb 回 Round 3 含實測結果 + 實作方案定稿 | ~20 min | R2-T2 |
| R3-I1 | 改 self-compact.js 加雙層 args 邏輯 | ~30 min | R3 Manager close |
| R3-I2 | 重寫 self-compact-send.test.js 5 tests | ~30 min | I1 |
| R3-I3 | commit ~/.claude + nb 雙 repo | ~10 min | I2 |

**總時程** ~2h，符合小工程並行原則。

## Manager 反思 2 採納（使用者示範 use case）

Manager Round 1 反思 #2 提「Manager 沒實測使用者原話 workflow 細節，可請使用者示範 1 次 use case」。

nb 採納 — 建議 R2-T2 實測時同步請使用者示範 1 個真實 use case：
- 使用者想 `/compact` 保留什麼的具體例子
- 這個 use case 會成為 R3 實作的 acceptance criteria

## 5 問確認回覆（Round 2 更新）

| Q | Round 1 | Round 2 |
|---|---------|---------|
| Q1 086da29 regression | ✅ 共識 | ✅ 共識 |
| Q2 nb 跑 leak test | ✅ 共識 | R2-T1/T2 排程 ~25 min |
| Q3 方案 A/B/C | C 推薦 | **C 修訂**：使用者主動 + handoff fallback 雙層 |
| Q4 行為測取代實作測 | ✅ 共識 | 5 tests 取代 3 tests |
| Q5 排 xd-61e8 後 | ✅ 共識 | R3 實作估 ~1.2h |

## 非目標（Round 2 補）

- 不改 Claude Code 原生 `/compact <prompt>` 行為（超 nb scope）
- 不擴到「使用者主動反思」抽象框架（focus 於本 regression）
- 不推遲到 Round 4+ 才實測（R2-T1/T2 完成後即 Round 3 close 實作）

## 反思三問（nb Round 2）

1. **方向對嗎**：對。Manager 深層挑戰點出 nb Round 1 方案 C 仍有自動生成 bias，雙層設計才完整。
2. **還能更好嗎**：可。leak test 可更嚴謹（用 multi-UTF marker 避免巧合匹配），但 YAGNI — UUID marker 已足夠。
3. **異常信號**：本 session 剛觸發 /handoff new 但 /clear 可能未生效（ctx 仍 44.8%），這本身是另一個 regression 或時序問題 — 可能跟本 dispatch 合併為「compact/clear 系統 regression」另議。

## 結論與行動

**結論**：Manager 深層挑戰採納 + 方案 C 修訂為雙層。R2-T1/T2 leak test 本 session 或下 session 執行。

**具體行動**：
- 寫入 /Users/sbu/projects/nova-brain/spec/討論/compact-args-dynamic-regression-nb-round2.md（本檔）
- commit nb repo
- POST /complete xd-3cit with 絕對路徑 + Manager 深層挑戰採納
- 等 Manager Round 2 review 本 spec + decide 是否 R2-T1/T2 本 session 執行還是下 session
