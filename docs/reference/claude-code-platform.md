# Claude Code 平台能力完整參考

> 最後更新：2026-02-28 | 基於 Claude Code 官方文件

本文件統整 Claude Code 平台提供的**所有** plugin 開發能力，並標注 Overtone 的使用狀態。

**圖例**：✅ 已使用 | ⚡ 高價值未用 | ⬜ 未使用 | ❌ 不適用

---

## 一、Hook Events（17 個）

Overtone 使用 7/17 個。

### 事件總表

| # | Event | 觸發時機 | 可阻擋 | Matcher | Overtone |
|---|-------|---------|:------:|---------|:--------:|
| 1 | `SessionStart` | session 開始/恢復 | ❌ | startup/resume/clear/compact | ✅ on-start.js |
| 2 | `UserPromptSubmit` | 使用者送出 prompt | ✅ | ❌ | ✅ on-submit.js |
| 3 | `PreToolUse` | tool 執行前 | ✅ | tool name | ✅ pre-task.js (Task) |
| 4 | `PermissionRequest` | 權限對話框顯示 | ✅ | tool name | ⬜ |
| 5 | `PostToolUse` | tool 成功完成後 | ❌ | tool name | ✅ post-use.js |
| 6 | `PostToolUseFailure` | tool 失敗後 | ❌ | tool name | ⬜ |
| 7 | `Notification` | 通知發送 | ❌ | notification type | ⬜ |
| 8 | `SubagentStart` | subagent 生成 | ❌ | agent type | ⬜ |
| 9 | `SubagentStop` | subagent 完成 | ✅ | agent type | ✅ on-stop.js |
| 10 | `Stop` | Claude 完成回應 | ✅ | ❌ | ✅ on-stop.js |
| 11 | `TeammateIdle` | team member 將閒置 | ✅ | ❌ | ⬜ |
| 12 | `TaskCompleted` | Task 被標記完成 | ✅ | ❌ | ⬜ |
| 13 | `ConfigChange` | 配置文件變更 | ✅ | config source | ⬜ |
| 14 | `WorktreeCreate` | worktree 建立 | ✅ | ❌ | ⬜ |
| 15 | `WorktreeRemove` | worktree 移除 | ❌ | ❌ | ⬜ |
| 16 | `PreCompact` | context 壓縮前 | ❌ | manual/auto | ✅ pre-compact.js |
| 17 | `SessionEnd` | session 終止 | ❌ | reason | ⚡ |

### Hook Handler 類型（4 種）

| 類型 | 說明 | Overtone |
|------|------|:--------:|
| `command` | 執行 shell 命令 | ✅ 全部 7 個 |
| `http` | POST 到遠端端點 | ⬜ |
| `prompt` | LLM 單輪評估（`ok: true/false`） | ⬜ |
| `agent` | 完整 agentic 驗證（有工具存取） | ⬜ |

### hooks.json 結構

```json
{
  "hooks": {
    "EVENT_NAME": [
      {
        "matcher": "regex_pattern",
        "hooks": [
          {
            "type": "command|http|prompt|agent",
            "command": "/path/to/script",
            "timeout": 600,
            "statusMessage": "自訂訊息"
          }
        ]
      }
    ]
  }
}
```

### Hook 通用 stdin 欄位

每個 event 都包含：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `session_id` | string | session ID |
| `transcript_path` | string | 對話 JSONL 路徑 |
| `cwd` | string | 工作目錄 |
| `permission_mode` | string | 權限模式 |
| `hook_event_name` | string | event 名稱 |

### Hook 通用 stdout 欄位

| 欄位 | 說明 |
|------|------|
| `continue` | false → 停止整個 Claude 執行 |
| `stopReason` | continue:false 時顯示的訊息 |
| `suppressOutput` | true → 隱藏 hook stdout |
| `systemMessage` | 顯示給使用者的警告 |
| `hookSpecificOutput` | event 專用欄位（見各 event） |

### 決策控制模式（3 種）

**模式 1：Top-level decision**（UserPromptSubmit, PostToolUse, Stop, SubagentStop, ConfigChange）
```json
{ "decision": "block", "reason": "說明" }
```

**模式 2：hookSpecificOutput.permissionDecision**（PreToolUse）
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask",
    "permissionDecisionReason": "說明",
    "updatedInput": { "field": "新值" },
    "additionalContext": "注入 context"
  }
}
```

**模式 3：hookSpecificOutput.decision**（PermissionRequest）
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow|deny",
      "updatedInput": {},
      "updatedPermissions": {},
      "message": "拒絕原因",
      "interrupt": false
    }
  }
}
```

### Exit Code 行為

| Code | 說明 |
|:----:|------|
| 0 | 成功，解析 stdout JSON |
| 2 | 阻擋（支援阻擋的 event）/ 錯誤（不支援的 event），stderr 傳回 |
| 其他 | 非阻擋錯誤，stderr 在 verbose 模式顯示 |

### 各 Event 詳細 stdin/stdout

#### SessionStart
```
stdin: { source: "startup|resume|clear|compact", model: "...", agent_type: "..." }
stdout: { hookSpecificOutput: { additionalContext: "..." } }
特殊: CLAUDE_ENV_FILE 環境變數持久化
```

#### UserPromptSubmit
```
stdin: { prompt: "使用者輸入" }
stdout: { decision: "block", reason: "...", hookSpecificOutput: { additionalContext: "..." } }
exit 2: 阻止 prompt 處理
```

#### PreToolUse
```
stdin: { tool_name: "Bash", tool_input: { command: "npm test", ... }, tool_use_id: "..." }
stdout: { hookSpecificOutput: { permissionDecision: "allow|deny|ask", updatedInput: {...} } }
exit 2: 阻止 tool 執行
```

**⚡ updatedInput**：可修改 tool 參數！例如在 Task prompt 中自動注入 workflow context。

#### PermissionRequest
```
stdin: { tool_name: "Bash", tool_input: {...}, permission_suggestions: [...] }
stdout: { hookSpecificOutput: { decision: { behavior: "allow|deny", updatedInput: {...} } } }
exit 2: 拒絕權限
```

#### PostToolUse
```
stdin: { tool_name: "Write", tool_input: {...}, tool_response: {...}, tool_use_id: "..." }
stdout: { decision: "block", reason: "...", hookSpecificOutput: { updatedMCPToolOutput: "..." } }
```

#### PostToolUseFailure
```
stdin: { tool_name: "Bash", tool_input: {...}, error: "...", is_interrupt: false }
stdout: { hookSpecificOutput: { additionalContext: "..." } }
```

#### SubagentStart
```
stdin: { agent_id: "...", agent_type: "Explore" }
stdout: { hookSpecificOutput: { additionalContext: "注入到 subagent" } }
```

#### SubagentStop
```
stdin: { agent_type: "Explore", last_message: "結果..." }
stdout: { decision: "block", reason: "...", hookSpecificOutput: { continue: false, instruction: "..." } }
exit 2: 阻止 stop，agent 繼續
```

#### Stop
```
stdin: { stop_hook_active: false, last_assistant_message: "..." }
stdout: { decision: "block", hookSpecificOutput: { continue: false, instruction: "..." } }
exit 2: 阻止 stop，Claude 繼續
⚠️ 檢查 stop_hook_active 防止無限 loop
```

#### TeammateIdle（Agent Teams）
```
stdin: { teammate_name: "...", team_name: "..." }
exit 2: 阻止閒置，stderr 傳給 teammate
```

#### TaskCompleted
```
stdin: { task_id: "...", task_subject: "...", task_description: "...", teammate_name: "..." }
exit 2: 阻止完成，stderr 回饋
```

#### ConfigChange
```
stdin: { source: "user_settings|project_settings|local_settings|policy_settings|skills", file_path: "..." }
stdout: { decision: "block", reason: "..." }
```

#### WorktreeCreate
```
stdin: { name: "bold-oak-a3f2" }
stdout: 印出建立的絕對路徑（非 JSON）
exit 非 0: 建立失敗
```

#### WorktreeRemove
```
stdin: { worktree_path: "/absolute/path" }
（無決策控制，僅用於清理）
```

#### PreCompact
```
stdin: { trigger: "manual|auto", custom_instructions: "..." }
stdout: { hookSpecificOutput: { additionalContext: "..." } }
```

#### SessionEnd
```
stdin: { reason: "clear|logout|prompt_input_exit|bypass_permissions_disabled|other" }
（無決策控制，僅用於清理）
```

---

## 二、Agent 定義欄位

### Frontmatter 完整欄位

| 欄位 | 型別 | 必填 | 預設值 | 說明 | Overtone |
|------|------|:----:|--------|------|:--------:|
| `name` | string | ✅ | — | 唯一識別符（kebab-case） | ✅ |
| `description` | string | ✅ | — | 觸發條件描述 | ✅ |
| `model` | string | | inherit | `opus`/`sonnet`/`haiku`/`inherit` | ✅ |
| `tools` | array | | 繼承全部 | 工具白名單 | ✅ 部分 |
| `disallowedTools` | array | | 無 | 工具黑名單 | ⬜ |
| `permissionMode` | string | | default | 權限模式 | ✅ bypassPermissions |
| `color` | string | | 無 | UI 顏色 | ✅ |
| `maxTurns` | number | | 無限 | 最大回合數 | ✅ |
| `skills` | array | | 無 | 預載入的 skill 名稱 | ⚡ |
| `mcpServers` | array/obj | | 繼承 | 專屬 MCP 伺服器 | ⬜ |
| `memory` | string | | 無 | 跨 session 記憶（`user`/`project`/`local`） | ⚡ |
| `background` | boolean | | false | 預設背景執行 | ⬜ |
| `isolation` | string | | 無 | 隔離模式（`worktree`） | ⚡ |
| `hooks` | object | | 無 | agent 專屬 hooks | ⬜ |

### Memory 儲存位置

| Scope | 路徑 | 跨 session | 共享 |
|:-----:|------|:----------:|:----:|
| `user` | `~/.claude/agent-memory/{name}/` | ✅ | ❌ 個人 |
| `project` | `.claude/agent-memory/{name}/` | ✅ | ✅ git |
| `local` | `.claude/agent-memory-local/{name}/` | ✅ | ❌ gitignored |

啟用 memory 後 agent 自動可讀寫記憶目錄，`MEMORY.md` 前 200 行自動載入。

### Permission Modes

| Mode | 行為 | 安全性 |
|:----:|------|:------:|
| `default` | 標準權限檢查 | 中 |
| `acceptEdits` | 自動接受檔案編輯 | 中 |
| `dontAsk` | 自動拒絕權限提示 | 高 |
| `bypassPermissions` | 跳過所有權限 | 低 |
| `plan` | 唯讀模式 | 最高 |

### 可用顏色

blue / red / green / yellow / purple / pink / cyan / emerald / orange

### 可用工具

| 工具 | 功能 | 唯讀 |
|------|------|:----:|
| `Read` | 讀檔案 | ✅ |
| `Write` | 建立檔案 | ❌ |
| `Edit` | 修改檔案 | ❌ |
| `Bash` | 執行命令 | ❌ |
| `Glob` | 搜尋檔名 | ✅ |
| `Grep` | 搜尋內容 | ✅ |
| `Task` | 委派 subagent | ❌ |
| `Task(agent1, agent2)` | 限制可委派的 agent | ❌ |
| `AskUserQuestion` | 向使用者提問 | ✅ |
| `WebFetch` | 取得網頁 | ✅ |
| `WebSearch` | 搜尋網頁 | ✅ |
| `NotebookEdit` | 編輯 Jupyter | ❌ |
| `mcp__server__tool` | MCP 工具 | 視工具 |

### Agent 在 Plugin 中註冊

```json
// plugin.json
{
  "agents": [
    "./agents/developer.md",
    "./agents/reviewer.md"
  ]
}
// 或目錄自動探測
{
  "agents": "./agents/"
}
```

### CLI 動態定義 Agent

```bash
claude --agents '{
  "reviewer": {
    "description": "Code reviewer",
    "prompt": "You are...",
    "tools": ["Read", "Grep"],
    "model": "opus",
    "maxTurns": 25,
    "memory": "user"
  }
}'
```

---

## 三、Skill 定義欄位

### Frontmatter 完整欄位

| 欄位 | 型別 | 必填 | 預設值 | 說明 | Overtone |
|------|------|:----:|--------|------|:--------:|
| `name` | string | | 目錄名 | 顯示名稱（kebab-case） | ✅ |
| `description` | string | 建議 | 首段 | 觸發條件描述 | ✅ |
| `disable-model-invocation` | boolean | | false | 禁止 Claude 自動觸發 | ✅ |
| `user-invocable` | boolean | | true | 是否出現在 `/` 選單 | ⬜ |
| `argument-hint` | string | | 無 | 自動補全提示 | ⬜ |
| `allowed-tools` | string | | 全部 | 逗號分隔的工具白名單 | ⬜ |
| `model` | string | | 使用者預設 | 模型覆蓋 | ⬜ |
| `context` | string | | inline | `fork` = 隔離 subagent 執行 | ⚡ |
| `agent` | string | | general-purpose | 搭配 `context: fork` | ⬜ |
| `hooks` | object | | 無 | skill 專屬 hooks | ⬜ |

### 動態功能

**字串替換**：
| 變數 | 說明 |
|------|------|
| `$ARGUMENTS` | 使用者傳入的參數 |
| `$0`, `$1`, `$ARGUMENTS[N]` | 按索引存取參數 |
| `${CLAUDE_SESSION_ID}` | session ID |
| `${CLAUDE_PLUGIN_ROOT}` | plugin 絕對路徑 |

**動態命令注入** ⚡：
```markdown
!`gh pr diff $0`
```
在 skill 被呼叫時**立即執行**，輸出取代 placeholder。Claude 只看到執行結果。

### Skill 位置與優先順序

| 位置 | 路徑 | 優先 |
|------|------|:----:|
| Enterprise | managed settings | 1 最高 |
| Personal | `~/.claude/skills/` | 2 |
| Project | `.claude/skills/` | 3 |
| Plugin | `plugin/skills/` | 4 |

---

## 四、Plugin Manifest（plugin.json）

### 完整欄位

| 欄位 | 型別 | 必填 | 說明 | Overtone |
|------|------|:----:|------|:--------:|
| `name` | string | ✅ | plugin 名稱（kebab-case） | ✅ |
| `version` | string | | 語意版本號 | ✅ |
| `description` | string | | 簡述 | ✅ |
| `author` | object | | { name, email, url } | ⬜ |
| `homepage` | string | | 文件 URL | ⬜ |
| `repository` | string | | 原始碼 URL | ⬜ |
| `license` | string | | 授權 | ⬜ |
| `keywords` | array | | 探索標籤 | ⬜ |
| `commands` | string/array | | 額外 command 路徑 | ⬜ |
| `agents` | string/array | | agent 路徑 | ✅ |
| `skills` | string/array | | skill 路徑 | ✅ |
| `hooks` | string/object | | hook 設定 | ⬜（獨立 hooks.json） |
| `mcpServers` | string/object | | MCP 設定 | ⬜ |
| `outputStyles` | string/array | | 輸出樣式 | ⬜ |
| `lspServers` | string/object | | LSP 設定 | ⬜ |

### 路徑規則
- 所有路徑**相對於 plugin 根目錄**，必須以 `./` 開頭
- 自訂路徑**補充**預設目錄，不覆蓋
- 不能引用 plugin 目錄外的檔案（安全限制）
- Symlink 可用

---

## 五、Model 能力

### 可用模型

| Model | ID | Context | Max Output | Thinking | 定位 |
|-------|-----|:-------:|:----------:|:--------:|------|
| **Opus 4.6** | `claude-opus-4-6` | 200K（1M beta） | 128K | Adaptive | 最強推理、策略決策 |
| **Sonnet 4.6** | `claude-sonnet-4-6` | 200K（1M beta） | 64K | Adaptive | 平衡效能、日常開發 |
| **Haiku 4.5** | `claude-haiku-4-5-20251001` | 200K | 64K | ❌ | 快速、低成本 |

### Model 別名（Claude Code 使用）

| 別名 | 對應 | 說明 |
|------|------|------|
| `opus` | claude-opus-4-6 | Agent frontmatter `model: opus` |
| `sonnet` | claude-sonnet-4-6 | Agent frontmatter `model: sonnet` |
| `haiku` | claude-haiku-4-5-20251001 | Agent frontmatter `model: haiku` |
| `inherit` | 繼承父層 | Agent 預設值 |
| `sonnet[1m]` | claude-sonnet-4-6（1M context） | Beta 1M context window |
| `opusplan` | Opus + Sonnet 混合 | Opus 做規劃、Sonnet 做執行 |

### Adaptive Thinking（Claude 4.6 新能力）

Opus 4.6 和 Sonnet 4.6 支援自適應思考 — Claude 自動決定思考深度。

| 模式 | 設定 | 說明 |
|------|------|------|
| **Adaptive**（預設） | `type: "adaptive"` | Claude 自動判斷思考深度 |
| **Manual** | `type: "enabled", budget_tokens: N` | 手動指定 token 預算 |
| **Disabled** | `type: "disabled"` | 關閉（不建議） |

**Effort Level**（控制 Adaptive Thinking 深度）：

| Level | 場景 | 行為 |
|-------|------|------|
| `low` | 簡單查詢、trivial 修改 | 最少思考 |
| `medium` | 一般開發任務 | 適度思考 |
| `high` | 複雜邏輯、架構決策 | 深度思考（預設） |
| `max` | 困難問題、數學推理 | 最大思考預算 |

### Fast Mode

- 相同 Opus 4.6 模型，2.5x 更快輸出，6x 成本
- 使用 `/fast` 切換開關
- 不是切換到較弱模型，而是同模型的加速推理

### opusplan 混合模式

```
Opus（規劃 + 決策）→ Sonnet（執行 + 實作）
```

- 策略層用 Opus 推理，實作層用 Sonnet 效率
- 適合大型多步驟任務

### Model 定價（per MTok）

| Model | Input | Output | Cache Write | Cache Read |
|-------|------:|-------:|------------:|-----------:|
| Opus 4.6 | $15 | $75 | $18.75 | $1.50 |
| Sonnet 4.6 | $3 | $15 | $3.75 | $0.30 |
| Haiku 4.5 | $0.80 | $4 | $1 | $0.08 |

### Model 相關環境變數

| 變數 | 說明 |
|------|------|
| `CLAUDE_CODE_EFFORT_LEVEL` | Adaptive Thinking effort（low/medium/high/max） |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 覆蓋所有 subagent 的模型 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | 覆蓋 Opus 的具體 model ID |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | 覆蓋 Sonnet 的具體 model ID |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 覆蓋 Haiku 的具體 model ID |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` | 關閉 Adaptive Thinking |
| `MAX_THINKING_TOKENS` | 限制 thinking token 上限 |
| `DISABLE_PROMPT_CACHING` | 禁用 prompt 快取 |

### Overtone 的 Model 策略

| 角色 | Model | 理由 |
|------|:-----:|------|
| product-manager, planner, architect | `opus` | 策略推理、架構決策 |
| code-reviewer, security-reviewer, retrospective | `opus` | 高信心判斷 |
| developer, designer, tester, qa, debugger | `sonnet` | 實作效率 |
| database-reviewer, e2e-runner, build-error-resolver, refactor-cleaner | `sonnet` | 專項執行 |
| doc-updater, grader | `haiku` | 低成本機械任務 |

---

## 六、平台功能

### CLAUDE.md 記憶階層

| 優先順序 | 位置 | 說明 |
|:--------:|------|------|
| 1 最高 | Managed policy | 組織層級 |
| 2 | `./CLAUDE.local.md` | 專案本地（gitignored） |
| 3 | `./CLAUDE.md` | 專案共享 |
| 4 | `.claude/rules/*.md` | 模組化規則（支援 path glob） |
| 5 | `~/.claude/CLAUDE.md` | 使用者全域 |
| 6 | `~/.claude/rules/*.md` | 使用者模組化規則 |

**Rules 支援路徑條件**：
```yaml
---
paths:
  - "src/**/*.ts"
  - "tests/**/*.test.ts"
---
```

**Import 語法**：`@path/to/file.md`

### Worktree 隔離

```bash
claude --worktree feature-auth    # 建立 .claude/worktrees/feature-auth/
claude -w                         # 自動命名
```

Agent 也可以：
```yaml
isolation: worktree   # 每個 subagent 獨立 worktree
```

### Background 背景執行

```yaml
background: true   # agent frontmatter
```
- 背景執行不阻塞主對話
- 權限需提前批准
- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` 禁用

### Agent Teams（實驗性）

```bash
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```
- 各 teammate 獨立 context window
- 共享 TaskList 自協調
- 成本較高（每人 = 獨立 Claude 實例）

### 環境變數

| 變數 | 說明 |
|------|------|
| `CLAUDE_SESSION_ID` | session ID |
| `CLAUDE_PLUGIN_ROOT` | plugin 絕對路徑 |
| `CLAUDE_PROJECT_ROOT` | 專案根目錄 |
| `CLAUDE_ENV_FILE` | 環境變數持久化檔案（SessionStart 寫入） |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | 禁用自動記憶 |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | 禁用背景任務 |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | 自訂 compact 觸發百分比 |
| `MAX_THINKING_TOKENS` | 限制 thinking token |

### Status Line

```json
// settings.json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 2
  }
}
```

stdin 提供完整 session 狀態（model、cost、context window、vim mode 等）。

---

## 七、Overtone Gap 分析

### ⚡ 高價值未用能力

| # | 能力 | 說明 | 預估影響 |
|---|------|------|---------|
| 1 | **Agent `memory`** | 跨 session 知識累積。developer 記住 coding style，reviewer 記住 anti-patterns | 可部分取代 Instinct |
| 2 | **Agent `skills` 預載** | 把 handoff-protocol、bdd-spec-guide 等 reference 直接預載入 agent | 減少 agent 自行讀取的 turns |
| 3 | **Agent `isolation: worktree`** | mul-dev 並行的技術前提，消除 git 衝突 | Phase 3 並行 dev |
| 4 | **Skill `context: fork`** | 大型 skill 在隔離 context 執行 | 降低主 context 污染 |
| 5 | **Skill 動態注入 `!`command``** | auto/SKILL.md 動態注入 workflow state | 減少 on-submit hook 負擔 |
| 6 | **`SessionEnd` hook** | session 結束清理、Dashboard 通知、記憶持久化 | 補完三點記憶架構 |
| 7 | **`TaskCompleted` hook** | Task 完成前做品質門檻檢查 | 強化品質守衛 |
| 8 | **PreToolUse `updatedInput`** | 修改 Task prompt，自動注入 workflow context | 減少 Main Agent 手動注入 |
| 9 | **`prompt`/`agent` hook 類型** | LLM 驗證 + agentic 檢查 | 更靈活的品質門檻 |
| 10 | **Agent `disallowedTools`** | 黑名單比白名單更靈活 | 簡化 agent 工具設定 |
| 11 | **`opusplan` 混合模式** | Opus 規劃 + Sonnet 執行，降低成本同時保持品質 | 降低 pipeline 成本 |
| 12 | **`CLAUDE_CODE_EFFORT_LEVEL`** | 按任務複雜度動態調節 thinking 深度 | 優化速度/成本 |
| 13 | **`sonnet[1m]` 1M context** | 超大 context window，適合大型 codebase 分析 | 深度分析場景 |

### ❌ 不適用 / 低價值

| 能力 | 理由 |
|------|------|
| `PermissionRequest` hook | bypassPermissions 下不觸發 |
| `outputStyles` | Dashboard 已有自訂介面 |
| `lspServers` | Overtone 是 JS 單語言 |
| Agent Teams | 實驗性，與現有 Task 委派衝突 |
| `ConfigChange` hook | 配置不常變動 |
| `http` hook type | 無遠端端點需求 |

---

## 八、建議行動優先順序

### Phase 2 可順手驗證（低成本）

1. **Agent `skills` 預載** — 在 developer.md 加 `skills: [handoff-protocol]` 驗證效果
2. **Agent `disallowedTools`** — 替代現有 `tools` 白名單，更簡潔
3. **SessionEnd hook** — 空 hook 測試穩定性
4. **Skill 動態注入** — 在測試 skill 中試 `!`node script.js``

### Phase 2 可順手驗證（Model 相關）

5. **`CLAUDE_CODE_EFFORT_LEVEL`** — 為不同 agent 設定不同 effort（haiku agent 用 low，opus agent 用 high）
6. **`opusplan` 模式** — 測試是否適合替代 standard workflow 的 PLAN(opus)+DEV(sonnet) 模式

### Phase 3 可評估（需設計）

7. **Agent `memory`** — 評估是否取代/補充 Instinct
8. **Agent `isolation: worktree`** — mul-dev 並行前提
9. **`TaskCompleted` hook** — 品質門檻自動化
10. **PreToolUse `updatedInput`** — 自動注入 workflow context
11. **`sonnet[1m]` 1M context** — 大型 codebase 全面分析場景
