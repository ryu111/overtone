# Hook 系統全面優化

## 動機（Why）

- **問題**：目前 Hook 系統有 3 個結構缺陷 + 3 個缺失能力
  1. `PreToolUse:Agent` 的 agent_dispatch 事件放在 flow-observer 裡，但語意上應屬 SubagentStart（agent 建立時，非 tool 呼叫前）
  2. PostToolUseFailure 沒有記錄邏輯，失敗的 tool 呼叫無法追蹤（flow-events.jsonl 缺失敗記錄）
  3. PreCompact 沒有 handler，handoff 檔案靠 AI 手動寫（違反自動化原則）
  4. StopFailure（API 斷線）無通知機制，session 異常結束時 Manager 不知道
- **目標**：5 個改動讓 Hook 系統事件覆蓋完整、失敗可追蹤、壓縮自動化
- **不做的代價**：失敗事件持續丟失、壓縮時 handoff 品質不穩定、異常結束無感知

## 範圍

### In-scope

1. **搬移**：PreToolUse:Agent 的 agent_dispatch 邏輯 → SubagentStart handler
2. **補缺**：PostToolUseFailure handler — 複製 PostToolUse 記錄邏輯 + 加失敗診斷
3. **新增**：PreCompact handler — 自動寫 handoff 檔案
4. **新增**：StopFailure handler — API 斷線時 cross-dispatch 通知 Manager
5. **settings.json**：新增 SubagentStart、PreCompact、StopFailure、PostToolUseFailure 4 個 hook entry
6. **測試**：每個改動的單元測試

### Out-of-scope

- nova-server 端無需改動（dispatch 函式已支援任意 eventType:handler key 路由）
- nova-control 端無需改動（SSE 事件已有泛用 consumer）
- hook-client.js 無需改動（已統一走 dispatch，新事件自動支援）
- 不改變現有 flow-observer 的其他 handler

## 使用者故事

1. 身為 Main Agent，我想在 tool 呼叫失敗時也有 flow event 記錄，以便事後診斷問題
2. 身為 Main Agent，我想在 compact 時自動產出 handoff 檔案，以便壓縮後能無縫接續
3. 身為 Manager，我想在 session 因 API 斷線異常結束時收到通知，以便及時介入

## 行為規格

### 1. SubagentStart handler（搬移自 PreToolUse:Agent）

**正常路徑**：
1. SubagentStart 觸發 → 解析 agent_type、model、skills
2. emit `agent_dispatch` 事件到 flow-events.jsonl
3. 回傳 `{ decision: "allow" }`

**與舊邏輯差異**：
- 輸入從 `input.tool_input` 改為 SubagentStart 的 input 格式（需確認 Claude Code 傳入的欄位）
- PreToolUse:Agent handler 從 flow-observer 中刪除

### 2. PostToolUseFailure handler（補缺）

**正常路徑**：
1. PostToolUseFailure 觸發 → 記錄 tool_name、error、context
2. 複製 PostToolUse 的 workflow tracking 邏輯（self-review、test run 偵測）
3. 額外 emit `tool_use_failure` 事件（含 error 訊息）
4. 回傳 `{ decision: "allow" }`

**錯誤路徑**：
| 錯誤情境 | 預期行為 |
|---------|---------|
| input 缺少 tool_name | 跳過記錄，回傳 allow |
| persistEvents 失敗 | console.error，不阻擋 |

### 3. PreCompact handler

**正常路徑**：
1. PreCompact 觸發 → 讀取 cwd 判斷專案名
2. 收集當前 session 狀態（從 flow-events.jsonl 最近事件推斷）
3. 寫入 `/tmp/nova-handoff-{project}.md`
4. 寫入 `/tmp/nova-compact-recovery-{project}.md`（供 UserPromptSubmit 讀取恢復用）
5. 回傳 `{}`（PreCompact 不支援 context 注入）

**錯誤路徑**：
| 錯誤情境 | 預期行為 |
|---------|---------|
| cwd 為空 | 用 "unknown" 作為專案名 |
| flow-events.jsonl 不存在 | 寫空白 handoff |
| 寫檔失敗 | console.error，不阻擋 |

### 4. StopFailure handler

**正常路徑**：
1. StopFailure 觸發（Claude Code stop_reason 非正常）→ 判斷是否 API 斷線
2. 嘗試 cross-dispatch 通知 Manager
3. 記錄 `session_stop_failure` 事件到 flow-events.jsonl
4. 回傳 `{}`

**錯誤路徑**：
| 錯誤情境 | 預期行為 |
|---------|---------|
| nova-server 不可用（cross-dispatch 失敗）| 寫入 /tmp/nova-stop-failure-{ts}.json 作為離線記錄 |
| stop_reason 為正常結束 | 不觸發通知，只記錄事件 |

## 資料模型

### 新增事件類型

| 事件 type | 來源 handler | 欄位 |
|-----------|-------------|------|
| `agent_dispatch` | SubagentStart | agent_type, description, model, skills, prompt_preview |
| `tool_use_failure` | PostToolUseFailure | tool_name, error, tool_input_preview |
| `pre_compact` | PreCompact | cwd, project, handoff_path |
| `session_stop_failure` | StopFailure | stop_reason, cwd, session_id |

### 儲存

- 格式：JSONL（append-only）
- 位置：`/tmp/nova-flow-events.jsonl`（既有）
- handoff：`/tmp/nova-handoff-{project}.md`（既有路徑）

## 介面契約

所有 handler 遵循 flow-observer 既有 pattern：

```javascript
export const on = {
  EventName: (input) => {
    // 處理邏輯
    return { decision: "allow", events: [...] };
  }
};
```

nova-server dispatch 自動路由，handler key 與 settings.json eventType 對應。

## 非功能需求

| 維度 | 要求 |
|------|------|
| 延遲 | 每個 handler < 50ms（同步檔案操作） |
| 可靠性 | 所有 handler 失敗不阻擋 session（fallback = allow） |
| 相容性 | 不破壞現有 flow-observer 其他 handler |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | hook-client.js | stdin → dispatch → handler（已支援，不需修改） |
| 上游 | nova-server dispatch | handler key 路由（已支援，不需修改） |
| 下游 | flow-events.jsonl | 事件持久化 |
| 下游 | cross-dispatch API | StopFailure 通知 Manager |

## 驗收標準

- [ ] SubagentStart handler emit agent_dispatch 事件，PreToolUse:Agent 的 agent_dispatch 邏輯已刪除
- [ ] PostToolUseFailure handler 記錄失敗事件到 flow-events.jsonl
- [ ] PreCompact handler 自動寫入 handoff 檔案
- [ ] StopFailure handler 嘗試 cross-dispatch 通知 + 離線 fallback
- [ ] settings.json 新增 4 個 hook entry
- [ ] `bun test` 全部通過（含新增測試）
- [ ] 既有 flow-observer 測試不退步

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| SubagentStart input 格式與 PreToolUse:Agent 不同 | 中 | 中 | 先確認 Claude Code SubagentStart 的 stdin 格式，必要時做欄位映射 |
| PreCompact 寫 handoff 品質不如手動 | 低 | 低 | 從 flow-events 推斷狀態，格式與手動版一致 |
| StopFailure 事件名稱不存在於 Claude Code | 中 | 高 | 查 hooks-api.md 確認 — 若不存在改用 Stop handler 判斷 stop_reason |
