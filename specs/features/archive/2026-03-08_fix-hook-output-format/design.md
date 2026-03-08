---
feature: fix-hook-output-format
status: in-progress
created: 2026-03-08
---

# Design: fix-hook-output-format

## 問題背景

Claude Code Hook 有兩個關鍵 output 欄位：

- `systemMessage`：只給使用者看（UI 顯示），**model 完全看不到**
- `hookSpecificOutput.additionalContext`：**注入 model context**，model 看得到

所有 hook handler 都用 `systemMessage` 注入指令，但 model 從來收不到。
唯一正確實作：`on-submit-handler.js`（已加 `hookSpecificOutput.additionalContext`）。

## hookSpecificOutput 格式（官方規範）

```typescript
interface HookOutput {
  result?: string;           // 補充資訊（各事件語意不同）
  systemMessage?: string;    // 只給使用者看，model 看不到
  hookSpecificOutput?: {
    hookEventName: string;   // 事件名稱，必須精確匹配
    additionalContext?: string; // 注入 model context
    // PreToolUse 額外支援：
    permissionDecision?: 'allow' | 'deny';
    permissionDecisionReason?: string;
  };
}
```

## 各 Handler 分析

### 1. session-start-handler.js — SessionStart

**現況**：`buildStartOutput()` 回傳 `{ result: banner, systemMessage?: string }`

`systemMessage` 包含大量重要指令：plugin context、pending tasks、global observations、queue 等。這些 model 完全看不到。

**result 欄位語意**：SessionStart 的 `result` 是顯示在 session 開始時的 banner 文字，**model 看不到**。

**修改方案**：在 `buildStartOutput()` 中，若有 `systemMessage`，同時加入 `hookSpecificOutput`。

```typescript
// 修改前
{ result: banner, systemMessage?: string }

// 修改後
{
  result: banner,
  systemMessage?: string,        // 保留（給使用者看）
  hookSpecificOutput?: {         // 新增（給 model 看）
    hookEventName: 'SessionStart',
    additionalContext: string,   // 與 systemMessage 內容相同
  }
}
```

**修改位置**：`buildStartOutput()` 函式，第 161-169 行

---

### 2. pre-compact-handler.js — PreCompact

**現況**：`handlePreCompact()` 回傳 `{ output: { systemMessage: message, result: '' } }`

`systemMessage` 包含 workflow 狀態恢復、進度、下一步指引等。model 看不到。

**result 欄位語意**：PreCompact 的 `result` 為空字串，不含任何資訊。

**修改方案**：在回傳 `{ output: { systemMessage: message, result: '' } }` 時同時加入 `hookSpecificOutput`。

```typescript
// 修改前
{ output: { systemMessage: message, result: '' } }

// 修改後
{
  output: {
    systemMessage: message,       // 保留（給使用者看）
    result: '',
    hookSpecificOutput: {         // 新增（給 model 看）
      hookEventName: 'PreCompact',
      additionalContext: message,
    },
  },
}
```

**修改位置**：`handlePreCompact()` 函式第 173 行

---

### 3. pre-edit-guard.js — PreToolUse（閉環提示路徑）

**現況**：第 205-208 行回傳 `{ result: combinedWarning }`，第 154 行回傳 `{ result: CLAUDE_MD_REMINDER }`

**result 欄位語意確認**：PreToolUse 的 `result` 欄位官方文件說明為「補充資訊」，在 PreToolUse 事件中 model **可以看到** result（但不保證）。`additionalContext` 是明確保障的路徑。

**修改方案**：閉環提示和 CLAUDE.md 提醒路徑加上 `hookSpecificOutput.additionalContext`。

```typescript
// 修改前（CLAUDE.md 提醒，第 154 行）
{ result: CLAUDE_MD_REMINDER }

// 修改後
{
  result: CLAUDE_MD_REMINDER,
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    additionalContext: CLAUDE_MD_REMINDER,
  },
}

// 修改前（閉環提示，第 205-208 行）
{ result: combinedWarning }

// 修改後
{
  result: combinedWarning,
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    additionalContext: combinedWarning,
  },
}
```

**修改位置**：第 154 行（CLAUDE.md 提醒）和第 205-207 行（閉環提示合併輸出）

---

### 4. post-use-failure-handler.js — PostToolUseFailure

**現況**：重大失敗路徑回傳 `{ output: { result: message } }`

**result 欄位語意確認**：PostToolUseFailure 的 `result` 欄位在官方 Hook API 中，model **可以看到**（作為工具失敗後的補充上下文）。但 `additionalContext` 是更明確的保障。

**修改方案**：在回傳 `result: message` 時同時加入 `hookSpecificOutput.additionalContext`。

```typescript
// 修改前
{ output: { result: message } }

// 修改後
{
  output: {
    result: message,              // 保留（model 可見，但語意模糊）
    hookSpecificOutput: {         // 新增（明確注入 model context）
      hookEventName: 'PostToolUseFailure',
      additionalContext: message,
    },
  },
}
```

**修改位置**：`handlePostUseFailure()` 第 97 行

---

### 5. post-use-handler.js — PostToolUse

**現況**：兩個回傳 `result` 的路徑：
- 第 42 行：`return { output: { result: errorGuard } }`（Bash 錯誤守衛）
- 第 91 行：`return { output: { result } }`（wording mismatch）

**result 欄位語意確認**：PostToolUse 的 `result` 欄位 model 可見。但 `additionalContext` 是明確路徑。

**修改方案**：兩個有 result 內容的路徑都加上 `hookSpecificOutput.additionalContext`。

```typescript
// Bash 錯誤守衛路徑（第 42 行）
// 修改前
{ output: { result: errorGuard } }
// 修改後
{ output: { result: errorGuard, hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: errorGuard } } }

// wording mismatch 路徑（第 91 行）
// 修改前
{ output: { result } }
// 修改後
{ output: { result, hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: result } } }
```

**修改位置**：`handlePostUse()` 第 42 行和第 91 行

---

## 統一修改模式

所有修改遵循此模式（不抽取 helper function，保持各 handler 獨立）：

```javascript
// 有 systemMessage 的 handler（SessionStart、PreCompact）
if (message) {
  return {
    output: {
      systemMessage: message,
      result: '',
      hookSpecificOutput: {
        hookEventName: 'EventName',
        additionalContext: message,
      },
    },
  };
}

// 有 result 內容的 handler（PostToolUse、PostToolUseFailure、PreToolUse）
return {
  result: content,
  hookSpecificOutput: {
    hookEventName: 'EventName',
    additionalContext: content,
  },
};
```

**不抽取 helper 的理由**：各 handler 的 return 結構略有不同（有些包 `output`，有些不包），抽取 helper 反而增加複雜度。修改量小（每處只加 3-4 行），直接 inline 最清楚。

## 受影響的資料模型

**HookOutput 介面**（各 handler 的 return type）：

```typescript
// session-start-handler.js
interface SessionStartOutput {
  result: string;            // banner
  systemMessage?: string;    // 給使用者
  hookSpecificOutput?: {
    hookEventName: 'SessionStart';
    additionalContext: string;
  };
}

// pre-compact-handler.js
interface PreCompactHandlerOutput {
  output: {
    systemMessage?: string;
    result: string;
    hookSpecificOutput?: {
      hookEventName: 'PreCompact';
      additionalContext: string;
    };
  };
}

// post-use-failure-handler.js
interface PostUseFailureHandlerOutput {
  output: {
    result: string;
    hookSpecificOutput?: {
      hookEventName: 'PostToolUseFailure';
      additionalContext: string;
    };
  };
}

// post-use-handler.js
interface PostUseHandlerOutput {
  output: {
    result: string;
    hookSpecificOutput?: {
      hookEventName: 'PostToolUse';
      additionalContext: string;
    };
  };
}
```

## 檔案結構

修改清單：

| 檔案 | 修改類型 | 修改位置 |
|------|----------|----------|
| `~/.claude/scripts/lib/session-start-handler.js` | 加入 hookSpecificOutput | `buildStartOutput()` L164-168 |
| `~/.claude/scripts/lib/pre-compact-handler.js` | 加入 hookSpecificOutput | `handlePreCompact()` L173 |
| `~/.claude/hooks/scripts/tool/pre-edit-guard.js` | 加入 hookSpecificOutput | L154（CLAUDE.md 提醒）、L205-207（閉環提示） |
| `~/.claude/scripts/lib/post-use-failure-handler.js` | 加入 hookSpecificOutput | L97（重大失敗回傳） |
| `~/.claude/scripts/lib/post-use-handler.js` | 加入 hookSpecificOutput | L42（Bash 錯誤守衛）、L91（wording mismatch） |

測試更新：

| 測試檔 | 更新重點 |
|--------|----------|
| `tests/unit/session-start-handler.test.js` | `buildStartOutput()` 測試加入 `hookSpecificOutput` 驗證 |
| `tests/unit/pre-compact-handler.test.js` | `handlePreCompact()` 測試加入 `hookSpecificOutput` 驗證 |
| `tests/unit/post-use-failure-handler.test.js` | 重大失敗 scenario 加入 `hookSpecificOutput` 驗證 |
| `tests/unit/post-use-handler.test.js` | Bash 錯誤守衛 + wording mismatch 路徑加入 `hookSpecificOutput` 驗證 |
