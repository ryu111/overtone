# 效能基線文件（Performance Baselines）

> 版本：v1.0（2026-03-07）
> 用途：記錄各關鍵元件的效能基線，作為退化偵測和 SLA 設定的依據。
> 更新方式：人工測量後直接更新此文件，或執行對應命令取得新數據。

---

## 1. 測試套件執行時間

### 1a. 並行模式（test-parallel.js）

| 指標 | 數值 | 測量時間 | 備註 |
|------|------|----------|------|
| 整體執行時間 | ~21s | 2026-03 | CPU 核心數：14，worker 數 = floor(14 * 3/4) = 10 |
| 測試數量 | 4724 | 2026-03 | 200 個檔案 |
| 警告閾值 | >30s | — | 超過表示測試集顯著增長或系統效能退化 |

執行命令：
```bash
bun scripts/test-parallel.js
```

### 1b. 單進程模式（bun test）

| 指標 | 數值 | 測量時間 | 備註 |
|------|------|----------|------|
| 整體執行時間 | ~53s | 2026-03 | 無並行加速 |
| 警告閾值 | >75s | — | 超過表示測試集顯著增長 |

執行命令：
```bash
bun test
```

### 1c. 重量級測試檔案基線

來源：`scripts/test-parallel.js` 中的 `KNOWN_WEIGHTS`（定期用 `--calibrate` 更新）。

| 檔案 | 基線（ms） |
|------|-----------|
| tests/integration/health-check.test.js | 11,293 |
| tests/unit/health-check.test.js | 8,808 |
| tests/integration/session-start.test.js | 6,609 |
| tests/integration/platform-alignment-session-end.test.js | 4,685 |
| tests/unit/session-start-handler.test.js | 4,446 |
| tests/unit/health-check-proactive.test.js | 3,399 |
| tests/integration/pre-compact.test.js | 2,461 |
| tests/integration/agent-on-stop.test.js | 1,335 |
| tests/e2e/full-workflow.test.js | 1,291 |
| tests/e2e/standard-workflow.test.js | 1,144 |

更新重量級基線：
```bash
bun scripts/test-parallel.js --calibrate
```

---

## 2. health-check.js 執行時間

| 指標 | 數值 | 目標 |
|------|------|------|
| 執行時間 | <5s | <5s |
| 偵測項目數 | 20 | — |

執行命令：
```bash
bun scripts/health-check.js
```

health-check 執行時間較長的原因：
- 需要掃描整個 codebase（files、exports、requires）
- 10+ 個靜態分析器並行執行
- 若超過 10s，檢查是否有文件掃描範圍異常擴大

---

## 3. statusline.js 執行時間

| 指標 | 數值 | 目標 |
|------|------|------|
| 執行時間 | <100ms | <100ms |
| 呼叫頻率 | 每次 Claude Code 渲染 status bar | — |

效能要求來源：`plugins/overtone/scripts/statusline.js` 第 18 行。

statusline.js 設計約束：
- 純本地讀取，無網路呼叫
- 只讀取 `~/.overtone/sessions/{sid}/statusline-state.json`（小型 JSON）
- 不做任何計算密集操作

若 statusline 執行超過 100ms，常見原因：
- `readFileSync` 路徑錯誤導致 try/catch overhead
- `statSync` 呼叫過多

---

## 4. Hook 執行時間預算

Claude Code 官方 hook timeout 設定（來自 hooks.json）：

| Hook 事件 | Timeout 設定 | 備註 |
|-----------|-------------|------|
| SessionStart | 未設定（平台預設） | 容忍較長，只執行一次 |
| SessionEnd | 未設定（平台預設） | 收尾操作 |
| PreCompact | 未設定（平台預設） | context 壓縮前 |
| UserPromptSubmit | 未設定（平台預設） | 需快速，避免阻塞用戶輸入 |
| PreToolUse（Task） | 未設定（平台預設） | 需快速，避免委派延遲 |
| PreToolUse（Write/Edit） | 未設定（平台預設） | 需快速，避免編輯延遲 |
| PreToolUse（Bash） | 未設定（平台預設） | 需快速，避免命令延遲 |
| SubagentStop | 未設定（平台預設） | 允許較長，記錄結果 |
| PostToolUse | 未設定（平台預設） | 觀察收集 |
| PostToolUseFailure | 未設定（平台預設） | 失敗記錄 |
| **TaskCompleted** | **60 秒** | 唯一明確設定 |
| Stop | 未設定（平台預設） | Loop 邏輯 |
| Notification | 未設定（平台預設） | 音效通知 |

### Hook 效能設計原則

1. **PreToolUse 類 hook**：目標 <500ms，避免阻塞工具執行
2. **SubagentStop**：允許 3-5s（需寫 state + emit timeline + 知識歸檔）
3. **Stop（Loop）**：允許 2-3s（需讀取 workflow.json + 決策是否繼續）
4. **UserPromptSubmit**：目標 <200ms（需快速返回避免輸入延遲感）

---

## 5. 更新頻率建議

| 基線類型 | 建議更新頻率 | 更新觸發條件 |
|----------|-------------|-------------|
| 測試套件時間 | 每月 | 測試數量增長 >10% |
| 重量級測試基線 | 每次重構測試後 | 用 `--calibrate` 自動更新 |
| health-check 時間 | 新增 check 時 | 偵測項目數量變化 |
| Hook timeout | hooks.json 變更時 | 有新增/修改 timeout 設定 |
