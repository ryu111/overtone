# / 前綴移除

## 問題

所有 command 和 skill 使用 `/xxx` 前綴呼叫。這是 Overtone 作為 plugin 時的命名空間（`plugins/overtone/` → `ot:`）。
現在已遷移到 `~/.claude/`（全域唯一），`ot:` 前綴是多餘的。

## 影響範圍

共 389 個 `/` 引用：

### 功能性（~13 處，影響邏輯）

| 檔案 | 內容 |
|------|------|
| `on-submit-handler.js:44` | `startsWith('/')` 檢測 |
| `session-stop-handler.js:221` | `/stop` 手動退出 |
| `stop-message-builder.js` | 建議 `/auto`（3 處） |
| `pre-compact-handler.js` | 提示 `/auto` |
| `pre-task-handler.js` | `subagent_type: 'ot:'` 前綴剝離 |
| `state.js` | 註解引用 |
| `instinct.js` | `/evolve` CLI |

### 文件性（~158 處，純文字替換）

CLAUDE.md、commands/*.md、skills/*.md、agents/*.md、docs/spec/*.md

### 測試（~52 處）

on-submit-handler.test.js、hook-routing.test.js、pre-task.test.js 等

## 注意事項

- `pre-task-handler.js` 的 `subagent_type: 'ot:agentName'` 前綴剝離邏輯需同步調整
- 與「skill-command 職責分離」可一併執行

## 狀態

- **優先級**：低（純命名清理，不影響功能）
- **前置依賴**：建議先完成 skill-command 職責分離
