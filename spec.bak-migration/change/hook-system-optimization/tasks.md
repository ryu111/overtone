# Hook 系統全面優化 — 任務清單

## 依賴分析

```
Phase 1（sequential）: T1 研究 → T2 搬移+刪除
Phase 2（sequential，依賴 Phase 1）: T3 補缺+新增（同一檔案，同一 executor）
Phase 3（sequential，依賴 Phase 2）: T4 測試
Phase 4（sequential，依賴 Phase 3）: T5 驗收
```

**為什麼全串行**：所有改動操作同一檔案 `flow-observer.js`，並行會 merge conflict。

---

## Phase 1：研究 + 搬移

### T1：確認 SubagentStart input 格式
- **專案**：nb（研究）
- **執行者**：executor
- **做什麼**：
  1. 在 settings.json 臨時加 SubagentStart hook，print stdin 到 /tmp/subagent-start-input.json
  2. 觸發一次 Agent 呼叫，捕獲實際 input
  3. 比對 PreToolUse:Agent 的 input 格式，記錄差異
  4. 確認 StopFailure 事件是否存在（同樣方法測試）
- **產出**：`/tmp/subagent-start-input.json` + 格式差異筆記
- **依賴**：無

### T2：搬移 agent_dispatch 到 SubagentStart + 刪除 PreToolUse:Agent
- **專案**：nova（`~/.claude/hooks/modules/flow-observer.js` + `~/.claude/settings.json`）
- **執行者**：executor
- **做什麼**：
  1. 在 flow-observer.js `on` 物件中新增 `SubagentStart` handler
     - 從 T1 確認的 input 格式取 agent_type、model、skills
     - 複用 `parseAgentFrontmatter()` 和 `parseExtraSkills()`
     - emit `agent_dispatch` 事件（與原 PreToolUse:Agent 相同欄位）
  2. 刪除 `"PreToolUse:Agent"` handler
  3. settings.json 新增 SubagentStart hook entry
  4. settings.json 刪除 PreToolUse Agent entry（若 SubagentStart 完全取代）
     - **注意**：PreToolUse:Agent 在 settings.json 中是 `"matcher": "Agent"` 在 PreToolUse 下。若其他模組（guards.js）也用 PreToolUse:Agent，不能刪 settings entry，只刪 flow-observer handler
- **產出**：flow-observer.js 有 SubagentStart handler、無 PreToolUse:Agent handler
- **依賴**：T1（需要 input 格式）
- **fallback**：若 SubagentStart input 缺少必要欄位 → 保留 PreToolUse:Agent 作為補充，SubagentStart 做追加記錄

## Phase 2：補缺 + 新增

### T3：新增 PostToolUseFailure + PreCompact + StopFailure handler
- **專案**：nova（`~/.claude/hooks/modules/flow-observer.js` + `~/.claude/settings.json`）
- **執行者**：executor（同一個，因為都改同一檔案）
- **做什麼**：

  **3a. PostToolUseFailure handler**
  1. 複製 PostToolUse 的 workflow tracking 邏輯（self-review、test run、component delete 偵測）
  2. 額外 emit `tool_use_failure` 事件：`{ type: "tool_use_failure", tool_name, error: input.error || input.tool_result, tool_input_preview }`
  3. 所有 TRACKED_TOOLS + 非追蹤 tool 都記錄失敗（失敗比成功更值得觀察）

  **3b. PreCompact handler**
  1. 從 `input.cwd` 推斷專案名（取最後一段路徑）
  2. 讀 `/tmp/nova-flow-events.jsonl` 最後 100 行，提取最近的事件摘要
  3. 寫入 `/tmp/nova-handoff-{project}.md`（格式與 `rules/自壓縮.md` 的 handoff 模板一致）
  4. 寫入 `/tmp/nova-compact-recovery-{project}.md`（供 UserPromptSubmit on-submit-handler 讀取）
  5. 回傳 `{ decision: "allow", events: [{ type: "pre_compact", cwd, project, handoff_path }] }`
  6. **限制**：PreCompact 不支援 context 注入（additionalContext 無效），只做 side effect

  **3c. StopFailure handler**（或降級為 Stop handler 擴展）
  1. 若 Claude Code 支援 StopFailure 事件 → 獨立 handler
  2. 若不支援 → 在 Stop handler 內判斷 `stop_reason` 是否異常
  3. 異常結束 → `fetch POST http://127.0.0.1:3457/api/cross-dispatch`（timeout 3s）
  4. fetch 失敗 → 寫 `/tmp/nova-stop-failure-{timestamp}.json`
  5. emit `session_stop_failure` 事件

  **3d. settings.json**
  - 新增 PreCompact、PostToolUseFailure hook entry
  - 若 StopFailure 存在 → 新增 StopFailure entry
  - 若降級 → 不需新增（Stop entry 已存在）

- **產出**：flow-observer.js 有 4 個新 handler（SubagentStart 在 T2 已完成）
- **依賴**：T2（flow-observer.js 需要 T2 先完成搬移）

## Phase 3：測試

### T4：撰寫單元測試
- **專案**：nb（`~/projects/nova-brain/tests/unit/`）
- **執行者**：executor
- **做什麼**：
  1. import flow-observer 的 `on` 物件
  2. 測試 SubagentStart handler：
     - 輸入模擬 SubagentStart input → 回傳含 agent_dispatch 事件
     - 驗證 parseAgentFrontmatter 被正確呼叫
  3. 測試 PostToolUseFailure handler：
     - 輸入含 tool_name + error → 回傳含 tool_use_failure 事件
     - 驗證 workflow tracking 計數器更新
  4. 測試 PreCompact handler：
     - 輸入含 cwd → 驗證 handoff 檔案被寫入
     - 驗證 flow-events.jsonl 不存在時不崩潰
  5. 測試 StopFailure handler：
     - 輸入含異常 stop_reason → 驗證 session_stop_failure 事件
  6. 跑 `bun test` 確認全量通過
- **產出**：hook-system-optimization.test.js + 全量 pass
- **依賴**：T3（需要 handler 實作完成）

## Phase 4：驗收

### T5：reviewer 審查
- **專案**：nb + nova
- **執行者**：reviewer（opus）
- **做什麼**：
  1. 審查 flow-observer.js 變更：職責一致性、error handling、欄位 optional chaining
  2. 審查 settings.json：格式正確、無重複 entry
  3. 審查測試覆蓋：每個 handler 的正常+錯誤路徑
  4. 確認 PreToolUse:Agent handler 已完全移除
  5. 確認 `bun test` 全量通過
- **產出**：審查報告 + pass/fail 判定
- **依賴**：T4

---

## Fallback 策略總覽

| Handler | nova-server 可用時 | nova-server 不可用時 |
|---------|-------------------|---------------------|
| SubagentStart | dispatch → handler 記錄 | 靜默跳過（觀察事件，無阻擋需求） |
| PostToolUseFailure | dispatch → handler 記錄 | 靜默跳過（同上） |
| PreCompact | dispatch → handler 寫 handoff | 靜默跳過 → AI 手動寫 handoff（現有行為） |
| StopFailure | dispatch → handler 通知 | 靜默跳過 → 離線寫 /tmp/ fallback 檔案 |

**為什麼觀察類 handler 不需要 fallback**：flow-observer 的所有 handler 都是「觀察 + 記錄」，不影響 session 運行。hook-client.js 的 `FALLBACK_MODULES` 只註冊了 guards（阻擋類），觀察類 fallback 不值得。

---

## 專案歸屬總覽

| 任務 | nova（`~/.claude/`） | nb（`~/projects/nova-brain/`） | ns（nova-server） | nc（nova-control） |
|------|:-------------------:|:----------------------------:|:------------------:|:------------------:|
| T1 研究 | | 研究記錄 | | |
| T2 搬移 | flow-observer.js + settings.json | | | |
| T3 補缺+新增 | flow-observer.js + settings.json | | | |
| T4 測試 | | tests/unit/ | | |
| T5 驗收 | 審查 | 審查 | | |

**ns（nova-server）不需修改**：dispatch 函式已泛化，handler key 自動路由。
**nc（nova-control）不需修改**：SSE event consumer 已泛化。
