# Design: Hook Humble Object 重構

## 技術摘要（What & Why）

- **方案**：採用 Humble Object 模式，為每個 hook 腳本加入 `require.main === module` 守衛 + `module.exports` 純函數匯出
- **理由**：hook 測試目前須透過 `Bun.spawnSync` 啟動子進程（~500ms/次），session-start.test.js 單檔耗時 11.7s。Humble Object 讓測試直接 `require()` 純函數，跳過子進程開銷
- **取捨**：不抽離新的 lib 模組（避免過度設計），業務邏輯就地拆成可匯出的函數；只重構 11 個還沒有守衛的 hook，`agent/on-stop.js` 和 `tool/post-use.js` 已完成不需動

### 現狀分析

**已完成（不動）：**
- `agent/on-stop.js`：有 `if (require.main === module)` + `module.exports = {}`
- `tool/post-use.js`：有 `if (require.main === module)` + `module.exports = { ... }`
- `tool/post-use-failure.js`：有 `if (require.main === module)` 守衛

**需要重構（11 個）：**
1. `session/on-start.js`
2. `session/on-stop.js`（Loop Stop）
3. `session/pre-compact.js`
4. `session/on-session-end.js`
5. `prompt/on-submit.js`
6. `tool/pre-task.js`
7. `tool/pre-edit-guard.js`
8. `tool/pre-bash-guard.js`
9. `task/on-task-completed.js`
10. `notification/on-notification.js`

### 各 Hook 可匯出的純函數

| Hook | 匯出函數 | 說明 |
|------|---------|------|
| `session/on-start.js` | `buildBanner(pkg, sessionId, port, deps)` | 組裝 banner 字串 |
| `session/on-start.js` | `buildStartOutput(input, options)` | 組裝完整 output（result + systemMessage） |
| `session/on-stop.js` | `buildCompletionSummary(ws, stages)` | 組裝完成摘要（已存在，只需匯出） |
| `session/on-stop.js` | `calcDuration(startIso)` | 計算耗時（已存在，只需匯出） |
| `session/on-stop.js` | `buildContinueMessage(loopState, stageStatuses, tasksStatus, stages, loopDefaults, nextHint)` | 組裝 loop 繼續訊息 |
| `session/pre-compact.js` | `buildCompactMessage(currentState, pendingMsg, queueSummary, stages, parallelGroups)` | 組裝壓縮恢復訊息 |
| `session/on-session-end.js` | 無（全是副作用，僅加守衛） | — |
| `prompt/on-submit.js` | `buildSystemMessage(userPrompt, currentState, validWorkflowOverride, activeFeatureContext, workflows)` | 組裝 systemMessage |
| `tool/pre-task.js` | `checkSkippedStages(currentState, targetStage, stages)` | 偵測跳過階段 |
| `tool/pre-task.js` | `buildUpdatedPrompt(parts)` | 組裝注入後的 prompt |
| `tool/pre-edit-guard.js` | `checkProtected(filePath, pluginRoot)` | 檢查受保護路徑（返回 match 或 null） |
| `tool/pre-edit-guard.js` | `checkMemoryLineLimit(filePath, toolName, toolInput)` | 檢查 MEMORY.md 行數 |
| `tool/pre-bash-guard.js` | `checkDangerousCommand(command)` | 檢查危險命令（返回 label 或 null） |
| `task/on-task-completed.js` | 無（純計時邏輯，僅加守衛） | — |
| `notification/on-notification.js` | `shouldPlaySound(notificationType, soundTypes)` | 判斷是否播音 |

## API 介面設計

### session/on-start.js 匯出

```javascript
// 組裝 banner 字串（純函數）
function buildBanner(version, sessionId, port, deps)
// deps = { agentBrowserStatus, ghStatus, grayMatterStatus }
// Returns: string

// 組裝完整 on-start output（純函數，不含副作用）
// 不含：mkdirSync、timeline.emit、state.sanitize、spawn Dashboard、appendFileSync
function buildStartOutput(input, { version, pendingTasksMsg, globalObservationsMsg,
                                   baselineSummaryMsg, scoreSummaryMsg,
                                   failureSummaryMsg, queueMsg })
// Returns: { result: string, systemMessage?: string }
```

### session/on-stop.js（Loop Stop）匯出

```javascript
// 已存在的 helper，改為匯出
function buildCompletionSummary(ws, stages) // Returns: string
function calcDuration(startIso)             // Returns: string（如 "2m 30s"）

// 新增：組裝 loop 繼續訊息（純函數）
function buildContinueMessage({ iteration, maxIterations, completedStages, totalStages,
                                progressBar, tasksStatus, hint })
// Returns: string
```

### session/pre-compact.js 匯出

```javascript
// 組裝壓縮恢復訊息（純函數）
function buildCompactMessage({ currentState, pendingMsg, queueSummary, stages, parallelGroups,
                               MAX_MESSAGE_LENGTH })
// Returns: string（已截斷）
```

### prompt/on-submit.js 匯出

```javascript
// 組裝 systemMessage（純函數）
function buildSystemMessage({ userPrompt, currentState, validWorkflowOverride,
                              activeFeatureContext, workflows })
// Returns: string
```

### tool/pre-edit-guard.js 匯出

```javascript
// 檢查受保護路徑，返回匹配的規則或 null
function checkProtected(filePath, pluginRoot)
// Returns: { label: string, api: string } | null

// 檢查 MEMORY.md 行數限制
function checkMemoryLineLimit(filePath, toolName, toolInput, limit)
// Returns: { exceeded: boolean, estimatedLines: number }
```

### tool/pre-bash-guard.js 匯出

```javascript
// 檢查命令是否在黑名單，返回危險類別或 null
function checkDangerousCommand(command)
// Returns: string | null（如 '刪除根目錄' 或 null）
```

### tool/pre-task.js 匯出

```javascript
// 偵測跳過的必要前置 stage
function checkSkippedStages(currentState, targetStage, stages)
// Returns: string[]（被跳過的 stage 描述）
```

### notification/on-notification.js 匯出

```javascript
// 判斷通知類型是否應播音
function shouldPlaySound(notificationType, soundTypes)
// Returns: boolean
```

## 資料模型

無新增資料模型。hook 間的資料流維持現有協定：
- stdin：JSON（Claude Code 提供）
- stdout：JSON（hook 回傳給 Claude Code）

Hook output 格式（不變）：
```javascript
// 一般回傳
{ result: string, systemMessage?: string }

// PreToolUse 阻擋
{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: string } }

// PreToolUse 修改輸入
{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: object } }

// Stop hook block
{ decision: 'block', reason: string }
```

## 檔案結構

```
修改的 hook 入口（加入守衛 + 匯出）：
  plugins/overtone/hooks/scripts/session/on-start.js      ← 加守衛 + buildBanner/buildStartOutput 匯出
  plugins/overtone/hooks/scripts/session/on-stop.js       ← 加守衛 + buildCompletionSummary/calcDuration/buildContinueMessage 匯出
  plugins/overtone/hooks/scripts/session/pre-compact.js   ← 加守衛 + buildCompactMessage 匯出
  plugins/overtone/hooks/scripts/session/on-session-end.js← 加守衛（無可測純函數）
  plugins/overtone/hooks/scripts/prompt/on-submit.js      ← 加守衛 + buildSystemMessage 匯出
  plugins/overtone/hooks/scripts/tool/pre-task.js         ← 加守衛 + checkSkippedStages 匯出
  plugins/overtone/hooks/scripts/tool/pre-edit-guard.js   ← 加守衛 + checkProtected/checkMemoryLineLimit 匯出
  plugins/overtone/hooks/scripts/tool/pre-bash-guard.js   ← 加守衛 + checkDangerousCommand 匯出
  plugins/overtone/hooks/scripts/task/on-task-completed.js← 加守衛（無可測純函數）
  plugins/overtone/hooks/scripts/notification/on-notification.js ← 加守衛 + shouldPlaySound 匯出

不需修改：
  plugins/overtone/hooks/scripts/agent/on-stop.js         ← 已有守衛
  plugins/overtone/hooks/scripts/tool/post-use.js         ← 已有守衛
  plugins/overtone/hooks/scripts/tool/post-use-failure.js ← 已有守衛

修改的測試（spawn → require 混合模式）：
  tests/integration/session-start.test.js   ← 新增純函數直接測試（保留 spawn 驗証外部行為）
  tests/integration/pre-compact.test.js     ← 新增 buildCompactMessage 直接測試
  tests/integration/on-submit.test.js       ← 新增 buildSystemMessage 直接測試
  tests/integration/pre-task.test.js        ← 新增 checkSkippedStages 直接測試
  （其餘測試為純副作用型，保持 spawn 不變）

新增的測試（純函數單元測試）：
  tests/unit/hook-pure-fns.test.js          ← checkDangerousCommand/checkProtected/checkMemoryLineLimit/shouldPlaySound 等純函數
```

## 關鍵技術決策

### 決策 1：就地匯出 vs 抽離到新模組

- **就地匯出**（選擇）：在現有 hook 檔案底部加 `module.exports = { pureFn }`，不建新檔案。優點：改動最小、不引入新依賴路徑、符合「30 行以下邏輯不值得獨立模組」原則
- **抽離到 hooks/scripts/lib/（未選）**：需要新建 6-10 個小模組，每個只有一兩個函數，過度設計且增加維護負擔

### 決策 2：測試策略：全換 require vs spawn + require 混合

- **spawn + require 混合**（選擇）：保留 spawn 做端到端驗証（外部行為不變），新增 require 做業務邏輯單元測試。大型 I/O 場景（session-start 的 mkdirSync、timeline.emit）繼續靠 spawn 驗証
- **全換 require（未選）**：需要 mock 所有 I/O（state、timeline、fs），增加測試複雜度，且失去端到端信心

### 決策 3：哪些函數值得匯出

- **有決策邏輯的函數**（匯出）：`checkDangerousCommand`、`checkProtected`、`checkMemoryLineLimit`、`buildSystemMessage`、`buildCompactMessage`、`checkSkippedStages`、`shouldPlaySound`
- **純副作用函數**（不匯出）：`mkdirSync`、`timeline.emit`、`spawn`、`appendFileSync` — 這些在已有的整合測試中由 spawn 覆蓋
- **on-session-end / on-task-completed**（僅加守衛）：邏輯全是副作用，無法孤立測試，只加守衛供 `require()` 不執行副作用

### 決策 4：`session/on-stop.js` 的既有 helper 函數（`buildCompletionSummary`、`calcDuration`）

- 這兩個函數已存在於 on-stop.js 中，**直接匯出**即可（移至 `module.exports`）
- 新增 `buildContinueMessage` 抽離 loop 繼續訊息的字串組裝邏輯

## 實作注意事項

給 developer 的提醒：

1. **守衛語法**：使用 `if (require.main === module) { safeRun(() => { ... }); }` 而非直接 `safeRun(() => { ... })`；確保 `require()` 時不執行任何副作用
2. **session/on-start.js 的 projectRoot 變數位置**：目前 `projectRoot` 在 `safeRun` 裡面宣告於使用後（L211），重構時注意變數宣告順序，不要在純函數中引入全域副作用
3. **module.exports 位置**：放在檔案最底部，`safeRun` 守衛之後
4. **測試隔離**：純函數測試不需要 session 目錄或 timeline 檔案，直接呼叫函數並斷言回傳值
5. **on-stop.js（Loop Stop）的 `buildCompletionSummary` 已是 file-scope**：直接在 `module.exports` 加上即可，不需移動程式碼
6. **外部行為不變**：所有 hook 的 stdin/stdout JSON 協定保持不變，hooks.json 不需修改
