# 操控層（R3.4 — L3 感知操控）

## 動機（Why）

- **問題**：OS 腳本（R3.3）提供「看得到」（截圖）和「知道狀態」（系統資訊），但無法「動手做」——不能模擬鍵盤輸入、滑鼠點擊、執行 AppleScript，也沒有視覺型 UI 操控迴圈
- **目標**：4 個操控腳本，讓 Nova 能模擬人類操作 macOS GUI——按鍵盤、點滑鼠、執行 AppleScript、截圖→理解→操作→驗證
- **不做的代價**：Nova 只能讀取 OS 狀態但無法操作，L3「操控」能力不完整，L4 通用代理人的「直接操控電腦」無法實現

## 範圍

### In-scope

- keyboard.js：按鍵 / 快捷鍵 / 文字輸入（osascript System Events）
- mouse.js：點擊 / 拖曳 / 滾動（cliclick CLI 工具）
- applescript.js：AppleScript / JXA 執行引擎
- computer-use.js：截圖 → 理解 → 操作 → 驗證迴圈

### Out-of-scope

- Linux / Windows 支援（macOS only）
- 圖像辨識 / OCR（依賴 Claude 多模態 + Read tool）
- 複雜的 UI 自動化框架（XCUITest 等）
- cliclick 自動安裝（需使用者預先安裝）

## 使用者故事

身為 Nova 系統（透過心跳引擎 spawn 的 session），我想要能模擬鍵盤和滑鼠操作，以便自主操控 macOS GUI 完成任務。

身為 Nova 系統，我想要 computer-use 迴圈能截圖→理解畫面→決定操作→驗證結果，以便在無人介入下操控任意 GUI 應用程式。

## 行為規格

### 正常路徑

#### keyboard.js
1. `keystroke('hello')` → osascript System Events → 模擬鍵入 "hello"
2. `hotkey('command', 'c')` → osascript key code + modifier → 模擬 Cmd+C
3. `typeText('long text', { delay: 50 })` → 逐字輸入 + 延遲

#### mouse.js
1. `click(x, y)` → cliclick `c:x,y`
2. `doubleClick(x, y)` → cliclick `dc:x,y`
3. `drag(fromX, fromY, toX, toY)` → cliclick `dd:x1,y1 du:x2,y2`
4. `scroll(x, y, amount)` → cliclick 捲動

#### applescript.js
1. `run(script)` → `osascript -e '{script}'` → 回傳文字輸出
2. `runJXA(script)` → `osascript -l JavaScript -e '{script}'` → 回傳 JSON
3. `runFile(path)` → `osascript {path}` → 回傳輸出

#### computer-use.js
1. `executeAction(goal)` → 截圖 → 分析畫面 → 決定操作 → 執行操作 → 截圖驗證
2. 迴圈最多 N 輪（預設 10），直到目標達成或放棄

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| 非 macOS 平台 | `{ ok: false, error: 'UNSUPPORTED_PLATFORM' }` |
| Accessibility 權限不足 | `{ ok: false, error: 'PERMISSION_DENIED' }` |
| cliclick 未安裝 | `{ ok: false, error: 'DEPENDENCY_MISSING', message: 'cliclick not found' }` |
| AppleScript 語法錯誤 | `{ ok: false, error: 'SCRIPT_ERROR', message }` |
| computer-use 迴圈超限 | `{ ok: false, error: 'MAX_ROUNDS_EXCEEDED' }` |
| 無效座標（負數） | `{ ok: false, error: 'INVALID_ARGUMENT' }` |

### 邊界條件

- keyboard.keystroke 空字串 → `{ ok: false, error: 'INVALID_ARGUMENT' }`
- mouse.click 座標 (0, 0) → 允許（左上角有效）
- mouse.click 負座標 → `{ ok: false, error: 'INVALID_ARGUMENT' }`
- applescript.run 空字串 → `{ ok: false, error: 'INVALID_ARGUMENT' }`
- computer-use 第一輪截圖失敗 → 立即退出

## 資料模型

### 統一回傳格式

同 OS 腳本（R3.3）：`{ ok: true, ... } | { ok: false, error, message }`

新增 Error Code：
- `DEPENDENCY_MISSING`：外部工具未安裝（cliclick）
- `SCRIPT_ERROR`：AppleScript / JXA 執行錯誤
- `MAX_ROUNDS_EXCEEDED`：computer-use 迴圈超限

### computer-use 迴圈記錄

```json
{
  "rounds": [
    {
      "round": 1,
      "screenshot": "/tmp/cu-round-1.png",
      "analysis": "看到登入畫面，需要輸入密碼",
      "action": { "type": "keyboard", "params": { "text": "password123" } },
      "result": "success"
    }
  ],
  "goal": "登入 Dashboard",
  "finalStatus": "achieved" | "failed" | "exceeded"
}
```

### 儲存

- computer-use 截圖：`/tmp/overtone-computer-use/round-{N}.png`
- 無其他持久化狀態

## 介面契約

### keyboard.js

```javascript
export function keystroke(text, _deps?) → OsResult<{}>
export function hotkey(modifier, key, _deps?) → OsResult<{}>
// modifier: 'command' | 'control' | 'option' | 'shift' | 組合如 'command+shift'
export function typeText(text, opts?, _deps?) → OsResult<{}>
// opts: { delay?: number } — 每字延遲（ms），預設 50
```

### mouse.js

```javascript
export function click(x, y, _deps?) → OsResult<{}>
export function doubleClick(x, y, _deps?) → OsResult<{}>
export function rightClick(x, y, _deps?) → OsResult<{}>
export function drag(fromX, fromY, toX, toY, _deps?) → OsResult<{}>
export function scroll(x, y, amount, _deps?) → OsResult<{}>
// amount > 0 = 向上, amount < 0 = 向下
export function checkCliclick(_deps?) → OsResult<{ installed: boolean, path: string }>
```

### applescript.js

```javascript
export function run(script, _deps?) → OsResult<{ output: string }>
export function runJXA(script, _deps?) → OsResult<{ output: any }>
export function runFile(filePath, _deps?) → OsResult<{ output: string }>
```

### computer-use.js

```javascript
export async function executeAction(goal, opts?, _deps?) → ComputerUseResult
// opts: { maxRounds?: number, screenshotFn?, analyzeFn?, actionFns? }
// ComputerUseResult: { ok, rounds: Round[], finalStatus: 'achieved'|'failed'|'exceeded' }
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | keyboard/mouse 操作 < 200ms |
| 安全 | 不自動安裝 cliclick（需使用者授權） |
| 安全 | Accessibility 權限前置檢查 |
| 可測試性 | 所有函式 `_deps` DI |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | macOS System Events | keyboard/mouse 操作 |
| 上游 | cliclick | 滑鼠操控（外部 CLI 工具） |
| 上游 | osascript | AppleScript / JXA 執行 |
| 上游 | screenshot.js（R3.3） | computer-use 截圖 |
| 上游 | Claude 多模態 | computer-use 畫面理解 |
| 下游 | 心跳引擎 spawn 的 session | 消費操控能力 |

## 驗收標準

- [ ] 4 個腳本存在於 `~/.claude/scripts/os/`
- [ ] keyboard.keystroke / hotkey / typeText 在 macOS 正確執行
- [ ] mouse.click / drag / scroll 透過 cliclick 正確執行
- [ ] cliclick 未安裝時回傳 DEPENDENCY_MISSING
- [ ] applescript.run / runJXA / runFile 正確執行 AppleScript/JXA
- [ ] computer-use.executeAction 完成截圖→操作迴圈
- [ ] 所有函式遵循統一回傳格式
- [ ] `bun test` 所有操控層測試通過

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| cliclick 未安裝（使用者環境） | 高 | 中 | checkCliclick() 前置檢查 + 安裝指引 |
| Accessibility 權限未授予 | 高 | 高 | keyboard/mouse 操作前呼叫 checkAccessibility |
| computer-use 迴圈陷入死循環 | 中 | 中 | maxRounds 限制（預設 10 輪） |
| AppleScript 注入攻擊（使用者提供的 script） | 低 | 高 | applescript.run 只接受字串，不做字串拼接 |
