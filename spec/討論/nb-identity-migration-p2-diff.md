---
status: diff-preview
dispatch_id: pending (Batch A.P2 sub-task of xd-c1nl migration-prep-round3)
created: 2026-04-18
source_cwd: /Users/sbu/projects/nova-brain
target_cwd: /Users/sbu/projects/nova-manager (以及 ~/.claude/)
round: P2 diff preview (non-binding, Batch D 實作前 reference)
topic: Batch A.P2 身份段 diff — nb CLAUDE.md §Blueprint → obsidian/semantic/agent-identity/nb.md
---

# Batch A.P2 — 身份段 diff Preview

## 當前 nb CLAUDE.md §Blueprint 結構

**位置**：`~/projects/nova-brain/CLAUDE.md` L113-L194（**82 行**）

**sub-section 清單**（YAML frontmatter + commentary）：

| Field | 行數 | 內容摘要 |
|-------|:---:|---------|
| 前導註解 | L113-L118 | v0 純文件化 + protocol reference + non-runtime-enforce 聲明 |
| `agent_id` | L121 | `nova-brain` |
| `version` | L122 | `0` |
| `schema_version` | L123 | `1` |
| `role` | L124 | 全域元件守門人 + 測試基礎設施擁有者 |
| `core_objective` | L125-L128 | L1-L4 Agent Harness 推進（三支柱） |
| `non_negotiables` | L130-L135 | 5 條底線（測試零容忍 / 治本優先 / ~/.claude/ SoT / 閉環必完整 / 全域元件審查） |
| `tools_allowed` | L137-L144 | 7 類允許工具 |
| `tools_denied` | L146-L150 | 4 類禁用 |
| `skills_bundled` | L152-L162 | 10 skills 高頻引用 |
| `pipeline` | L164-L174 | 10 步完整工作流 |
| `inter_agent_protocol` | L176-L179 | 3 欄位 cross-dispatch reference |
| `blueprint_derived_from` | L181-L187 | 6 欄位派生來源 |
| `blueprint_stability_metric` | L189-L192 | 3 欄位穩定性量測 |

**總 82 行**（含 ```yaml``` 框 + 空行）

## 預計 obsidian/semantic/agent-identity/nb.md 結構

**位置**：`~/.claude/obsidian/semantic/agent-identity/nb.md`（migration 後建立）

### 預計結構

```markdown
---
name: nb (nova-brain)
description: 全域元件守門人 + 測試基礎設施擁有者
type: agent-identity
agent_id: nova-brain
version: 0
schema_version: 1
role: 全域元件守門人 + 測試基礎設施擁有者
created: 2026-04-18 (migrated from ~/projects/nova-brain/CLAUDE.md §Blueprint aa74334)
derived_from: spec/討論/nb-to-nova-migration-prep-round3.md Batch D2
---

# nb (nova-brain) Agent Identity

> Session-agent canonical self-description（非 runtime enforce）。
> Runtime SoT: `~/projects/nova-brain/.claude/settings.json`（tools），nb 本檔為 derived view。

## Core Objective

推進 ~/.claude/ 達 L1-L4 Agent Harness 核心 — Guide (rules/skills) + Sensor (hooks) + Closed-Loop (feedback)。

## Non-Negotiables

1. 測試零容忍 — 全域元件改動必先跑測試，失敗不放行
2. 治本優先 — 結構性缺陷 > 末端修補，不接受 workaround
3. ~/.claude/ 唯一 SoT — 禁止 fork、禁止另建全域元件
4. 閉環必完整 — 每個產出必有驗證證據，觀察→驗證→改善
5. 全域元件變更需 Manager 審查

## Tools

### Allowed
（原 L137-L144 清單搬入）

### Denied
（原 L146-L150 清單搬入）

## Skills Bundled

（原 L152-L162 10 skills 搬入，表格化）

| Skill | 用途 |
|-------|------|
| closed-loop | 元件閉環 4 層 checklist |
| component-classification | 三支柱歸屬 |
| ... | ... |

## Pipeline

（原 L164-L174 10 步搬入，保持編號列表）

## Inter-Agent Protocol

Reference: [cross-dispatch-protocol.md](../../docs/protocols/cross-dispatch-protocol.md)
Role: 專業者（非質疑者）
Discussion persistence: `~/projects/nova-brain/spec/討論/<topic>.md`

## Blueprint Derivation

（原 L181-L187 搬入）

## Stability Metric

（原 L189-L192 搬入）

## Backlinks

- [Peer: nm (nova-manager)](./nm.md) (future, Round 4+)
- [Parent: nova-blueprint.md](../nova-blueprint.md)
- [Migration spec: nb-to-nova-migration-prep-round3.md](<!-- nb repo path --> /Users/sbu/projects/nova-brain/spec/討論/nb-to-nova-migration-prep-round3.md)
```

**預計行數**：95-105 行（加 frontmatter / section headers / backlinks / 表格化 skills）

## Diff Summary

### Before

- `~/projects/nova-brain/CLAUDE.md` 194 行
  - §Blueprint 82 行（L113-L194）= 全 identity 資訊 + derived view + metric

### After (Batch D 執行後)

- `~/projects/nova-brain/CLAUDE.md` 預計 **~130 行**（194 - 82 + 18 用於新 md-link section）
  - §Blueprint 簡化成 1 行 md-link：
    ```markdown
    ## Agent Identity
    nb identity 見 [~/.claude/obsidian/semantic/agent-identity/nb.md](<absolute path>) (migration 完成於 Batch D2)
    ```
- `~/.claude/obsidian/semantic/agent-identity/nb.md` 新建 **~100 行**（含 frontmatter + 表格化 + backlinks）

### 淨行數變化

- nb CLAUDE.md: **194 → ~130** (減 64，符合 aa74334 精神「CLAUDE.md 不是記錄檔」)
- nova (新檔): +100（加 repo）
- Total: +36 行（但語意集中到正確位置）

## 驗收條件（Batch D 實作後）

1. `architecture.test.js` 加守護：
   - nb CLAUDE.md 無 `## Blueprint` header（外移完）
   - nb CLAUDE.md 含 md-link 指向 `agent-identity/nb.md`
   - `~/.claude/obsidian/semantic/agent-identity/nb.md` 存在
2. 本 spec P2 diff 與實際 Batch D2 產出偏差 < 10 行（容忍 re-formatting）
3. hub cascade SSoT 自動守護（pre-commit hook）

## 未決問題（Batch D 前需 Manager ack）

1. `derived view` 行為：nb CLAUDE.md 保留 1 行 md-link 還是不保留任何 identity trace？
2. `obsidian/semantic/agent-identity/nm.md`（Manager）是否同步建？（current Manager CLAUDE.md 有類似結構）
3. backlinks 的 migration spec pointer 是用 absolute path 還是 repo-relative？

## Referenced

- `spec/討論/nb-to-nova-migration-prep-round3.md` Batch D 遷移計畫（本 diff 是 Batch A.P2 preview，實作在 Batch D2）
- commit aa74334（Stage 1.0-H nova CLAUDE.md 瘦身，本 migration 同精神）
- rules/核心/任務生命週期.md (b8ac989)（本 session Iter 6 治本範例）

## 討論持久化

P2 diff preview 起草 2026-04-18T13:40Z（nb Iter 9）。非 binding — Batch D 前 Manager Round 4 ack Batch A.P2 後，此 diff 作為 implementation reference。
