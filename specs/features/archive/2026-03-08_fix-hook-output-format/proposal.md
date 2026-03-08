# Proposal: fix-hook-output-format

## 背景

Claude Code hook 的 JSON output 有兩個語意不同的欄位：

- `systemMessage`：顯示給使用者看的警告訊息，model **看不到**
- `hookSpecificOutput.additionalContext`：注入到 model context，model **看得到**

Overtone 目前所有 hook handler 都用 `systemMessage` 來傳遞指令給 model，但 model 從來沒看到這些內容。`on-submit-handler.js` 已完成修復（同時輸出兩個欄位）。

## 問題陳述

GIVEN hook handler 回傳 `{ systemMessage: "指令..." }`
WHEN Claude Code 執行此 hook
THEN model 收不到任何指令（systemMessage 只給使用者顯示）
AND hook 注入的工作流狀態、修復建議、閉環提示全部失效

## 需求

### 核心需求

每個 hook handler 在輸出 `systemMessage` 給使用者看的同時，必須同時輸出 `hookSpecificOutput.additionalContext` 讓 model 收到相同內容。

```js
// 修復模式（以 UserPromptSubmit 為例）
const output = { systemMessage, result: '' };
if (systemMessage) {
  output.hookSpecificOutput = {
    hookEventName: 'UserPromptSubmit',
    additionalContext: systemMessage,
  };
}
return output;
```

### 範圍說明

| 欄位 | 受眾 | 是否需要修復 |
|------|------|-------------|
| `systemMessage` | 使用者 UI | 保留，不刪除 |
| `hookSpecificOutput.additionalContext` | model context | **新增** |
| `result`（PostToolUse/PreToolUse） | 需確認平台語意 | 待 architect 確認 |
| `permissionDecision`（deny） | 阻擋操作 | 不受影響 |

## 受影響檔案分析

### 需要修改的 Handler（確定需要加 additionalContext）

#### 1. `~/.claude/scripts/lib/session-start-handler.js`
- **Hook Event**: `SessionStart`
- **systemMessage 內容**: 工作流狀態、待辦任務、高信心觀察、Handoff 上下文（給 model 重建 TaskList 用）
- **修改位置**: `buildStartOutput()` 函式（第 161-168 行）— 在 `output.systemMessage` 賦值後，同時加 `hookSpecificOutput`
- **需加 additionalContext**: ✅

#### 2. `~/.claude/scripts/lib/pre-compact-handler.js`
- **Hook Event**: `PreCompact`
- **systemMessage 內容**: 壓縮恢復訊息（進度條 + 階段提示 + 待辦事項）
- **修改位置**: `handlePreCompact()` 回傳處（第 173 行）— `return { output: { systemMessage: message, result: '' } }`
- **需加 additionalContext**: ✅

#### 3. `~/.claude/hooks/scripts/tool/pre-edit-guard.js`（閉環提示路徑）
- **Hook Event**: `PreToolUse`
- **閉環提示 + 編碼守衛訊息**: 給 model 看的指引（「應委派 developer」）
- **修改位置**: 第 204-207 行 — 目前用 `{ result: combinedWarning }` 輸出，需改為同時加 `hookSpecificOutput.additionalContext`
- **需加 additionalContext**: ✅
- **注意**: 阻擋路徑（`permissionDecision: 'deny'`）已正確，不需修改

### 需要確認的 Handler（`result` 欄位語意不同）

#### 4. `~/.claude/scripts/lib/post-use-failure-handler.js`
- **Hook Event**: `PostToolUseFailure`
- **當前行為**: 重大失敗時回傳 `{ output: { result: message } }`（用 `result` 不用 `systemMessage`）
- **問題**: `PostToolUseFailure` 的 `result` 欄位語意待確認 — 是否 model 看得到？
- **待 architect 確認**: 是否需要改成 `systemMessage` + `additionalContext`，或者 `result` 在此 hook 事件已直接注入 model context

#### 5. `~/.claude/scripts/lib/post-use-handler.js`（措詞偵測路徑）
- **Hook Event**: `PostToolUse`
- **當前行為**: 措詞警告回傳 `{ output: { result: message } }`（用 `result` 不用 `systemMessage`）
- **問題**: 同上，`PostToolUse` 的 `result` 欄位語意待確認

### 不需修改（回傳 `result: ''` 空值）

- `post-use-handler.js` 的正常路徑（`{ output: { result: '' } }`）— 無內容不需注入
- `post-use-failure-handler.js` 的非重大失敗路徑 — 無注入需求
- `pre-edit-guard.js` 的 `permissionDecision: 'deny'` 路徑 — 已正確使用平台 API

### 不需修改（已完成）

- `on-submit-handler.js` — ✅ 已修復，`UserPromptSubmit` 已同時輸出 `additionalContext`

## 需要更新的測試

### unit tests（需更新斷言）

| 測試檔案 | 需要新增的斷言 |
|---------|--------------|
| `tests/unit/session-start-handler.test.js` | 驗證 `output.hookSpecificOutput.additionalContext` 存在且等於 `systemMessage` |
| `tests/unit/pre-compact-handler.test.js` | 驗證 `output.output.hookSpecificOutput.additionalContext` 存在 |
| `tests/unit/post-use-failure-handler.test.js` | 待確認 `result` 語意後決定 |
| `tests/unit/hook-pure-fns.test.js` | 依修改範圍更新 |

### integration tests（可能需更新）

| 測試檔案 | 評估 |
|---------|------|
| `tests/integration/session-start.test.js` | 可能需要驗證 `additionalContext` |
| `tests/integration/pre-compact.test.js` | 可能需要驗證 `additionalContext` |
| `tests/integration/on-submit.test.js` | 已完成，可作為參考範例 |

## 需要更新的文檔

### `~/.claude/skills/claude-dev/references/hooks-api.md`

目前文檔只記載了：
- `Stop/SubagentStop` 的 `systemMessage`
- `PreToolUse` 的 `updatedInput` / `permissionDecision`
- `UserPromptSubmit` 的 `systemMessage`

需要補充 `hookSpecificOutput.additionalContext` 的說明，包含：
- 各 hook 事件支援 `additionalContext` 的清單
- `hookEventName` 的正確值對應各事件
- 為何需要同時輸出 `systemMessage` 和 `additionalContext` 的說明

## 驗收標準

GIVEN `SessionStart` hook 觸發
WHEN `buildStartOutput()` 組裝輸出
THEN 回傳物件同時包含 `systemMessage` 和 `hookSpecificOutput.additionalContext`
AND `additionalContext` 內容與 `systemMessage` 相同

GIVEN `PreCompact` hook 觸發
WHEN `handlePreCompact()` 組裝壓縮恢復訊息
THEN 回傳物件同時包含 `systemMessage` 和 `hookSpecificOutput.additionalContext`

GIVEN `PreToolUse`（Write/Edit）hook 觸發閉環提示
WHEN `checkClosedLoop()` 或 `checkMainAgentCoding()` 回傳非空訊息
THEN 輸出同時包含 `result`/`systemMessage` 和 `hookSpecificOutput.additionalContext`
AND `hookEventName` 為 `'PreToolUse'`

GIVEN 現有測試執行
WHEN 修復完成後
THEN 所有 `systemMessage` 斷言維持通過
AND 新增的 `additionalContext` 斷言也通過
