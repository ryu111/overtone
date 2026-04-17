# DRAFT — `~/.claude/CLAUDE.md` §Nova Blueprint 插入段

**狀態**：draft / 等 Manager review + 使用者簽核後才 commit 到 canonical `~/.claude/CLAUDE.md`
**預定插入位置**：§執行環境 之後、§全域元件歸屬 之前（第 55 行附近）
**行數**：28 行（使用者 Round 2 擬案 25 行，Round 3 微增 3 行加 non-negotiables 明示）

---

## Nova Blueprint（L1-L4 Agent Harness Canonical Index）

> schema_version 1 / last_updated 2026-04-18 / active_phase Phase 1 (P1 decisions, P2 pending)

### 四能力閉環（sense → detect → fix → learn）

| 能力 | 角色 | 主要元件（現有 + 新建）| Phase |
|------|------|-------------------|------|
| 持久記憶 | sense | reflections.jsonl + vault/ + （新）shared-memory.jsonl | P1 蒸餾自動化 / P2 跨 session broadcast |
| 斷鏈警告 | detect | chain-integrity.js + （新）session-start-health.js | P1 |
| 自動恢復 | fix | vault-broken-link-warner + （新）reference-graph.js | P2（證據驅動）|
| 自我進化 | learn | reflection-resolver-\* + （擴）PR drafter + （擴）rebuild | P2（視 P1 品質） |

### 三支柱 × L 矩陣（L0-L4 覆蓋度）

| 層 | Guide | Sensor | Closed-Loop |
|---|:-----:|:------:|:----------:|
| L0 觀察 | — | autonomy-scan / metrics | — |
| L1 反射 | — | 37 hooks/modules（guards / enforcer）| — |
| L2 查表 | 29 rules + 35 skills | — | skill-judge |
| L3 推理 | 7 agents + model-cascade | — | reviewer-enforcer |
| L4 自驅 | — | — | reflection-loop + canary |

### Canonical 指引

- **non-negotiable**：`~/.claude/` 唯一 SoT / 測試零容忍 / 治本優先 / feedback-loop 閉環必完整
- **broadcast 邊界**：shared SoT read + per-session write override（**非** fork）
- **升級階梯**：g4-26b → haiku → sonnet → opus，L0-L4 禁 g4-26b（L5 例外）

### Pointer

- ADR-003 四能力閉環：`obsidian/semantic/architecture-decisions/ADR-003-four-capabilities-closed-loop.md`
- ADR-004 obs rebuild：同上 `ADR-004-obs-rebuild-operation.md`
- ADR-005 L1-L4 統一：同上 `ADR-005-l1-l4-harness-unification.md`
- ADR-006 feedback loop：同上 `ADR-006-feedback-loop-completeness.md`
- state-of-nova（盤點）：`docs/state-of-nova.md`
- skills 目錄（procedural 層，非 ADR）：`~/.claude/skills/`

---

## 實際 diff 預覽（給 Manager review）

```diff
--- a/CLAUDE.md (before)
+++ b/CLAUDE.md (after, +28 lines)
@@ §執行環境 之後 @@

 ## 執行環境（自我認知）
 [... existing content ...]

+## Nova Blueprint（L1-L4 Agent Harness Canonical Index）
+
+> schema_version 1 / last_updated 2026-04-18 / active_phase Phase 1
+
+### 四能力閉環（sense → detect → fix → learn）
+[... 28 行如上 ...]
+
 ## 全域元件歸屬

 - `~/.claude/`（全域 rules/skills/hooks/agents/commands/scripts）由 **nova session** 維護
```

---

## Backlink

- nb Round 2 §六擬案（本 draft 的 baseline）：`spec/討論/master-blueprint-nb-round2.md`
- Round 3 裁決：`spec/討論/master-blueprint-nb-round3.md`
