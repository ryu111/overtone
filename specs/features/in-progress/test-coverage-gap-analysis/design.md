# Design: test-coverage-gap-analysis

## 技術摘要（What & Why）

- **方案**：11 個測試檔案分三層（unit / integration / e2e），遵循現有 pattern 實作
- **理由**：現有 codebase 已有成熟的測試 pattern（unit 複製純函數 / integration 用 Bun.spawn 子進程），沿用可降低學習成本和出錯機率
- **取捨**：不測試 EventBus fs.watch 和 heartbeat timer（OS 依賴、CI 不穩定），不測試 dashboard-adapter.js 和 telegram-adapter.js（需外部 API mock，風險/收益比低）

## 重構決策

### 決策 1：identifyAgent 保持邏輯複製

- **選項 A**（選擇）：沿用現有 pattern，unit test 中複製 identifyAgent 邏輯 — 優點：零風險，現有 identify-agent.test.js 已驗證此方式可行
- **選項 B**（未選）：提取為 `lib/identify-agent.js` 獨立模組 — 原因：pre-task.js 是 hook 腳本（讀 stdin 直接執行），提取 import 結構會增加重構風險且 integration test 已可覆蓋完整流程

### 決策 2：post-use.js 追加 export

- **選項 A**（選擇）：在 post-use.js 現有的 `module.exports` 追加 `extractCommandTag` 和 `observeBashError` — 優點：最小改動，與 wording.test.js 已建立的 pattern 一致
- **選項 B**（未選）：提取為獨立模組 — 原因：過度拆分，這些函式只在 post-use.js 內使用

### 決策 3：EventBus 測試範圍

- **選項 A**（選擇）：只測 register/unregister、push、handleControl/handleQuery — 優點：測試核心命令路由和事件分發邏輯，穩定可靠
- **選項 B**（未選）：包含 fs.watch + heartbeat — 原因：OS 層 filesystem notification 在 CI 中不穩定，setInterval 需 fake timer，複雜度高收益低

### 決策 4：E2E 使用 Bun.spawn 串接

- **選項 A**（選擇）：Bun.spawn 串接多個 hook 子進程 — 優點：與現有 integration test pattern 一致，可在 CI 中穩定運行
- **選項 B**（未選）：真實 Claude Code runtime — 原因：不可程式化控制，無法 CI 自動化

## API 介面設計

### 修改：post-use.js 新增 export

```javascript
// 現有 export（第 280 行）
module.exports = { detectWordingMismatch, WORDING_RULES };

// 修改後
module.exports = { detectWordingMismatch, WORDING_RULES, extractCommandTag, observeBashError };
```

### extractCommandTag 函式簽名

```typescript
/**
 * 從指令字串提取主要工具名稱作為 tag
 * @param command - 完整 Bash 指令字串
 * @returns 標準化的工具名稱（如 'npm', 'bun', 'git', 'shell'）
 */
function extractCommandTag(command: string): string
```

### observeBashError 函式簽名

```typescript
/**
 * 觀察 Bash 錯誤並判斷是否需要自我修復
 * @param sessionId - 工作階段 ID
 * @param toolInput - { command: string }
 * @param toolResponse - { exit_code/exitCode/returncode, stderr, ... }
 * @returns 重大錯誤時回傳自我修復指令字串，否則 null
 */
function observeBashError(
  sessionId: string,
  toolInput: { command: string },
  toolResponse: { exit_code?: number, exitCode?: number, returncode?: number, stderr?: string }
): string | null
```

## 資料模型

無新增資料模型。所有測試使用既有的 workflow.json / timeline.jsonl / observations.jsonl 格式，透過臨時 session ID 隔離。

## 檔案結構

```
修改的檔案：
  plugins/overtone/hooks/scripts/tool/post-use.js  ← 修改第 280 行：追加 extractCommandTag, observeBashError 到 module.exports

新增的檔案（11 個測試 + 0 個原始碼）：

  tests/unit/registry.test.js              ← 新增：registry.js 資料完整性 unit test
  tests/unit/paths.test.js                 ← 新增：paths.js 路徑解析 unit test
  tests/unit/extract-command-tag.test.js   ← 新增：extractCommandTag 純函數 unit test
  tests/unit/adapter.test.js              ← 新增：Adapter 基類 unit test
  tests/integration/dashboard-pid.test.js  ← 新增：dashboard/pid.js 整合測試
  tests/integration/dashboard-sessions.test.js ← 新增：dashboard/sessions.js 整合測試
  tests/integration/session-start.test.js  ← 新增：session/on-start.js hook 整合測試
  tests/integration/pre-task.test.js       ← 新增：tool/pre-task.js hook 整合測試
  tests/integration/post-use-bash.test.js  ← 新增：observeBashError 整合測試
  tests/integration/event-bus.test.js      ← 新增：EventBus 核心方法測試
  tests/e2e/workflow-lifecycle.test.js     ← 新增：完整 workflow 生命週期 E2E 測試
```

## 每個測試檔的測試邊界

### Phase 1：Unit Tests

#### 1. tests/unit/registry.test.js

測試對象：`plugins/overtone/scripts/lib/registry.js`（純資料結構驗證，零 I/O）

| 測試群組 | 驗證項目 |
|---------|---------|
| stages 完整性 | 有 15 個 key；每個有 label/emoji/agent/color 四個欄位；agent 名稱不重複 |
| agentModels 完整性 | 有 15 個 entry；每個 agent 都有對應的 model（opus/sonnet/haiku）；所有 stages 的 agent 都在 agentModels 中 |
| workflows 完整性 | 有 15 個 key；每個有 label/stages/parallelGroups 三個欄位；stages 陣列元素都是 stages 的 valid key |
| parallelGroupDefs | 每個 group 的成員都是 stages 的 valid key |
| parallelGroups（推導值） | 自動推導結果與 parallelGroupDefs 子集一致 |
| timelineEvents | 有 20 個事件；每個有 label/category；category 覆蓋 8 個分類 |
| remoteCommands | 有 3 個命令；每個有 label/description |
| specsConfig | 覆蓋所有 15 個 workflow key |
| orchestratePresets | 每個 preset 的 stage 都是 stages 的 valid key |
| instinctDefaults | 所有 threshold 值在合理範圍 |

#### 2. tests/unit/paths.test.js

測試對象：`plugins/overtone/scripts/lib/paths.js`（純路徑計算，零 I/O）

| 測試群組 | 驗證項目 |
|---------|---------|
| 常數匯出 | OVERTONE_HOME 以 homedir() 開頭；SESSIONS_DIR 在 OVERTONE_HOME 下；CURRENT_SESSION_FILE 存在 |
| sessionDir | 回傳 `{SESSIONS_DIR}/{sessionId}` |
| sessionFile | 回傳 `{SESSIONS_DIR}/{sessionId}/{filename}` |
| session.workflow | 回傳 `.../{sessionId}/workflow.json` |
| session.timeline | 回傳 `.../{sessionId}/timeline.jsonl` |
| session.loop | 回傳 `.../{sessionId}/loop.json` |
| session.observations | 回傳 `.../{sessionId}/observations.jsonl` |
| session.handoffsDir | 回傳 `.../{sessionId}/handoffs` |
| session.handoff | 回傳 `.../{sessionId}/handoffs/{from}-to-{to}.md` |
| project.specsRoot | 回傳 `{root}/specs` |
| project.feature | 回傳 `{root}/specs/features/in-progress/{name}` |
| project.featureTasks | 回傳 `{root}/specs/features/in-progress/{name}/tasks.md` |
| project.backlog | 回傳 `{root}/specs/features/backlog` |
| project.archive | 回傳 `{root}/specs/features/archive` |

#### 3. tests/unit/extract-command-tag.test.js

測試對象：從 `post-use.js` export 的 `extractCommandTag`

| 測試群組 | 驗證項目 |
|---------|---------|
| 已知工具 | `npm install pkg` → 'npm'；`bun test` → 'bun'；`git push` → 'git'；`node index.js` → 'node'；`python3 script.py` → 'python' |
| 別名規範化 | `npx create-app` → 'npm'；`bunx pkg` → 'bun'；`pip install` → 'python'；`tsc --build` → 'typescript'；`vitest run` → 'jest' |
| 未知工具 | `curl http://...` → 'curl'；`ls -la` → 'ls'；`my-custom-tool arg` → 'my-custom-tool' |
| 邊界情況 | 空字串 → 'shell'；含特殊字元 → 清理後回傳（去除 [^a-z0-9-]）；超長工具名 → 截斷到 20 字元 |

#### 4. tests/unit/adapter.test.js

測試對象：`plugins/overtone/scripts/lib/remote/adapter.js`

| 測試群組 | 驗證項目 |
|---------|---------|
| constructor | name 和 eventBus 正確設定；初始 _connected = false |
| connect/disconnect | connect() 後 isConnected = true；disconnect() 後 isConnected = false |
| isConnected getter | 反映 _connected 狀態 |
| onPush | 預設不拋錯（空實作）；子類可覆寫 |
| onSync/onInteract | 預設不拋錯（V2 預留） |

### Phase 2：Integration Tests

#### 5. tests/integration/dashboard-pid.test.js

測試對象：`plugins/overtone/scripts/lib/dashboard/pid.js`（需真實 fs I/O）

測試策略：使用臨時 DASHBOARD_FILE 路徑（mock paths 或直接寫入/清理）

| 測試群組 | 驗證項目 |
|---------|---------|
| write/read 往返 | 寫入 {pid, port, startedAt} 後 read 回傳相同物件 |
| read 不存在 | 回傳 null（靜默） |
| remove | 刪除後 read 回傳 null |
| remove 不存在 | 不拋錯（靜默） |
| isRunning (活躍) | 使用 process.pid 寫入 → isRunning() = true |
| isRunning (已死) | 使用不存在的 PID 寫入 → isRunning() = false 且自動 remove |
| isRunning (無檔案) | 回傳 false |
| getUrl | 有資料時回傳 `http://localhost:{port}` |
| getUrl (無資料) | 回傳 null |

注意：pid.js 直接 import paths.DASHBOARD_FILE，測試需在 beforeEach 寫入、afterEach 清理，注意不要影響真實 dashboard.json。可以透過覆寫 DASHBOARD_FILE 或在 afterAll 恢復。

**替代方案**：因為 pid.js 硬依賴 paths.DASHBOARD_FILE，測試直接操作 `~/.overtone/dashboard.json`。需在 beforeAll 備份、afterAll 恢復。

#### 6. tests/integration/dashboard-sessions.test.js

測試對象：`plugins/overtone/scripts/lib/dashboard/sessions.js`

測試策略：建立臨時 session 目錄 + workflow.json，測試後清理

| 測試群組 | 驗證項目 |
|---------|---------|
| listSessions 空 | 無 session 目錄時回傳空陣列 |
| listSessions 有資料 | 回傳正確的 session 摘要列表；按 createdAt 倒序 |
| listSessions active filter | `{active: true}` 只列出有 activeAgents 的 session |
| getSessionSummary | 回傳正確欄位（sessionId, workflowType, createdAt, currentStage, progress, isActive, failCount, rejectCount） |
| getSessionSummary 不存在 | 回傳 null |

#### 7. tests/integration/session-start.test.js

測試對象：`plugins/overtone/hooks/scripts/session/on-start.js`

測試策略：Bun.spawn 子進程，仿照 agent-on-stop.test.js 的 runHook pattern

| 測試群組 | 驗證項目 |
|---------|---------|
| Banner 輸出 | result 包含 'Overtone' 和版本號；包含 session ID（前 8 字元） |
| Session 目錄初始化 | hook 執行後 sessionDir 和 handoffsDir 存在 |
| Timeline 事件 | timeline.jsonl 有 session:start 事件且含 version 欄位 |
| Dashboard spawn | 不直接測試 spawn 行為（需 mock），只驗證不拋錯 |
| 無 sessionId | 靜默處理，仍輸出 banner（不含 session 資訊） |

#### 8. tests/integration/pre-task.test.js

測試對象：`plugins/overtone/hooks/scripts/tool/pre-task.js`

測試策略：Bun.spawn 子進程

| 測試群組 | 驗證項目 |
|---------|---------|
| 跳過前置階段 → block | 初始化 standard workflow，直接委派 developer（跳過 PLAN）→ decision: 'block' |
| 正常委派 → 允許 | DEV stage pending，委派 developer → result: ''（允許）+ state 中 activeAgents 有 developer + timeline 有 agent:delegate |
| 無 session → 跳過 | 無 CLAUDE_SESSION_ID → result: ''（靜默） |
| 無法辨識 agent → 跳過 | description 不含任何 agent 名稱 → result: '' |
| 第一個 stage → 不擋 | 委派第一個 stage（如 PLAN） → result: ''（不擋） |

#### 9. tests/integration/post-use-bash.test.js

測試對象：從 post-use.js export 的 `observeBashError`

測試策略：直接 require post-use.js 的 export，mock instinct.emit（使用臨時 session）

| 測試群組 | 驗證項目 |
|---------|---------|
| 重大錯誤 → 自我修復指令 | sessionId + `{command: 'bun test'}` + `{exit_code: 1, stderr: 'Error: module not found...（>20 字元）'}` → 回傳含「Overtone 錯誤守衛」的字串 |
| 輕微錯誤 → null | 同上但 stderr < 20 字元 → null |
| 非重要工具 → null | `{command: 'curl http://...'}` + 非零 exit code + 長 stderr → null（curl 不在 isSignificantTool 列表） |
| exit code 0 → null | 正常退出不觸發 |
| exit code undefined → null | 無 exit code 不觸發 |
| 空 command → null | 空指令不觸發 |
| exit_code vs exitCode vs returncode | 三種欄位名稱都能正確讀取 |

#### 10. tests/integration/event-bus.test.js

測試對象：`plugins/overtone/scripts/lib/remote/event-bus.js`

測試策略：直接實例化 EventBus，註冊 mock adapter

| 測試群組 | 驗證項目 |
|---------|---------|
| register/unregister | 註冊後 adapters.size 增加；移除後減少 |
| push 分發 | push 呼叫所有已註冊 adapter 的 onPush；adapter 拋錯不影響其他 |
| handleControl — stop | 有 sessionId → ok: true + loop.json 寫入 stopped；無 sessionId → ok: false |
| handleControl — status | 有 session state → ok: true + data；無 session → ok: false |
| handleControl — sessions | 回傳 ok: true + data（列表） |
| handleControl — 未知命令 | 回傳 ok: false + error |
| handleQuery | 委派到 handleControl |
| stop 生命週期 | stop() 後 watchers 清空、adapters 斷開 |

### Phase 3：E2E Test

#### 11. tests/e2e/workflow-lifecycle.test.js

測試對象：完整 single workflow 生命週期

測試策略：依序 Bun.spawn 多個 hook，驗證磁碟上的 state/timeline 一致性

| 步驟 | Hook | 驗證項目 |
|:----:|------|---------|
| 1 | on-start.js | session 目錄存在；timeline 有 session:start |
| 2 | on-submit.js | additionalContext 包含 /ot:auto 引導 |
| 3 | init-workflow.js single | workflow.json 存在；workflowType = 'single'；stages = {DEV: pending} |
| 4 | pre-task.js（developer） | result: ''（允許）；activeAgents 有 developer；timeline 有 agent:delegate |
| 5 | on-stop.js（developer PASS） | DEV status = completed；timeline 有 agent:complete + stage:complete |
| 6 | 最終驗證 | 所有 stage completed；failCount/rejectCount = 0；timeline 事件順序正確 |

## 實作注意事項

### 測試 pattern 遵循

- **unit test**：`require('bun:test')`，使用 `tests/helpers/paths.js` 的常數
- **integration test**：Bun.spawn 子進程 pattern（參考 agent-on-stop.test.js 的 runHook 輔助函式）
- **session 隔離**：每個 test suite 使用 `test_{module}_{Date.now()}` 前綴的 session ID
- **清理**：afterAll / afterEach 中 rmSync session 目錄

### post-use.js 修改

唯一的原始碼修改：第 280 行從
```javascript
module.exports = { detectWordingMismatch, WORDING_RULES };
```
改為
```javascript
module.exports = { detectWordingMismatch, WORDING_RULES, extractCommandTag, observeBashError };
```

### dashboard/pid.js 測試的檔案衝突風險

pid.js 硬依賴 `paths.DASHBOARD_FILE`（`~/.overtone/dashboard.json`），測試寫入會影響真實 Dashboard 狀態。解決方案：
1. beforeAll 備份 `dashboard.json`（若存在）
2. afterAll 恢復或刪除
3. 測試中使用不衝突的 PID/port 值

### EventBus handleControl 的依賴

handleControl 呼叫 loop.writeLoop（stop）和 state.readState（status），需要真實的 session 目錄和 workflow.json。測試前需 initState。
