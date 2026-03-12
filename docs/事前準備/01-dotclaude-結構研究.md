# 01 — `.claude/` 完整結構研究

> 狀態：✅ 已確認

## 三層體系

`.claude/` 下的內容分為三層：官方原生、Plugin 擴展、Overtone 自建。

---

## A. 官方原生功能

### 指令系統（4 層優先順序，高→低）

| 層級 | 位置 | 載入時機 | 共用 |
|------|------|---------|------|
| Managed Policy | `/Library/Application Support/ClaudeCode/CLAUDE.md` | 啟動 | IT 管理 |
| Project | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` | 啟動 | ✅ git |
| User | `~/.claude/CLAUDE.md` | 啟動 | ❌ 個人 |
| 子目錄 | `子目錄/CLAUDE.md` | 延遲（讀到該目錄時） | ✅ git |

### 設定系統（5 層優先順序，高→低）

| 層級 | 位置 | 共用 |
|------|------|------|
| Managed Policy | 伺服器/plist/registry/`managed-settings.json` | IT |
| CLI | 命令列參數 | N/A |
| Local | `.claude/settings.local.json` | ❌ gitignored |
| Project | `.claude/settings.json` | ✅ git |
| User | `~/.claude/settings.json` | ❌ 個人 |

> ⚠️ Array 類型設定跨層級**合併**而非替換。

### settings.json 完整欄位分類

**模型與 AI**：
- `model` — 預設模型
- `availableModels` — 限制可選模型
- `modelOverrides` — 映射 model ID
- `alwaysThinkingEnabled` — extended thinking

**權限**：
- `permissions.allow/deny/ask` — 工具權限（glob 語法）
- `permissions.additionalDirectories` — 額外可讀目錄
- `permissions.defaultMode` — 預設權限模式

**沙箱**：
- `sandbox.enabled` — 沙箱開關
- `sandbox.autoAllowBashIfSandboxed` — 沙箱內自動允許 Bash
- `sandbox.filesystem` — 檔案系統讀寫控制
- `sandbox.network` — 網路域名控制

**Hooks**（17 個事件）：
- SessionStart, InstructionsLoaded, UserPromptSubmit
- PreToolUse, PermissionRequest, PostToolUse, PostToolUseFailure
- SubagentStart, SubagentStop, Stop
- TeammateIdle, TaskCompleted, ConfigChange
- WorktreeCreate, WorktreeRemove
- PreCompact, SessionEnd

**Hook Handler 4 種類型**：command, http, prompt, agent

**UI 與顯示**：outputStyle, statusLine, spinnerVerbs, language, showTurnDuration

**Memory**：autoMemoryEnabled, autoMemoryDirectory, claudeMdExcludes

**Plugin**：enabledPlugins, extraKnownMarketplaces

**其他**：cleanupPeriodDays, plansDirectory, fileSuggestion, respectGitignore, autoUpdatesChannel

### 目錄功能對照

| 路徑 | 用途 | 我們有用？ |
|------|------|----------|
| `CLAUDE.md` | 全域指令 | ✅ 76 行 |
| `settings.json` | 全域設定 | ✅ |
| `settings.local.json` | 本地設定 | ❌ |
| **`rules/`** | **條件載入規則** | ❌ 還沒用 |
| `commands/` | 舊格式命令 | ✅ 31 個全 .bak |
| `skills/` | 新格式 skill | ✅ 28 個 |
| `agents/` | subagent 定義 | ✅ 18 個全 .bak |
| `agent-memory/` | subagent 記憶（user） | ✅ |
| `agent-memory-local/` | subagent 記憶（local） | ✅ |
| `projects/<hash>/memory/` | per-project auto memory | ✅ |
| `plans/` | Plan mode 計劃 | ✅ |
| `worktrees/` | Git worktree 位置 | ❌ |

---

## B. Plugin 擴展（8 個啟用）

| Plugin | 來源 | 用途 |
|--------|------|------|
| `agent-sdk-dev` | claude-code-plugins | Agent SDK 開發 |
| `plugin-dev` | claude-code-plugins | Plugin 開發工具 |
| `explanatory-output-style` | claude-code-plugins | 說明風格輸出 |
| `ralph-wiggum` | claude-code-plugins | 角色代理 |
| `claude-mem` | thedotmack | 第三方記憶 |
| `claude-api` | anthropic-agent-skills | Anthropic API Skills |
| `playground` | claude-plugins-official | 互動遊樂場 |
| `Notion` | claude-plugins-official | Notion 整合 |

---

## C. Overtone 自建體系

### 核心程式庫（scripts/lib/ — 52 模組）

**狀態與生命週期**：state.js, timeline.js, session-start-handler.js, session-stop-handler.js, session-end-handler.js, pre-task-handler.js, on-submit-handler.js, pre-compact-handler.js

**Agent 與工作流**：registry.js (SoT), registry-data.json, agent-mapping.js, agent-stop-handler.js, loop.js, project-orchestrator.js, identify-agent.js

**Hook 與防禦**：hook-utils.js, hook-timing.js, post-use-handler.js, post-use-failure-handler.js, session-cleanup.js, session-spawn.js

**配置與驗證**：config-api.js, config-io.js, config-validator.js, dependency-graph.js, specs.js

**技能與評分**：skill-forge.js, skill-scorer.js, score-engine.js, interview.js

**進化**：evolution.js, feature-sync.js, gap-analyzer.js, gap-fixer.js, failure-tracker.js, baseline-tracker.js

### Hook 腳本（13 個）

| 事件 | 路徑 |
|------|------|
| SessionStart | hooks/scripts/session/on-start.js |
| SessionEnd | hooks/scripts/session/on-session-end.js |
| PreCompact | hooks/scripts/session/pre-compact.js |
| UserPromptSubmit | hooks/scripts/prompt/on-submit.js |
| PreToolUse | hooks/scripts/tool/pre-task.js |
| PostToolUse | hooks/scripts/tool/post-use.js |
| PostToolUseFailure | hooks/scripts/tool/post-use-failure.js |
| PreBashGuard | hooks/scripts/tool/pre-bash-guard.js |
| PreEditGuard | hooks/scripts/tool/pre-edit-guard.js |
| SubagentStop | hooks/scripts/agent/on-stop.js |
| TaskCompleted | hooks/scripts/task/on-task-completed.js |
| Notification | hooks/scripts/notification/on-notification.js |

---

## 待釐清

- [ ] `rules/` 如何與 CLAUDE.md 配合最佳？→ 見 [05-rules-系統研究](./05-rules-系統研究.md)
- [ ] v0.30 需要保留哪些 hook？哪些可以刪？→ 見 [07-v030-架構決策](./07-v030-架構決策.md)
