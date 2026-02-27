# Design: pipeline-stability-tests

## 技術摘要（What & Why）

- **方案**：提取 identifyAgent / parseResult 為獨立 `scripts/lib/` 模組，修復 identifyAgent 的 `.test.` 誤匹配 bug，新增 3 個 E2E 測試 + 2 個 integration 測試擴充
- **理由**：消除 unit test 中邏輯複製的同步風險（目前 identify-agent.test.js 和 parse-result.test.js 都是手動複製函式）；修復已知 bug 防止非 tester 委派被誤判；自動化覆蓋 pipeline state machine 的關鍵路徑
- **取捨**：不覆蓋 full/secure/tdd 等複雜 workflow（邊際收益低），不測試 Loop 最大迭代退出（已有 unit 覆蓋）

## API 介面設計

### 新模組：scripts/lib/identify-agent.js

```javascript
/**
 * 從 Task 描述/prompt 中識別 Overtone agent
 * @param {string} desc - 小寫化的 toolInput.description
 * @param {string} prmt - 小寫化的 toolInput.prompt
 * @returns {string|null} agent 名稱，無法辨識時回傳 null
 */
function identifyAgent(desc, prmt) { ... }

module.exports = identifyAgent;
```

### 新模組：scripts/lib/parse-result.js

```javascript
/**
 * 解析 agent 輸出，判斷結果
 * @param {string} output - agent 的完整輸出文字
 * @param {string} stageKey - stage 名稱（如 'REVIEW', 'TEST', 'RETRO'）
 * @returns {{ verdict: string }} verdict 為 'pass' | 'fail' | 'reject' | 'issues'
 */
function parseResult(output, stageKey) { ... }

module.exports = parseResult;
```

### 修改：pre-task.js（hook 腳本）

```javascript
// 修改前（L147-181）：identifyAgent 函式定義在檔案底部
// 修改後：刪除本地函式，改為 require
const identifyAgent = require('../../../scripts/lib/identify-agent');
```

### 修改：on-stop.js（hook 腳本）

```javascript
// 修改前（L254-316）：parseResult 函式定義在檔案底部
// 修改後：刪除本地函式，改為 require
const parseResult = require('../../../scripts/lib/parse-result');
```

### 錯誤處理

| 錯誤情況 | 處理方式 |
|---------|---------|
| identifyAgent 輸入為空 | 回傳 null（不拋錯） |
| parseResult 輸入為空 | 回傳 `{ verdict: 'pass' }`（預設安全值） |

## 關鍵技術決策

### 決策 1：identifyAgent 修復策略 — 選擇 (B) 上下文匹配

- **選項 A**（未選）：Negative lookbehind `(?<!\.)test(?:er|ing)?(?!\/)` — 原因：只解決 `.test.js` 和 `test/` 兩個 pattern，無法防範 `bun test`、`npm test`、`test-results.json` 等其他路徑/指令中的 false positive。本質上是打地鼠，每出現新 pattern 就要加新的 lookbehind/lookahead。
- **選項 B**（選擇）：alias 只匹配 description 欄位，不匹配 prompt 欄位 — 優點：根治問題。Claude Code 的 Task 工具中，`description` 是短且人類可讀的（如 "委派 tester agent: 執行 BDD 測試"），而 `prompt` 是長且可能包含檔案路徑、程式碼片段的完整指令。精確名稱（第一輪完整 agent 名稱匹配）仍可匹配 `combined`（desc + prompt），因為 `code-reviewer`、`tester`、`e2e-runner` 等完整名稱不會在路徑中出現。只有模糊的 alias（`test`、`debug`、`plan` 等短詞）限制在 `description` 中匹配。
- **實作細節**：`identifyAgent(desc, prmt)` 函式簽名不變，但內部邏輯改為：
  1. 第一輪（精確匹配 agent 全名）：仍搜尋 `combined = desc + prmt`
  2. 第二輪（alias 模糊匹配）：只搜尋 `desc`（不含 prmt）

### 決策 2：模組提取位置 — 獨立檔案

- **選項 A**（選擇）：`scripts/lib/identify-agent.js` 和 `scripts/lib/parse-result.js` — 優點：與 `scripts/lib/` 下其他單一職責模組（paths.js, state.js, loop.js, timeline.js）一致；函式簽名保持原樣（零行為變更風險）；hook 和 test 都 require 同一份程式碼（Single Source of Truth）
- **選項 B**（未選）：合併到 registry.js 或 state.js — 原因：這兩個函式與 registry/state 的職責不同，強行合併違反 SRP；registry.js 是純資料定義，不應有邏輯函式
- **不加入 registry.js 的 export**：這兩個模組是邏輯函式，不是資料映射，獨立 require 即可

### 決策 3：E2E 測試拆分 — 新增檔案而非擴充現有

- **選項 A**（選擇）：新增 `tests/e2e/single-workflow.test.js` 和 `tests/e2e/standard-workflow.test.js`，現有 `workflow-lifecycle.test.js` 保持不變 — 優點：每個檔案聚焦一個 workflow type，測試失敗時能快速定位；避免單一檔案過長
- **選項 B**（未選）：在 `workflow-lifecycle.test.js` 新增 describe 區塊 — 原因：quick workflow 的場景已經有 3 個 describe，再加 standard 的 8 個 stage 會讓檔案超過 500 行，可讀性差

### 決策 4：E2E 測試的 hook 串接 — test helper 函式

- **選項 A**（選擇）：在 `tests/helpers/` 新增 `hook-runner.js`，提供 `runPreTask(sessionId, toolInput)` 和 `runSubagentStop(sessionId, agentType, message)` — 優點：DRY（pre-task.test.js 和 agent-on-stop.test.js 各自有 runHook，但 E2E 需要同時用到兩者）；統一 stdin/env 處理邏輯
- **選項 B**（未選）：每個 E2E 檔案各自複製 runHook — 原因：已有 3 個地方重複 Bun.spawn + stdin 處理邏輯，再複製會更難維護

## 資料模型

無新增資料模型。所有測試使用既有 workflow.json / timeline.jsonl 格式，透過臨時 session ID 隔離。

## 檔案結構

```
修改的檔案：
  plugins/overtone/hooks/scripts/tool/pre-task.js     ← 修改：刪除 identifyAgent 本地函式（L147-181），改為 require('../../../scripts/lib/identify-agent')
  plugins/overtone/hooks/scripts/agent/on-stop.js      ← 修改：刪除 parseResult 本地函式（L254-316），改為 require('../../../scripts/lib/parse-result')
  tests/unit/identify-agent.test.js                    ← 修改：從 require 模組而非本地複製；新增 `.test.js` 誤匹配回歸測試
  tests/unit/parse-result.test.js                      ← 修改：從 require 模組而非本地複製

新增的檔案：
  plugins/overtone/scripts/lib/identify-agent.js       ← 新增：identifyAgent 獨立模組（含 alias 只匹配 desc 的修復）
  plugins/overtone/scripts/lib/parse-result.js         ← 新增：parseResult 獨立模組
  tests/helpers/hook-runner.js                         ← 新增：E2E/integration 共用的 hook 執行 helper
  tests/e2e/single-workflow.test.js                    ← 新增：single workflow 完整 state machine E2E
  tests/e2e/standard-workflow.test.js                  ← 新增：standard workflow 8-stage state machine E2E
  tests/e2e/quick-workflow.test.js                     ← 新增：quick workflow hook 驅動 state 轉移 E2E
  tests/e2e/fail-retry-path.test.js                    ← 新增：TEST FAIL → retry 完整路徑 E2E
  tests/integration/pre-task-parallel.test.js          ← 新增：並行 stage 的 PreToolUse 行為測試
```

## 每個測試檔的測試邊界

### tests/e2e/single-workflow.test.js

| 步驟 | Hook | 驗證項目 |
|:----:|------|---------|
| 1 | on-start.js | session 目錄存在 |
| 2 | init-workflow.js single | workflow.json 存在；workflowType = 'single'；stages = {DEV: pending} |
| 3 | pre-task.js（developer） | result: ''；state: DEV=active + activeAgents 有 developer；timeline: agent:delegate |
| 4 | on-stop.js（developer PASS） | state: DEV=completed；timeline: agent:complete + stage:complete |
| 5 | session/on-stop.js | 不 block；result 含完成摘要 |

### tests/e2e/standard-workflow.test.js

| 步驟 | Hook | 驗證項目 |
|:----:|------|---------|
| 1 | init-workflow standard | 8 個 stage（PLAN, ARCH, TEST, DEV, REVIEW, TEST:2, RETRO, DOCS）；TEST mode=spec, TEST:2 mode=verify |
| 2 | pre-task(planner) | PLAN=active |
| 3 | agent-stop(planner PASS) | PLAN=completed, currentStage=ARCH |
| 4 | pre-task(architect) | ARCH=active |
| 5 | agent-stop(architect PASS) | ARCH=completed, currentStage=TEST |
| 6 | pre-task(tester) | TEST=active（spec mode） |
| 7 | agent-stop(tester PASS) | TEST=completed, currentStage=DEV |
| 8 | pre-task(developer) | DEV=active |
| 9 | agent-stop(developer PASS) | DEV=completed, currentStage=REVIEW |
| 10 | pre-task(reviewer) + pre-task(tester) | REVIEW=active + TEST:2=active（並行） |
| 11 | agent-stop(reviewer PASS) | REVIEW=completed |
| 12 | agent-stop(tester PASS) | TEST:2=completed, 並行收斂 |
| 13-16 | RETRO + DOCS | 剩餘 stage 完成，所有 stage completed |

### tests/e2e/quick-workflow.test.js

| 步驟 | Hook | 驗證項目 |
|:----:|------|---------|
| 1 | init quick | 4 個 stage |
| 2-3 | pre-task + stop（DEV） | DEV completed |
| 4-7 | 並行 REVIEW + TEST | 兩者都 active → 依序完成 → 並行收斂偵測 |
| 8-9 | RETRO PASS | 所有完成 |

### tests/e2e/fail-retry-path.test.js

| 步驟 | Hook | 驗證項目 |
|:----:|------|---------|
| 1 | init quick | 建立 workflow |
| 2 | DEV PASS | DEV completed |
| 3 | TEST FAIL | failCount=1, result 含 DEBUGGER 提示 |
| 4 | agent-stop(debugger PASS)* | DEBUG 分析完成（注意：debugger 不在 quick stages 中，此為 retry 路徑 — state 不追蹤額外 stage，只驗 failCount） |
| 5 | agent-stop(developer PASS)* | DEV 修復完成 |
| 6 | agent-stop(tester PASS) | TEST PASS, failCount 仍為 1 |

*注意：retry 路徑中的 DEBUG + DEV 是 Main Agent 根據提示委派的，不在原始 workflow stages 中。E2E 測試只需驗證 failCount 正確、最終 TEST PASS 即可。

### tests/integration/pre-task-parallel.test.js

| 場景 | 驗證項目 |
|------|---------|
| DEV completed → 委派 code-reviewer → 放行 | REVIEW=active + activeAgents 有 code-reviewer |
| DEV completed → 委派 tester → 放行 | TEST=active + activeAgents 有 tester |
| DEV completed → 同時委派 reviewer + tester → 兩者都放行 | 兩個 activeAgents 都存在 |
| PLAN pending → 委派 developer → 阻擋 | deny + 訊息含 PLAN |
| `.test.js` 路徑在 prompt 中 → 不誤判為 tester | 回傳空 result（不阻擋、不設 tester 為 active） |

### tests/unit/identify-agent.test.js（修改）

新增測試案例：

| 場景 | 驗證項目 |
|------|---------|
| prompt 含 `tests/unit/foo.test.js` → 不匹配 tester | identifyAgent('', 'run tests/unit/foo.test.js') → null |
| prompt 含 `bun test` → 不匹配 tester | identifyAgent('', 'bun test src/') → null |
| desc 含 'tester' + prompt 含 `.test.js` → 仍正確匹配 tester | identifyAgent('delegate tester', 'run tests/foo.test.js') → 'tester' |
| desc 含 'run testing' → 匹配 tester | identifyAgent('run testing', '') → 'tester' |
| prompt 含完整名稱 'code-reviewer' → 仍匹配 | identifyAgent('', 'delegate code-reviewer') → 'code-reviewer' |

## 實作注意事項

### hook require 路徑

pre-task.js 和 on-stop.js 都在 `hooks/scripts/{subdir}/` 下，require 路徑為 `../../../scripts/lib/identify-agent`（三層上溯到 plugin 根再進 scripts/lib）。現有 hook 已大量使用此 pattern（如 `require('../../../scripts/lib/state')`），不需要額外調整。

### identifyAgent 修復的行為變更

修復後的行為差異：
- **不變**：description 中的 alias 匹配仍正常（`desc='run testing' → tester`）
- **不變**：prompt 中的精確 agent 名稱匹配仍正常（`prompt='delegate code-reviewer' → code-reviewer`）
- **變更**：prompt 中的 alias 短詞不再匹配（`prompt='bun test' → null`、`prompt='tests/foo.test.js' → null`）
- **影響評估**：正常使用中，Main Agent 委派時 description 欄位總是包含 agent 名稱或 alias（如 "委派 tester agent"），prompt 欄位是完整指令。alias 在 prompt 中匹配的正向案例（如 `prompt='please run testing'` 但 `desc` 為空）在實際使用中不會出現，因為 description 是必填且 Main Agent 會填入 agent 相關描述。

### test helper 的 env 處理

`tests/helpers/hook-runner.js` 統一提供環境變數處理（`OVERTONE_NO_DASHBOARD=1` 防止 on-start 啟動 Dashboard、移除 `CLAUDE_SESSION_ID` 防止干擾），所有 E2E 測試共用。

### 現有 507 個測試不可 break

Phase 0 完成後必須執行 `bun test` 確認所有現有測試通過。提取模組是純搬運（zero behavior change），唯一行為變更是 identifyAgent 的 alias 匹配範圍縮小，相關 unit test 同步更新。
