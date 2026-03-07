# Hooks API 完整參考

> Claude Code Plugin hooks 平台 + Overtone 特有限制

---

## 1. Hook 事件總覽（11 個）

| 事件 | 觸發時機 | Overtone 用途 |
|------|----------|--------------|
| SessionStart | session 啟動 | Banner + 初始化 + Dashboard spawn |
| SessionEnd | session 結束 | 結尾收尾 + 狀態清理 |
| PreCompact | context 壓縮前 | 注入工作流狀態恢復訊息 |
| UserPromptSubmit | 使用者提交 prompt | systemMessage → /ot:auto |
| PreToolUse | 工具呼叫前 | subagent 映射 + 阻擋 + updatedInput 注入 |
| PostToolUse | 工具呼叫後 | Instinct 觀察收集 + 措詞偵測 |
| PostToolUseFailure | 工具呼叫失敗 | 失敗事件處理 |
| SubagentStop | subagent 停止 | 記錄結果 + 寫 state + emit timeline |
| TaskCompleted | Task 完成 | Task 完成事件 + hook:timing |
| Stop | 主 agent 停止 | Loop 迴圈 + 完成度 + Dashboard 通知 |
| Notification | 通知事件 | 音效通知（AskUserQuestion → Glass 提示音）|

---

## 2. hooks.json 三層嵌套格式（Overtone 必要）

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "optional-tool-name",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/scripts/your-hook.js"
          }
        ]
      }
    ]
  }
}
```

**⛔ 錯誤格式（扁平陣列）**：
```json
{ "hooks": [{ "event": "SessionStart", "type": "command", "command": "..." }] }
```
扁平陣列格式無法被 Claude Code 正確觸發，Guard test 自動驗證。

---

## 3. Hook Input Format

Hook script 從 **stdin** 讀取 JSON，共用欄位：

```json
{
  "session_id": "abc123",
  "hook_event_name": "PreToolUse",
  "tool_name": "Task",
  "tool_input": { ... }
}
```

PreToolUse 專用欄位：`tool_name`、`tool_input`（完整工具參數）
SubagentStop 專用欄位：`stop_hook_active`、`subagent_id`

讀取範例（Node.js）：
```javascript
let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  const input = JSON.parse(raw);
  // 處理邏輯
});
```

---

## 4. Hook Output Format

### PreToolUse — 可阻擋或修改工具輸入

```json
{
  "continue": true,
  "updatedInput": { "...": "完整替換 tool_input" }
}
```

**⚠️ updatedInput 是 REPLACE（完全替換），不是 MERGE**：
```javascript
// 正確：保留所有欄位
const updatedInput = { ...toolInput, prompt: newPrompt };
// 錯誤：只傳 prompt 會丟失其他欄位
const updatedInput = { prompt: newPrompt };
```

阻擋操作：`{ "continue": false }` 或輸出到 stderr（exit 1+）

### Stop / SubagentStop — 可輸出 systemMessage

```json
{ "systemMessage": "注入到下一個 context 的文字" }
```

**⚠️ SubagentStop 無 systemMessage 支援** — 平台不注入，此 hook 只做副作用（寫 state、emit timeline）。

### 通用成功輸出：`{}`（空 JSON）或 exit 0

---

## 5. Exit Codes

| Code | 意義 |
|------|------|
| 0 | 正常繼續（不阻擋） |
| 1+ | 阻擋操作（stderr 內容作為阻擋訊息顯示給使用者） |
| 2 | Claude Code 特殊：視為「不阻擋但有警告」（部分版本） |

---

## 6. Overtone 特有限制

### 元件保護（pre-edit guard）
以下檔案被 PreToolUse(Write/Edit) 守衛保護，**禁止直接編輯**：
- `agents/*.md`
- `hooks/hooks.json`
- `skills/*/SKILL.md`
- `registry-data.json`
- `plugin.json`

正確修改路徑：
```bash
bun scripts/manage-component.js update agent developer '{"model":"opus"}'
bun scripts/manage-component.js update skill my-skill '{"description":"新描述"}'
```

### hooks.json 必須使用三層嵌套格式
見第 2 節。違反會導致 hook 無法觸發。

---

## 7. 實用 stdin 讀取範例

```javascript
// Bun 環境讀取 stdin
const raw = await Bun.stdin.text();
const input = JSON.parse(raw);

// 輸出到 stdout（PreToolUse updatedInput）
process.stdout.write(JSON.stringify({ continue: true, updatedInput: { ...input.tool_input, prompt: newPrompt } }));

// 阻擋操作（輸出 stderr）
process.stderr.write('❌ 禁止此操作：原因說明');
process.exit(1);
```
