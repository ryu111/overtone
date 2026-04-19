# DRAFT — nova-brain/CLAUDE.md §Related Blueprint 段

**狀態**：draft，Stage 0 完工時同日 commit（與 nm + 全域 CLAUDE.md pointer 一起）
**目的**：補 nb CLAUDE.md 跟全域 Nova Blueprint / ADR-003-006 / state-of-nova 的 backlink
**擁有者提交紀律**：本 draft 不 commit 到 CLAUDE.md，等 Stage 0 完工 Gate 齊

---

## 插入位置建議

`~/projects/nova-brain/CLAUDE.md` L48 `## Blueprint` 段**之前**新增段。

理由：放 §Blueprint 前讓讀者先建立「全域架構語境」，再讀 nb 自身 identity —— 自頂而下與 nm 對稱。

---

## 段落 draft（約 22 行）

```markdown
## Related Blueprint（全域架構 pointer）

本 session 在 Nova 全域架構中的定位請先讀：

| 層次 | 文件 | 角色 |
|------|------|------|
| 全域 index | `~/.claude/CLAUDE.md` §Nova Blueprint | 四能力閉環 + 三支柱 × L 矩陣 canonical index |
| 架構決策 | `~/.claude/obsidian/semantic/architecture-decisions/ADR-001-vault-upgrade.md` | vault-layer3 升級（v2 Revised Stage 0-4 全範圍）|
| 架構決策 | 同目錄 `ADR-003-four-capabilities-closed-loop.md` | sense → detect → fix → learn 閉環 |
| 架構決策 | 同目錄 `ADR-004-obs-rebuild-operation.md` | obs rebuild 閹割版（結構 only）|
| 架構決策 | 同目錄 `ADR-005-l1-l4-harness-unification.md` | L1-L4 × 三支柱 framework 統一 |
| 架構決策 | 同目錄 `ADR-006-feedback-loop-completeness.md` | feedback loop 缺口 3 項補齊 |
| 盤點 | `docs/state-of-nova.md` | L1-L4 現況 + 元件數字 + 缺口清單 |
| Peer Blueprint | `~/projects/nova-manager/CLAUDE.md` §Related Blueprint | Manager L0 CEO 定位 + 質疑者角色 |

**nb 在此架構中的定位**：
- Layer L1-L4（canonical owner — rules/skills/hooks/agents/commands/scripts 守護者）
- 三支柱歸屬：Sensor（hooks/modules 37 個）+ Guide（rules 29 + skills 35）+ Closed-Loop（reflection-resolver + weekly-synthesis + chain-integrity + session-start-health）
- 四能力閉環中的角色：memory owner（reflections.jsonl + vault/）+ detection infra（chain-integrity + session-start-health）+ fix executor（vault-broken-link-warner 已規劃 Stage 2）+ learn distillation（weekly-synthesis Phase 1 / semantic-distill Stage 4）

下段 `§核心目標` + `§Blueprint` 是 nb 自身 agent identity（core_objective / non_negotiables / tools / pipeline），互補不重複。
```

---

## 為何不合併進 §Blueprint

1. **關注點分離**：§Related Blueprint 指向**全域架構**（讀者需先懂的語境）；§Blueprint 是 **nb 自身 identity**（agent_id / tools / pipeline）
2. **DRY**：若內嵌 ADR 內容進 §Blueprint → 違反 rules/元件/元件治理.md「同一規則不存兩處」
3. **更新獨立性**：全域 ADR 變動時只需改 §Related Blueprint pointer，不動 §Blueprint 的 self-identity

---

## 與 nm §Related Blueprint 對稱性

| 對稱點 | nm §Related Blueprint | nb §Related Blueprint |
|-------|----------------------|----------------------|
| 全域 index 引用 | ✅ 指向 `~/.claude/CLAUDE.md` §Nova Blueprint | ✅ 同 |
| ADR-003/004/005/006 引用 | ✅ 列 4 ADR | ✅ 列 + 新增 ADR-001（nb scope 核心）|
| state-of-nova 引用 | ✅ | ✅ |
| Peer Blueprint 互指 | 指 nb | ✅ 指 nm |
| 自身定位 3 要素 | Layer / 三支柱 / 四能力角色 | ✅ 同結構 |

---

## Commit 順序（Stage 0 完工 dispatch）

同日 3 commit（依 Manager Round 2 共識）：

1. **nm**（由 Manager）commit `~/projects/nova-manager/CLAUDE.md` §Related Blueprint
2. **nb**（由 nb）commit `~/projects/nova-brain/CLAUDE.md` §Related Blueprint（本 draft）
3. **全域**（由 nb）commit `~/.claude/CLAUDE.md` §Nova Blueprint 補 3 行 pointer：

```markdown
### Related Blueprint
- `~/projects/nova-manager/CLAUDE.md` §Related Blueprint（Manager scope self-description）
- `~/projects/nova-brain/CLAUDE.md` §Related Blueprint（nb scope self-description）
- Blueprint 變更須 cross-dispatch 其他兩方 ack 後才 commit
```

3 commit message 相互引用 commit hash 形成雙向 trace。

---

## 風險與 Mitigation

| 風險 | Mitigation |
|------|-----------|
| commit 順序 drift（nm 先 / nb 先 / 全域先 不一致）| 同日同步（同一小時內），3 commit message 互相引用 hash |
| ADR-001 v2 supersede 語義不清（nb 引用 v2 時 canonical 還是 v1）| Stage 0 完工 dispatch 第一步是 canonical commit v2 supersede v1，之後才 commit §Related Blueprint |
| ~/.claude/ branch 策略衝突（feat/obsidian-vault 還是 main）| §Related Blueprint 的 canonical commit **也走 feat/obsidian-vault**（使用者覆蓋式同步策略一致）|

---

## Backlinks

- 全域 Nova Blueprint：`~/.claude/CLAUDE.md` L49
- ADR-001 Revised v2 draft: `~/projects/nova-brain/spec/討論/drafts/ADR-revised-stage-0.md`
- nm §Related Blueprint draft: `~/projects/nova-manager/spec/討論/drafts/nm-CLAUDE.md-related-blueprint-section.md`
- state-of-nova: `docs/state-of-nova.md`
- 討論歷史：xd-t9on（舊）/ Stage 0 inputs ack / vault-layer3 Round 1-7
