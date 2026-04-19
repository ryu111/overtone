---
title: reflections.jsonl canonical 統一議題
date: 2026-04-19
status: accepted          # iter 11 升：nm xd-wrh2 Round 1 ack 方向 B
scope: global             # ~/.claude/ + ~/projects/* aggregate
trigger: ralph-loop iter 2 發現 double-data drift
owner: nb
round: 1                  # Round 1 閉環，Round 2 由 nm 下 session 帶 AskUser 後派
related_dispatches:
  - xd-1776592573552-sa79  # nb → nm Round 1 request
  - xd-1776592645128-wrh2  # nm → nb Round 1 ack 方向 B
---

# reflections.jsonl canonical 統一議題

- **日期**：2026-04-19
- **觸發**：ralph-loop iter 2 發現 `~/.claude/data/data/reflections.jsonl` 雙層殘檔時，追到根因後發現更大的 path drift 議題
- **Scope**：Nova 全域（~/.claude/ + ~/projects/nova-brain + ~/projects/nova-manager）
- **Status**：accepted（iter 11 升）— nm Round 1 ack 方向 B，待下 nm session 帶使用者 AskUser 後派 Round 2 實作

## 問題

`reflections.jsonl` 在 scripts / hooks 間路徑語義不一致。實際存在至少 4 套假設：

### Drift Inventory（2026-04-19 iter 8 盤點）

| 路徑語義 | 使用處 | 實際狀態 |
|---|---|---|
| **全域 canonical** `~/.claude/data/reflections.jsonl` | 5 scripts：vault-distill / judge-scores / reflect / cli/harness / inject-learning-context | **❌ 檔案不存在**（5 scripts 永遠讀空，靜默失敗） |
| **nb 專用** `~/projects/nova-brain/data/reflections.jsonl` | 2 scripts：autonomy-self-scan / weekly-synthesis + feedback-audit-health | ✅ 活躍 186+ 筆（nb session 的 reflection-persist 寫入） |
| **nm 專用** `~/projects/nova-manager/data/reflections.jsonl` | 2 scripts：reflection-backfill / reflection-resolver | ✅ 存在（nm session 寫入） |
| **per-session** `{cwd}/data/reflections.jsonl` | 6 hooks：reflection-persist (writer) / reflection-counter / reflection-resolver-check / ralph-queue-gate (x2) / ralph-iter-scorer | ✅ writer = reflection-persist，每 cwd 各自獨立 |

### 具體影響

- 5 個 `.claude/data/` scripts **永遠拿到空資料**：`judge-scores.js` reflection 分數永遠是 0；`reflect.js` Reflexion append 從未讀到上次 reflection；`inject-learning-context.js` SessionStart 注入空 reflection 列表 — 靜默失敗（違反 CLAUDE.md「禁止靜默失敗」）
- per-session hooks 寫入 `{cwd}/data/reflections.jsonl` 但其他 session 分析腳本讀不到 — 跨 session 學習鏈斷
- iter 2 發現的 `~/.claude/data/data/reflections.jsonl` 雙層殘檔根因（cwd 末尾 `/data` 時 join 產生雙層）已在 iter 2 修（`cwd.replace(/\/data\/?$/, "")` normalize），但上游 drift 未解

## 3 個方向選項

### 選項 A — 全部統一到 `~/.claude/data/reflections.jsonl`（全域單檔）

- **改動**：
  - hooks/modules/*.js 6 處 `join(cwd, "data/reflections.jsonl")` 改為 `join(homedir(), ".claude/data/reflections.jsonl")`
  - nb / nm 專用 scripts 4 處改指全域 path
  - 現有 `~/projects/nova-brain/data/reflections.jsonl` + `~/projects/nova-manager/data/reflections.jsonl` 內容 merge 到 `~/.claude/data/reflections.jsonl`
- **優**：單一 SoT，所有分析腳本一致；簡單心智模型
- **缺**：
  - 所有 session 寫入同一檔 → 併發 append 衝突風險（需 file lock 或 queue）
  - per-session 隔離語義失去（grep 時要靠 `trigger` 欄位區分 session）
  - 遷移動作需停機（migration 期間可能錯失 entry）
- **風險**：concurrent append 雖 POSIX 保證 < 4KB atomic，但 entry 大時未保證

### 選項 B — 統一 per-session `{cwd}/data/reflections.jsonl`（writer canonical）

- **改動**：
  - 5 個讀 `~/.claude/data/reflections.jsonl` 的 scripts 改為 **aggregate read**（借 feedback-audit-health.js `projectsDir` iteration pattern）
  - nb / nm 專用 scripts 維持（它們已對齊 per-session pattern）
  - 不改 hooks（它們已是 canonical writer）
- **優**：
  - 不改 writer，沒 migration 風險
  - session 隔離保留（各 cwd 獨立 reflection 軌跡）
  - 對齊 reflection-persist.js 既有設計
- **缺**：分析腳本需掃多 session（略複雜），但 feedback-audit-health 已證明可行
- **風險**：新 session 產生新檔，歷史檔案散落 — 但本就如此（非新增風險）

### 選項 C — 混合：per-session 寫 + 定期 aggregate 到全域

- **改動**：
  - 不改 writer（維持 per-session）
  - 新增 `scripts/aggregate-reflections.js` 定期將多 session entries merge 到 `~/.claude/data/reflections.jsonl`（dedup by hash）
  - 讀取腳本全部改指全域 aggregate 檔
  - cron / daily-report 排程觸發 aggregation
- **優**：per-session writer 保留 + 全域讀取簡化
- **缺**：新增 aggregation 腳本 + cron 排程 + dedup 邏輯；aggregation lag（非即時 SoT）
- **風險**：aggregation 失敗時全域檔 stale，需監控

## 初步建議：選項 B

**理由**：
1. **最小影響面**：改 5 個 reader scripts 而非 6 個 writer hooks + migration
2. **零遷移風險**：不動現有資料
3. **業界對齊**：選項 B 的 aggregate-on-read pattern 對齊「event sourcing」per-producer file + central query
4. **reflection-persist.js 已是 canonical writer**：iter 2 fix（cwd /data normalize）已明示 writer 設計，downstream 讀者應配合而非反向

**反駁**：若使用者偏好單一 SoT 心智模型（選項 A）或有跨 session aggregation 需求（選項 C），需 Manager / 使用者決策。

## 執行計畫（選項 B 為前提）

**iter 9+**（需 Manager / 使用者認可方向後）：

1. **實作 `scripts/lib/reflections-aggregate.js` helper**（D1，30min）
   - export `readAllReflections()` 掃 `~/projects/*/data/reflections.jsonl` 彙整
   - export `readProjectReflections(cwd)` 單 session 讀取
2. **5 個 reader scripts 改用 helper**（D1，30min）
   - vault-distill.js / judge-scores.js / reflect.js / cli/harness.js / inject-learning-context.js
3. **baseline test**（D1，20min）
   - `tests/unit/reflections-aggregate.test.js` 驗 helper 讀取行為
4. **刪 stale fallback**（D0，10min）
   - 若有腳本 fallback 到 `.claude/data/reflections.jsonl`，清除 dead path
5. **docs 更新**（D0，10min）
   - rules/核心/自驅反思.md 明示「reflections.jsonl 寫入在 {cwd}/data/，跨 session 讀取用 helper」

**總成本**：約 1 iter 工作量（D2）

## Non-Negotiables

- ⛔ NEVER 選項 A 但未加 file lock — concurrent append 衝突 bug 風險不可接受
- ⛔ NEVER 選項 C 但未加 aggregation 失敗監控 — 靜默 stale 風險
- 📋 MUST 方向決策前至少 Manager ack + 使用者同意（影響全 Nova 知識流）
- 📋 MUST 實作前做 baseline test 鎖定既有行為（5 scripts 當前靜默失敗的「壞 baseline」明示記錄，避免修復時誤以為原本 work）

## 關聯

- iter 2 根因修復：hooks/modules/reflection-persist.js cwd `/data` normalize（commit `1a2d723`）
- iter 2 殘檔清理：`~/.claude/data/data/reflections.jsonl` 刪除
- [rules/核心/自驅反思.md](../../rules/核心/自驅反思.md) — reflections.jsonl schema 定義處
- [rules/品質/回饋與進化.md](../../rules/品質/回饋與進化.md) — 反思協議
- feedback-audit-health.js — multi-project aggregate pattern 證明可行

## 下一步

- [ ] Manager review 本 spec，選方向（A / B / C）或提新方案
- [ ] 使用者認可方向（跨 session 知識流屬 core_objective 相關）
- [ ] iter 9+ 派自己實作（若選 B 工作量約 1 iter）
