# DRAFT — `docs/state-of-nova.md`（盤點文件）

**狀態**：draft / 等 Manager review + 使用者簽核後才 commit 到 canonical `docs/state-of-nova.md`
**更新節奏**：週（Phase 1 起），或重大 Phase 完成時
**讀者**：Manager + 使用者

```yaml
snapshot_date: 2026-04-18
snapshot_trigger: Master Blueprint Round 3 裁決（xd-y9rj）
next_refresh: 2026-04-25（每週一）或 Phase 1 完成時
```

---

## 一、L1-L4 Agent Harness 覆蓋度矩陣

### Layer 定義（擴自 rules/核心/深度路由.md）

| 層 | 性質 | 反應時間 | 代表動作 |
|---|------|---------|---------|
| **L0 觀察** | metrics / telemetry | 非即時 | 寫 data/ jsonl，無 block 能力 |
| **L1 反射** | hook / guard | < 100ms | block / warn / emit event |
| **L2 查表** | rules / skills | < 1s（文件讀）| AI 讀規則做判斷 |
| **L3 推理** | LLM + context | 1s-60s | agent 決策 / 程式碼產出 |
| **L4 自驅** | reflection / evolution | 分鐘-小時 | 寫反思 / 產 PR draft / 升級 rule |
| L5 客製化 | 專案特化 | — | novaplay / ai-media / block-world / discord-raffle |

### 三支柱 × L 覆蓋度（2026-04-18 實測）

| 層 | Guide（告訴 AI 怎麼做）| Sensor（即時偵測）| Closed-Loop（反饋驗收）|
|---|---|---|---|
| L0 觀察 | — | ✅ autonomy-self-scan + data/ jsonl | ⚠️ 無自動消費者 |
| L1 反射 | — | ✅ **37 hooks/modules** | ✅ guards.js + 各 enforcer |
| L2 查表 | ✅ **29 rules + 35 skills** | — | ✅ skill-judge |
| L3 推理 | ✅ 7 agents + model-cascade skill | — | ⚠️ reviewer 部分 |
| L4 自驅 | — | — | ⚠️ reflection 73.6% resolved，蒸餾手動 |
| L5 客製化 | ⚠️ 未盤點 | ⚠️ 未盤點 | ⚠️ 未盤點 |

**圖示**：✅ 覆蓋、⚠️ 部分覆蓋 / 缺口、— 該格不適用

### 各 L 元件數量盤點

| 層 | 元件型 | 數量 | 路徑 |
|---|------|:----:|------|
| L1 | hooks/modules/\*.js | 37 | `~/.claude/hooks/modules/` |
| L2 | rules | 29 | `~/.claude/rules/`（5 類）|
| L2 | skills | 35 | `~/.claude/skills/` |
| L3 | agents | 7 | `~/.claude/agents/`（planner / executor / reviewer / hook-executor / skill-executor / kfc / README）|
| 附 | commands | 5 | `~/.claude/commands/` |

---

## 二、Feedback Loop 現況

### 現有環節（全自動或半自動運作中）

| 環節 | 觸發 | 元件 | 狀態 |
|------|------|------|------|
| 反思寫入 | Stop hook | reflection-persist.js | ✅ 運作中（148 條 reflections）|
| 反思行動產出 | 定期 | reflection-resolver-check.js + -trigger.js | ✅ **73.6% resolved**（109/148）|
| 行為偵測 | 多層 hook | guards.js / structural-invariants / verify-guard 等 | ✅ 運作中 |
| 完成格式守護 | Stop hook | summary-format-guard / wrapup-guard | ✅ 運作中 |
| Session-end canary | Stop hook | self-dispatch-canary.js | ✅ 運作中（每 session 1 個）|
| review 強制 | 驗收前 | reviewer-enforcer.js | ✅ 運作中 |

### 半自動 / 手動環節

| 環節 | 觸發 | 元件 | 狀態 |
|------|------|------|------|
| 週蒸餾 synthesis | 週日 | raw/reflections/YYYY-WNN-synthesis.md | ⚠️ **手動產出**（Phase 0 baseline 中，目標 W17-W21 累積 4-6 週）|
| 元件掃描淘汰 | 手動 | scripts/component-scan.js | ⚠️ **無 cron**，需使用者/Manager 手動跑 |
| chain-integrity scan | 手動 | scripts/chain-integrity.js | ⚠️ **JSON 是 stub（generated_at: null）** |

### 缺口清單（Phase 1 + Phase 2 目標）

| # | 缺口 | 影響能力 | 補法 | Phase |
|:--:|------|:-------:|------|:-----:|
| 1 | chain-integrity 無 cron（JSON stub）| 能力 3 | launchd plist 每 2h 跑 | P1 |
| 2 | session-start 無 health 注入 | 能力 3 | 新 `hooks/modules/session-start-health.js` | P1 |
| 3 | 週蒸餾無自動化 | 能力 1 | launchd 週日 cron → 擴展 W{NN}-synthesis 範本 | P1 |
| 4 | reference-graph index 不存在 | 能力 2 | 新 `scripts/reference-graph.js`（SRP 獨立）| P2 |
| 5 | vault-broken-link-warner 無 auto-fix | 能力 2 | 擴展既有 hook，加確定性可修分支 | P2 |
| 6 | reflection → PR draft 不存在 | 能力 4 | 擴展 resolver 家族（新 `reflection-resolver-pr-drafter.js`）| P2 |
| 7 | 跨 session memory broadcast 不存在 | 能力 1+4 | 新 `~/.claude/data/shared-memory.jsonl` + broadcast 寫入規則 | P2 |
| 8 | obs rebuild 操作未實作 | 能力 4 子 | 新 `scripts/vault-rebuild.js` + schema v2.1 | P2（Phase 0 baseline 完成後）|

---

## 三、已完成里程碑（截至 2026-04-18）

| 里程碑 | commit | 影響層 |
|-------|--------|-------|
| M1 位置整合（nb cwd 改 ~/.claude/ + symlink）| 333720e | L3 + L4 操作流程 |
| 命名轉換（nova-brain → nova）| a1eea11 | L0-L4 術語一致性 |
| nb memory 遷移 | 同上 | L4 自驅 |
| 自壓縮 rule 精簡（三核心 MUST）| 2712f2f | L2 查表 |
| vault 升級（ADR-001）| 歷史 | L3 知識層 |
| wiki/skill refactor（ADR-002）| 歷史 | L2 skills |

---

## 四、L5 客製化層（本盤點 out-of-scope）

L5 = novaplay / ai-media / block-world / discord-raffle 等專案特化層，由各專案自己的 CLAUDE.md 管理，不在本盤點範圍。nb 只關注 L0-L4 的全域 harness。

---

## 五、下一步指向

- **Phase 1 啟動條件**：使用者簽核 ADR-003/CLAUDE.md Blueprint 段
- **Phase 1 範圍**：缺口 1/2/3（能力 3 + 能力 1 蒸餾自動化）
- **Phase 2 啟動條件**：Phase 1 驗收 + Phase 0 baseline（W17-W21）完成
- **Phase 2 範圍**：缺口 4/5/6/7/8（能力 2/4 + rebuild）

---

## Backlink

- CLAUDE.md §Nova Blueprint draft：`spec/討論/drafts/CLAUDE.md-nova-blueprint-section.md`
- ADR-003 draft：`spec/討論/drafts/ADR-003-four-capabilities-closed-loop.md`
- ADR-004/005/006 outlines：`spec/討論/drafts/ADR-004-005-006-outlines.md`
- Round 3 討論記錄：`spec/討論/master-blueprint-nb-round3.md`
