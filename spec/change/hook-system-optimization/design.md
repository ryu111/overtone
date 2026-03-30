# Hook 系統全面優化 — 技術設計

## 深度路由：D3
**理由**：5 個 hook handler 改動涉及 3 種事件類型 + settings.json + 跨模組依賴（flow-observer 刪除 + 新 handler 新增），需 planner spec + executor 實作 + reviewer 審查

---

## 技術摘要

- **方案**：在現有 flow-observer.js 內新增 handler key（SubagentStart、PostToolUseFailure、PreCompact、StopFailure），搬移/新增邏輯
- **理由**：flow-observer 已是事件觀察的唯一模組，新增 handler key 零架構改動
- **取捨**：單一模組行數增加，但職責一致（「觀察 + 記錄事件」）

## 方案比較

| 維度 | 方案 A：在 flow-observer 新增 handler（選擇） | 方案 B：每個新 hook 獨立模組 |
|------|:------------------------------------------:|:--------------------------:|
| 複雜度 | 低（同檔案加 4 個 handler） | 中（4 個新檔案 + 4 個 module 載入） |
| 效能 | 同（handler map 查詢，與模組數無關） | 同 |
| 可維護性 | 好（事件觀察邏輯集中） | 碎片化（4 個小檔案各 30 行） |
| 風險 | 低（共用 persistEvents） | 低 |
| **結論** | **選擇** — 職責一致、零新檔案 | ❌ 碎片化無收益 |

## 模組介面

### 修改檔案

| # | 檔案 | 位置 | 變更內容 |
|---|------|------|---------|
| 1 | flow-observer.js | `~/.claude/hooks/modules/` | 刪除 `PreToolUse:Agent` handler、新增 `SubagentStart`/`PostToolUseFailure`/`PreCompact`/`StopFailure` 4 個 handler |
| 2 | settings.json | `~/.claude/` | 新增 SubagentStart、PreCompact、StopFailure、PostToolUseFailure 4 個 hook entry |

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | hook-system-optimization.test.js | `~/projects/nova-brain/tests/unit/` | ~200 | 4 個新 handler 的單元測試 |

### API 設計（handler 簽名）

```javascript
// SubagentStart — 搬移自 PreToolUse:Agent
SubagentStart: (input) => {
  // input: { session_id, subagent_id, subagent_type?, tool_input?, ... }
  // 注意：SubagentStart 的 input 格式需運行時確認
  // 回傳: { decision: "allow", events: [{ type: "agent_dispatch", ... }] }
}

// PostToolUseFailure — 補缺
PostToolUseFailure: (input) => {
  // input: { tool_name, tool_input, error, session_id, ... }
  // 回傳: { decision: "allow", events: [{ type: "tool_use_failure", ... }] }
}

// PreCompact — 新增
PreCompact: (input) => {
  // input: { session_id, cwd, ... }
  // side effect: 寫 /tmp/nova-handoff-{project}.md
  // 回傳: { decision: "allow", events: [{ type: "pre_compact", ... }] }
}

// StopFailure — 新增（注意：Claude Code 可能不存在此事件）
// 降級方案：用 Stop handler 判斷 stop_reason
StopFailure: (input) => {
  // input: { session_id, stop_reason, cwd, ... }
  // side effect: cross-dispatch 通知 Manager / 離線寫檔
  // 回傳: { decision: "allow", events: [{ type: "session_stop_failure", ... }] }
}
```

## 資料模型

- 儲存格式：JSONL（append-only，POSIX 原子保證）
- 儲存位置：`/tmp/nova-flow-events.jsonl`（既有）
- handoff：`/tmp/nova-handoff-{project}.md`（既有路徑）
- 離線 fallback：`/tmp/nova-stop-failure-{timestamp}.json`
- 清理策略：flow-events.jsonl 由 maintainer 定期清理（既有機制）

## settings.json 變更

```json
{
  "SubagentStart": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "bun ~/.claude/hooks/hook-client.js SubagentStart"
        }
      ]
    }
  ],
  "PreCompact": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "bun ~/.claude/hooks/hook-client.js PreCompact"
        }
      ]
    }
  ],
  "StopFailure": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "bun ~/.claude/hooks/hook-client.js StopFailure"
        }
      ]
    }
  ],
  "PostToolUseFailure": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "bun ~/.claude/hooks/hook-client.js PostToolUseFailure"
        }
      ]
    }
  ]
}
```

## 執行步驟

### Phase 1：研究 + 搬移（sequential）

| 步驟 | 檔案 | 說明 | 專案 |
|------|------|------|:----:|
| 1a | — | 確認 SubagentStart 的 stdin input 格式（跑一次 hook 或查 Claude Code 文件） | nb |
| 1b | flow-observer.js | 新增 `SubagentStart` handler（從 `PreToolUse:Agent` 搬移邏輯，適配新 input 格式） | nova |
| 1c | flow-observer.js | 刪除 `PreToolUse:Agent` handler | nova |
| 1d | settings.json | 新增 SubagentStart hook entry | nova |

### Phase 2：補缺 + 新增（parallel，與 Phase 1 串行）

所有步驟操作同一檔案 flow-observer.js，但各 handler 互不依賴。由於是同一檔案，由 **同一個 executor** 依序完成。

| 步驟 | 檔案 | 說明 | 專案 |
|------|------|------|:----:|
| 2a | flow-observer.js | 新增 `PostToolUseFailure` handler（複製 PostToolUse workflow tracking + 加 tool_use_failure 事件） | nova |
| 2b | flow-observer.js | 新增 `PreCompact` handler（讀 flow-events 推斷狀態 → 寫 handoff） | nova |
| 2c | flow-observer.js | 新增 `StopFailure` handler（或降級為 Stop handler 擴展） | nova |
| 2d | settings.json | 新增 PreCompact、StopFailure、PostToolUseFailure 3 個 hook entry | nova |

### Phase 3：測試（sequential，依賴 Phase 2）

| 步驟 | 檔案 | 說明 | 專案 |
|------|------|------|:----:|
| 3a | hook-system-optimization.test.js | SubagentStart handler 測試（emit agent_dispatch） | nb |
| 3b | hook-system-optimization.test.js | PostToolUseFailure handler 測試（emit tool_use_failure + workflow tracking） | nb |
| 3c | hook-system-optimization.test.js | PreCompact handler 測試（寫 handoff 檔案） | nb |
| 3d | hook-system-optimization.test.js | StopFailure handler 測試（cross-dispatch + 離線 fallback） | nb |
| 3e | — | `bun test` 全量通過驗證 | nb |

### Phase 4：驗收（sequential，依賴 Phase 3）

| 步驟 | 說明 | 專案 |
|------|------|:----:|
| 4a | reviewer 審查 flow-observer.js 變更 + 測試覆蓋 | nb |

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | SubagentStart input 格式與 PreToolUse:Agent 完全不同，handler 取到 undefined | 中 | 高 | Phase 1a 先確認格式；handler 加 `?.` optional chaining 防禦 |
| 2 | StopFailure 事件不存在於 Claude Code（hooks-api.md 列了但實際未觸發） | 中 | 中 | 降級方案：在 Stop handler 內判斷 stop_reason，不依賴獨立事件 |
| 3 | PreCompact 寫 handoff 時 flow-events.jsonl 太大導致讀取超時 | 低 | 中 | 只讀最後 100 行（`tail -100`），不全量解析 |
| 4 | PreCompact handler 的 side effect 與 AI 手動寫 handoff 衝突（重複寫入） | 低 | 低 | handoff 路徑固定，後寫覆蓋前寫；更新 `自壓縮.md` 規則移除手動步驟 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| hook-system-optimization.test.js | SubagentStart: emit agent_dispatch 事件含正確欄位 |
| hook-system-optimization.test.js | PostToolUseFailure: emit tool_use_failure + workflow tracking 更新 |
| hook-system-optimization.test.js | PreCompact: /tmp/nova-handoff-{project}.md 檔案存在且格式正確 |
| hook-system-optimization.test.js | StopFailure: 記錄 session_stop_failure 事件 |
| 既有 flow-observer 測試 | 不退步（PreToolUse:Agent 刪除不影響其他 handler） |

## 不做什麼

1. **不改 hook-client.js**：它已統一走 dispatch，新事件自動支援
2. **不改 nova-server dispatch**：handler key 路由已泛化
3. **不拆分 flow-observer 為多檔案**：職責一致（事件觀察），拆分無收益
4. **不改 nova-control**：SSE consumer 已泛化，新事件自動顯示
