---
name: workflow-core
description: 工作流核心知識。失敗處理、並行規則、Handoff 協議、完成信號。供 workflow skill 引用。
disable-model-invocation: true
user-invocable: false
---

# Workflow Core 知識領域

工作流執行所需的核心知識集中索引。各 workflow skill（auto、standard、quick 等）按需讀取對應的 reference。

## 消費者

此 skill 不被任何 agent 的 `skills` 欄位直接引用，而是透過各 workflow skill 的 💡 引用，供 Main Agent 按需讀取。

| 引用者 | 用途 |
|--------|------|
| auto/SKILL.md | 讀取全部 4 個 reference |
| standard/SKILL.md | 讀取 failure-handling.md |
| quick/SKILL.md | 讀取 failure-handling.md |
| full/SKILL.md | 讀取 failure-handling.md |
| secure/SKILL.md | 讀取 failure-handling.md |
| debug/SKILL.md | 讀取 failure-handling.md |
| tdd/SKILL.md | 讀取 failure-handling.md |
| refactor/SKILL.md | 讀取 failure-handling.md |

## Reference 索引

| # | 檔案 | 用途 | 引用者 |
|---|------|------|--------|
| 1 | references/failure-handling.md | 失敗重試流程（TEST FAIL/REVIEW REJECT 迴圈） | auto + 7 個 workflow skill |
| 2 | references/parallel-groups.md | 並行 stage 群組定義 | auto |
| 3 | references/handoff-protocol.md | Handoff 檔案格式 | auto |
| 4 | references/completion-signals.md | 各 workflow 完成信號定義 | auto |

## 按需讀取

💡 失敗處理流程：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/workflow-core/references/failure-handling.md`

💡 並行群組規則：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/workflow-core/references/parallel-groups.md`

💡 Handoff 交接協定：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/workflow-core/references/handoff-protocol.md`

💡 完成信號定義：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/workflow-core/references/completion-signals.md`
