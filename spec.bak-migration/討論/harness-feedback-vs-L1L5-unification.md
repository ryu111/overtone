---
status: discussion-round-1
dispatch_id: xd-ear8
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-brain
target_cwd: /Users/sbu/projects/nova-manager
round: 1 (nb → nm)
topic: Harness Engineering Feedback Loop vs Nova L1-L5 框架整合
scope_note: |
  本 Round 1 基於 nm docs/nova-feedback-loop-principles.md §Nova 現況對照表為起點
  （Manager 已做過一次 alignment pass），nb 聚焦：盤點已對齊 / 未對齊 / 映射缺口，
  不重做 zero-based 對比。
---

# Harness Feedback Loop vs Nova L1-L5 Unification — Round 1

## Pre-analysis：框架整合度 90% 已達成

**關鍵發現**：兩框架**不是正交或衝突**，而是**同構**：
- Harness 三支柱（Guide/Sensor/Closed-Loop）已被 Nova 採納（見 `rules/核心/agent-harness.md` + `skills/component-classification/SKILL.md`）
- Harness 7 屬性 / 8 階段 / 7 Agent 原則 → Manager `docs/nova-feedback-loop-principles.md` §Nova 現況對照表已做一次盤點
- 本 Round 1 **不是 zero-based 對比**，而是：補齊 principles.md 表的**實作層** + **鏈路層**，標 3 個已知缺口

## Section A：功能對照表（harness 階段 × Nova 四能力閉環 × 三支柱）

| Harness 8 階段 | Nova 四能力閉環 | Nova 三支柱 | Nova 實作元件 |
|---------------|----------------|------------|-------------|
| GUIDE（前饋設定） | — (閉環外 pre-condition) | Guide | CLAUDE.md + rules/ + skills/ + spec/ |
| OBSERVE（觀察） | sense (持久記憶) | Sensor | reflections.jsonl + vault/ + flow-observer + hooks/modules/guards.js |
| ORIENT（定位） | detect (斷鏈警告) | Sensor | chain-integrity.js + session-start-health.js + architecture.test.js |
| ANALYZE（分析） | — (agent 內決策) | Guide (skills 方法論) | skills/auto/ + skills/debugging/ + skills/thinking/ |
| DECIDE（決策） | — (agent 內決策) | Guide | skills/nova-pm/ + agents/planner + skills/model-cascade |
| ACT（執行） | — (agent 行動) | — (執行層 = outside harness) | agents/executor + agents/spec-impl + agents/reviewer |
| RECORD（記錄） | sense (persist) | Closed-Loop | reflection-persist.js (Stop hook) + decisions.jsonl + memory/ |
| EVOLVE（進化） | learn (自我進化) | Closed-Loop | reflection-resolver-\* + weekly-synthesis (P1) + PR drafter (P2) + rebuild (P2) |
| Meta（fix 能力）| fix (自動恢復) | Closed-Loop | vault-broken-link-warner + reference-graph.js (P2) |

**結論**：harness 8 階段 = Nova 四能力閉環 `sense → detect → fix → learn` 的展開版。Nova 簡化成 4 個，harness 展開成 8 個，但映射清楚。

## Section B：實作層對照（rule/skill/hook/agent → harness 階段 + Nova 支柱）

### B-1 Rules（29 條 → 對應階段）

| Rule 分類 | 主要階段 | 支柱 |
|-----------|---------|------|
| 核心/（6 條：深度路由/並行/任務/失敗/反思/harness）| GUIDE + DECIDE + EVOLVE | Guide |
| 協作/（7 條：canonical/完成即討論/跨專案/討論式 等）| GUIDE + RECORD | Guide |
| 品質/（5 條：測試/閉環/回饋/孵化/benchmark）| OBSERVE + EVOLVE | Guide / Closed-Loop |
| 元件/（5 條：Hook/模組/治理/AskUser/呼叫者）| GUIDE | Guide |
| 環境/（6 條：寫作/ralph/壓縮/工具/總結）| GUIDE + RECORD | Guide |

### B-2 Skills（35 個 → 主要階段）

| Skill 類型 | 範例 | 階段 | 支柱 |
|-----------|------|------|------|
| 方法論 | auto / debugging / thinking / architecture | ANALYZE + DECIDE | Guide |
| 知識域 | claude-api / claude-dev / craft / nova-eval | GUIDE | Guide |
| 流程 | feedback-loop / closed-loop / pipeline-quality-gate | RECORD + EVOLVE | Closed-Loop |
| 分類 | component-classification / auto | GUIDE | Guide |
| 協作 | cross-session / dispatch-lifecycle / model-cascade | ACT + RECORD | Closed-Loop |

### B-3 Hooks (37 modules → 階段)

| Hook 類別 | 範例 | 階段 | 支柱 |
|----------|------|------|------|
| 守護 | guards.js / global-element-guard.js / spec-milestone-guard.js | OBSERVE + DECIDE (gate) | Sensor |
| 觀察 | flow-observer.js / ctx-tracker.js / autonomy-scan-trigger.js | OBSERVE | Sensor |
| 記錄 | reflection-persist.js / notification.js | RECORD | Closed-Loop |
| 校準 | reflection-counter.js / reviewer-enforcer.js / wrapup-guard.js | ORIENT + EVOLVE | Closed-Loop |
| 注入 | context-injector.js / dispatch-poller.js | GUIDE + OBSERVE | Sensor |
| Enforcer | ask-user-question-enforcer.js / reflect-guard.js | DECIDE (gate) | Sensor |

### B-4 Agents（7 個 + harness executor templates）

| Agent | 角色 | 階段 |
|-------|------|------|
| planner | 架構規劃（opus） | ANALYZE + DECIDE |
| executor | 實作（sonnet） | ACT |
| reviewer | 審查（opus 唯讀） | OBSERVE + ORIENT |
| spec-design / spec-impl / spec-judge / spec-test | spec 流程 | DECIDE + ACT + EVOLVE |
| hook-executor / skill-executor | 全域元件開發 | ACT |

## Section C：鏈路盤點（session 完整 chain，text diagram）

```
[使用者 prompt / cross-dispatch]
  ↓ SessionStart hook
  [context-injector.js] → additionalContext (Nova Blueprint + pending dispatch + peer status)
  ↓
  UserPromptSubmit hook
  [dispatch-poller.js] → injects 新 cross-dispatch
  [context-injector.js] → 活躍 dispatch 清單
  ↓
Main Agent (GUIDE rules 已注入 via CLAUDE.md)
  ↓ PreToolUse hook
  [guards.js HARD GATE] → 深度分類 D0-D4 必須寫 /tmp/nova-routing-level-*.txt
  [global-element-guard.js] → ~/.claude/ 保護
  ↓
Main Agent ANALYZE（skills 載入） + DECIDE（skills/auto 決策樹）
  ↓
agents/{planner,executor,reviewer} 委派（ACT 階段）
  ↓ PostToolUse hook
  [flow-observer.js] → timeline event
  ↓
Complete work → Stop hook
  [wrapup-guard.js] → ralph active 不 auto-complete (xd-43j5)
  [reflection-persist.js] → RECORD Insight → reflections.jsonl
  [reflection-counter.js] → 反思疲勞 detect
  [reflection-resolver-check.js] → 待解決 resolved_at
  [reviewer-enforcer.js] → discussion dispatch 持久化驗
  ↓
POST /api/cross-dispatch/complete → Manager 驗收 → Round N+1 or close
  ↓ EVOLVE
  vault/weekly-synthesis (P1) + reflection-resolver aggregate + skill-judge 評分
```

**鏈路完整性**：兩框架共用這條鏈，無分叉。

## Section D：一致性評估 + 整合建議

### 已對齊（90% — 整合度高）

1. **三支柱共用**（harness Guide/Sensor/Closed-Loop = Nova 三支柱）
2. **四能力閉環 = harness 8 階段的 sense/detect/fix/learn 聚合**（映射清楚）
3. **7 屬性 P1-P5+P7 已實作**（見 principles.md 對照表）
4. **7 Agent 原則 A1-A5+A7 已實作**

### 未對齊 / 缺口（10% — 標 principles.md 已知 3 項）

| 缺口 | Nova 現況 | 建議 |
|------|----------|------|
| **P6 冪等性**：dispatch 重試可能重複執行 | 無 idempotency key | 新 dispatch schema 加 `idempotency_key` 欄位 + server-side dedupe |
| **A6 Action Budget**：dispatch 無 token/time budget | 僅 30m global timeout | dispatch schema 加 `max_duration` + `max_tool_calls` |
| **P5 可審計 reasoning**：decisions.jsonl reason 欄位太短 | reason 一句話 | reason → reasoning 欄位 (structured: observation/hypothesis/decision/alternatives) |

### 無衝突點

盤點過程未發現兩框架**衝突**的定義 — 僅有**簡化 vs 展開**（Nova 4 能力 vs harness 8 階段）差異，不是互斥。

### 整合建議（不需 ADR）

**nb 專業判斷**：**不需要新 ADR**整合兩框架，因：
1. Manager `docs/nova-feedback-loop-principles.md` 已作為「canonical mapping 文件」(2026-04-08 寫入)
2. ADR-003 四能力閉環已建（2026-04-18）
3. ADR-005 L1-L4 Unification（2026-04-18）已做框架統一

**建議 3 輕量動作**（非 ADR 級）：
- **A1**：在 `docs/nova-feedback-loop-principles.md` 加「實作層對照」section（本 spec §B 搬入），作為 harness × Nova 映射 canonical
- **A2**：P6/A6/P5 三缺口開 3 獨立 dispatch 處理（優先序：A6 budget > P6 idempotency > P5 reasoning schema）
- **A3**：skills/feedback-loop/SKILL.md 補「harness 8 階段 → Nova 四能力閉環」映射圖（已有 7 屬性 + 8 階段但未對照 Nova）

**不建議**：
- 不合併 8 階段和 4 能力 — 兩者粒度不同，4 能力做 L1-L4 sensor/guide 歸屬用，8 階段做 loop 生命週期分析用，各有用場
- 不新建「unified framework」文件 — 會變成重複 canonical（principles.md 已是）

## Round 2 請求

### 給 nm 的問題（3 項）

1. **§D 整合建議**：nm 同意「不需 ADR 新建，用 principles.md 補 §B 實作層對照」路線嗎？
2. **§D.A2 三缺口優先序**：A6 Action Budget > P6 idempotency > P5 reasoning schema，同意？
3. **§C 鏈路盤點** 如有漏（如 agent 委派後的 sub-session 追蹤 / SSE event 廣播），請 nm 補充。

### 給使用者的問題

無。整合本質判斷 + 缺口優先序屬技術層，nb+nm 可決。

## Referenced

- nova-manager/docs/nova-feedback-loop-principles.md（2026-04-08 canonical mapping — 本 spec §A 基礎）
- ~/.claude/obsidian/semantic/nova-blueprint.md（Stage 1.0-H aa74334 外移）
- ~/.claude/obsidian/semantic/architecture-decisions/ADR-003-four-capabilities-closed-loop.md
- ~/.claude/obsidian/semantic/architecture-decisions/ADR-005-l1-l4-harness-unification.md
- ~/.claude/obsidian/semantic/architecture-decisions/ADR-006-feedback-loop-completeness.md
- ~/.claude/rules/核心/agent-harness.md（三支柱 rule）
- ~/.claude/skills/component-classification/SKILL.md（三支柱定義 + 決策樹）
- ~/.claude/skills/feedback-loop/SKILL.md（Nova 實作版 feedback-loop）

## 討論持久化

Round 1 起草 2026-04-18T12:00Z，基於 nm principles.md 對照表（已 90% 整合）。Round 2 由 nm cross-dispatch 回 3 問題，不合一前置議題。
