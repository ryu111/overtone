# A4 — Hook 系統

> 狀態：✅ 已確認

---

## 18 個 Hook 事件

| # | 事件 | 觸發時機 | 可阻擋？ | Matcher |
|---|------|---------|---------|---------|
| 1 | `SessionStart` | session 開始/恢復 | 否 | `startup`, `resume`, `clear`, `compact` |
| 2 | `InstructionsLoaded` | CLAUDE.md/rules 載入 | 否 | 不支援 |
| 3 | `UserPromptSubmit` | 使用者送出 prompt | 是 | 不支援 |
| 4 | `PreToolUse` | 工具執行前 | 是（allow/deny/ask） | 工具名稱 |
| 5 | `PermissionRequest` | 權限對話框出現 | 是（allow/deny） | 工具名稱 |
| 6 | `PostToolUse` | 工具成功後 | 否（可回饋） | 工具名稱 |
| 7 | `PostToolUseFailure` | 工具失敗後 | 否 | 工具名稱 |
| 8 | `Notification` | 發送通知 | 否 | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| 9 | `SubagentStart` | subagent 啟動 | 否 | agent 名稱 |
| 10 | `SubagentStop` | subagent 完成 | 是 | agent 名稱 |
| 11 | `Stop` | Claude 結束回應 | 是 | 不支援 |
| 12 | `TeammateIdle` | team 成員閒置 | 是 | 不支援 |
| 13 | `TaskCompleted` | 任務完成 | 是 | 不支援 |
| 14 | `ConfigChange` | 設定檔變更 | 是 | `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` |
| 15 | `WorktreeCreate` | worktree 建立 | 是 | 不支援 |
| 16 | `WorktreeRemove` | worktree 移除 | 否 | 不支援 |
| 17 | `PreCompact` | context 壓縮前 | 否 | `manual`, `auto` |
| 18 | `SessionEnd` | session 結束 | 否 | `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |

---

## 4 種 Handler 類型

| 類型 | 說明 | 適用場景 |
|------|------|---------|
| **command** | 執行 shell 命令，stdin→JSON，stdout→結果 | 確定性驗證、狀態記錄 |
| **http** | POST 到 URL，支援 headers + 環境變數插值 | 遠端服務、webhook |
| **prompt** | 單次 LLM 評估，回傳 yes/no | 語意判斷 |
| **agent** | 啟動有工具的 subagent 驗證器 | 複雜驗證 |

### Handler 類型 × 事件支援

| 事件類型 | command | http | prompt | agent |
|---------|---------|------|--------|-------|
| PreToolUse, PostToolUse, PostToolUseFailure | ✅ | ✅ | ✅ | ✅ |
| PermissionRequest, UserPromptSubmit | ✅ | ✅ | ✅ | ✅ |
| Stop, SubagentStop, TaskCompleted | ✅ | ✅ | ✅ | ✅ |
| SessionStart, SessionEnd, ConfigChange | ✅ | ❌ | ❌ | ❌ |
| InstructionsLoaded, Notification, PreCompact | ✅ | ❌ | ❌ | ❌ |
| WorktreeCreate, WorktreeRemove, TeammateIdle | ✅ | ❌ | ❌ | ❌ |

---

## Hook 配置格式

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "type": "command",
        "command": "bun ~/.claude/hooks/scripts/tool/pre-bash-guard.js"
      }
    ],
    "Stop": [
      {
        "type": "prompt",
        "prompt": "Did the assistant complete the user's request?",
        "async": false
      }
    ]
  }
}
```

### 新功能

| 功能 | 說明 |
|------|------|
| `async: true` | command hook 背景執行不阻擋 |
| `once: true` | skill-only，只執行一次就移除 |
| Hooks in frontmatter | Skills/Agents 的 YAML frontmatter 可直接定義 hooks |
| `CLAUDE_ENV_FILE` | SessionStart hooks 可設定環境變數 |
| `updatedMCPToolOutput` | PostToolUse 可替換 MCP 工具輸出 |
| `last_assistant_message` | SubagentStop 直接讀 subagent 最後回應 |

### 重要變更

- `permissionDecision`: `approve/block` → **`allow/deny`**（舊名 deprecated）
- Hook 類型新增 **http**（POST 到 URL）
- `isolation: worktree` 官方支援

---

## Hook Output 雙通道

| 通道 | 對象 | 用途 |
|------|------|------|
| `systemMessage` | UI only | 只顯示給使用者看，model 看不到 |
| `hookSpecificOutput.additionalContext` | Model context | 注入 model context，影響 AI 行為 |
| `decision` + `reason` | 系統 | Stop/SubagentStop 的阻擋控制 |

支援 `hookSpecificOutput` 的事件：SessionStart、UserPromptSubmit、PreToolUse、PermissionRequest、PostToolUse、PostToolUseFailure、SubagentStart

---

## 我們的 13 個 Hook（Overtone）

詳細的 v0.30 變更計劃見 [C2-v030-架構設計](./C2-v030-架構設計.md)。

| # | 事件 | 腳本 | 職責摘要 |
|---|------|------|---------|
| ① | SessionStart | session/on-start.js | banner + init + 自癒 + queue |
| ② | UserPromptSubmit | prompt/on-submit.js | compact recovery + 深度建議 |
| ③ | PreToolUse:Task | tool/pre-task.js | worker 辨識 + context 注入（23K 行） |
| ④ | PreToolUse:Bash | tool/pre-bash-guard.js | 19 條危險命令黑名單 |
| ⑤ | PreToolUse:Write/Edit | tool/pre-edit-guard.js | 元件保護 + MEMORY |
| ⑥ | PostToolUse | tool/post-use.js | 錯誤觀察 + 工具偏好 |
| ⑦ | PostToolUseFailure | tool/post-use-failure.js | failure + instinct |
| ⑧ | SubagentStop | agent/on-stop.js | 結果記錄 + 收斂（22K 行） |
| ⑨ | PreCompact | session/pre-compact.js | 狀態 → recovery.md |
| ⑩ | Stop | session/on-stop.js | 完成檢查 + Loop |
| ⑪ | Notification | notification/on-notification.js | 音效 + TTS |
| ⑫ | TaskCompleted | task/on-task-completed.js | hook:timing emit |
| ⑬ | SessionEnd | session/on-session-end.js | 清理 + 知識畢業 |
