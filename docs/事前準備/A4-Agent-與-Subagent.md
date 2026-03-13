# A6 — Agent 與 Subagent 系統

> 狀態：✅ 已確認

---

## 內建 Subagent

| Agent | Model | 工具 | 用途 |
|-------|-------|------|------|
| **Explore** | Haiku | 唯讀（Glob/Grep/Read） | 搜尋/分析 codebase |
| **Plan** | 繼承 | 唯讀 | plan mode 研究 |
| **General-purpose** | 繼承 | 全部 | 複雜多步驟任務 |
| **Bash** | 繼承 | Terminal only | 獨立 context 執行命令 |
| statusline-setup | Sonnet | Read/Edit | `/statusline` 設定 |
| Claude Code Guide | Haiku | Glob/Grep/Read/Web | Claude Code 功能問答 |

---

## Agent Frontmatter 完整欄位

| 欄位 | 必填 | 說明 |
|------|------|------|
| `name` | 是 | 唯一識別符 |
| `description` | 是 | Claude 判斷何時委派的依據（**關鍵**） |
| `model` | 否 | `sonnet`/`opus`/`haiku`/`inherit`/完整 model ID |
| `tools` | 否 | 可用工具白名單，支援 `Agent(worker, researcher)` 限制可產生的 subagent |
| `disallowedTools` | 否 | 工具黑名單 |
| `skills` | 否 | 啟動時注入的 skill 內容 |
| `maxTurns` | 否 | 最大 agentic turns |
| `permissionMode` | 否 | `default`/`acceptEdits`/`dontAsk`/`bypassPermissions`/`plan` |
| `memory` | 否 | `user`/`project`/`local`（見 [A5](./A5-Memory-系統.md)） |
| `isolation` | 否 | `worktree` — 在獨立 git worktree 中執行 |
| `background` | 否 | `true` — 永遠背景執行 |
| `mcpServers` | 否 | 專屬 MCP server（inline 或 reference） |
| `hooks` | 否 | 生命週期 hooks |

### 定義位置（優先順序）

1. `--agents` CLI flag（JSON，session-only）
2. `.claude/agents/`（project）
3. `~/.claude/agents/`（user）
4. Plugin `agents/` 目錄

---

## Worktree 隔離

```yaml
---
name: executor
isolation: worktree
model: sonnet
skills: [testing, security-kb]
---
```

| 特性 | 說明 |
|------|------|
| 自動建立 | `<repo>/.claude/worktrees/<name>/` |
| Branch | `worktree-<name>` |
| 清理 | 無修改 → 自動移除；有修改 → 提示 |
| CLI 啟動 | `claude --worktree <name>` 或 `claude -w <name>` |
| 省略名稱 | 自動產生隨機名 |

相關 Hooks：`WorktreeCreate`（可替換 git 行為）、`WorktreeRemove`（自訂清理）

---

## Agent Teams（實驗性）

需啟用：`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

| 特性 | 說明 |
|------|------|
| 架構 | Lead + Teammates |
| 通訊 | 共享任務清單 + 郵箱 |
| 顯示 | `in-process`（預設）/ `tmux` / iTerm2 分割 |
| 品質閘道 | `TeammateIdle` + `TaskCompleted` hooks |
| 儲存 | `~/.claude/teams/{name}/config.json` |

---

## 背景 Subagent

- `background: true` 或 `run_in_background` 參數
- `Ctrl+B`：將前景任務移至背景
- Resume：可恢復之前的 subagent 繼續

---

## 我們目前的使用

- 18 個 Agent 已全部 `.bak`（v0.30 重設計）
- v0.30 計劃：3 角色（Planner/Executor/Reviewer）+ Main 動態委派
- 詳見 [C2-v030-架構設計](./C2-v030-架構設計.md)
