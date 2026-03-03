# Design：p3-1-perception

## 技術摘要（What & Why）

- **方案**：純 module（export only）+ JSON stdout 慣例
- **理由**：`screenshot.js` 和 `window.js` 都需要回傳結構化資料（路徑、視窗清單），fire-and-forget 的 sound.js 模式不適用。選擇對齊 `health-check.js` 的「module export + CLI entry point 可選」風格，但因 `scripts/os/` 腳本主要被 agent 作為工具呼叫而非被其他 JS 模組 require，預設只 export，由呼叫方選擇 CLI 或 module 用法。
- **取捨**：腳本不自動作為 CLI 入口（無 `if (require.main === module)` 區塊），因為 agent 透過 Bash tool 呼叫時用 `bun scripts/os/screenshot.js` 更直觀，但統一格式之後若需要 CLI 支援可輕易補齊。決定採用 **pure module + 頂層 CLI block**（與 health-check.js 一致），讓腳本既可被 require 也可直接執行。

## API 介面設計

### screenshot.js

```javascript
// 截圖選項型別
// type: 'full' | 'region' | 'window'
// outputPath?: string  — 省略時使用預設路徑規則
// region?: { x: number, y: number, width: number, height: number }
// windowId?: number   — screencapture -l <windowId>

// 成功回傳
// { ok: true, path: string, type: string, timestamp: string }

// 失敗回傳
// { ok: false, error: ErrorCode, message: string }

/**
 * 截取全螢幕截圖
 * @param {object} [opts]
 * @param {string} [opts.outputPath]
 * @returns {{ ok: boolean, path?: string, type?: string, timestamp?: string, error?: string, message?: string }}
 */
function captureFullScreen(opts)

/**
 * 截取區域截圖
 * @param {{ x: number, y: number, width: number, height: number }} region
 * @param {object} [opts]
 * @param {string} [opts.outputPath]
 * @returns {{ ok: boolean, path?: string, ... }}
 */
function captureRegion(region, opts)

/**
 * 截取指定視窗截圖
 * @param {number} windowId
 * @param {object} [opts]
 * @param {string} [opts.outputPath]
 * @returns {{ ok: boolean, path?: string, ... }}
 */
function captureWindow(windowId, opts)

/**
 * 偵測 Screen Recording 權限
 * @returns {{ ok: boolean, hasPermission: boolean, error?: string, message?: string }}
 */
function checkPermission()

module.exports = { captureFullScreen, captureRegion, captureWindow, checkPermission }
```

### window.js

```javascript
// 進程資訊型別
// { pid: number, name: string, bundleId?: string }

// 視窗資訊型別
// { windowId: number, title: string, app: string, bounds: { x, y, width, height }, isMinimized: boolean }

/**
 * 列出所有運行中的進程
 * @returns {{ ok: boolean, processes?: Array<ProcessInfo>, error?: string, message?: string }}
 */
function listProcesses()

/**
 * 列出指定應用程式的所有視窗
 * @param {string} appName  — 應用程式名稱（如 'Safari'、'Terminal'）
 * @returns {{ ok: boolean, windows?: Array<WindowInfo>, error?: string, message?: string }}
 */
function listWindows(appName)

/**
 * 聚焦（activate）指定應用程式
 * @param {string} appName
 * @returns {{ ok: boolean, error?: string, message?: string }}
 */
function focusApp(appName)

/**
 * 取得前景應用程式資訊
 * @returns {{ ok: boolean, app?: string, window?: string, error?: string, message?: string }}
 */
function getFrontApp()

/**
 * 偵測 Accessibility 權限
 * @returns {{ ok: boolean, hasPermission: boolean, error?: string, message?: string }}
 */
function checkAccessibility()

module.exports = { listProcesses, listWindows, focusApp, getFrontApp, checkAccessibility }
```

## 統一錯誤 Schema

所有 `scripts/os/` 腳本的 response 遵循以下統一格式：

```javascript
// 成功 response
{
  ok: true,
  // 各函式特定欄位...
  timestamp: string  // ISO 8601，僅 captureFullScreen/captureRegion/captureWindow 有此欄位
}

// 失敗 response
{
  ok: false,
  error: ErrorCode,   // 見下方錯誤碼表
  message: string     // 人類可讀的錯誤說明（繁體中文）
}
```

### 錯誤碼

| 錯誤碼 | 場景 |
|--------|------|
| `PERMISSION_DENIED` | Screen Recording 或 Accessibility 權限缺少 |
| `UNSUPPORTED_PLATFORM` | 非 macOS 平台（`process.platform !== 'darwin'`） |
| `COMMAND_FAILED` | `screencapture` 或 `osascript` 執行失敗（exitCode !== 0） |
| `INVALID_ARGUMENT` | 輸入參數無效（如 region 缺少 x/y/width/height） |
| `OSASCRIPT_PARSE_ERROR` | osascript 輸出無法解析為預期格式 |

### 非 darwin 平台行為

平台不是 darwin 時，所有函式回傳：

```javascript
{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }
```

不拋出例外，不呼叫 process.exit。

## 儲存策略

### 截圖預設路徑規則

```
預設存放目錄：/tmp/overtone-screenshots/
命名格式：screenshot-{type}-{timestamp}.png
  - type: full | region | window
  - timestamp: YYYYMMDD-HHmmss-SSS（含毫秒避免碰撞）

範例：
  /tmp/overtone-screenshots/screenshot-full-20260303-143052-123.png
  /tmp/overtone-screenshots/screenshot-window-20260303-143053-456.png
```

### 自動清理策略

不在腳本內實作自動清理（保持腳本職責單一）。目錄若不存在則在截圖前用 `mkdirSync({ recursive: true })` 建立。呼叫方若需要清理，在完成後自行刪除檔案。

理由：/tmp 本身會被 OS 定期清理；主動清理可能誤刪呼叫方還在使用的截圖；agent 任務通常在取得截圖後立即用 Read tool 分析，不需要長期保留。

### 呼叫方傳入 outputPath

所有截圖函式接受可選的 `opts.outputPath`，傳入時使用指定路徑，省略時走預設規則。

## 測試策略

### 依賴注入方式

腳本接受可選的 `_deps` 參數（最後一個參數）用於測試注入。正式呼叫時省略此參數，腳本內部 `require('child_process')` 和 `require('fs')`。

```javascript
// 正式呼叫
captureFullScreen()
captureFullScreen({ outputPath: '/tmp/test.png' })

// 測試呼叫（注入 mock）
captureFullScreen({}, {
  execSync: mockExecSync,
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
})
```

理由：與 sound.js 的 `Object.defineProperty(process, 'platform')` 模式不同，OS 腳本需要 mock 更多外部依賴（execSync、fs 操作），依賴注入比 module-level mock 更清晰、不影響其他測試。

### 測試覆蓋範圍

**screenshot.test.js**：
- 非 darwin 平台回傳 `UNSUPPORTED_PLATFORM`（不 throw）
- `checkPermission()` 失敗時回傳 `PERMISSION_DENIED`
- `captureFullScreen()` 成功時產生正確的 screencapture 命令（`-x -t png`）
- `captureRegion()` 成功時產生正確的 `-R x,y,w,h` 參數
- `captureWindow()` 成功時產生正確的 `-l windowId` 參數
- outputPath 傳入時使用指定路徑
- outputPath 省略時使用預設路徑規則（含 timestamp 格式驗證）
- execSync 拋出例外時回傳 `COMMAND_FAILED`

**window.test.js**：
- 非 darwin 平台回傳 `UNSUPPORTED_PLATFORM`（不 throw）
- `checkAccessibility()` 偵測失敗時回傳 `PERMISSION_DENIED`
- `listProcesses()` 成功時正確解析 osascript 輸出（含多個進程）
- `listWindows()` 成功時正確解析視窗資訊（id、title、bounds）
- `focusApp()` 成功時回傳 `{ ok: true }`
- `getFrontApp()` 成功時回傳 app 和 window 名稱
- osascript 失敗時回傳 `COMMAND_FAILED`
- osascript 輸出格式異常時回傳 `OSASCRIPT_PARSE_ERROR`

### 測試隔離

使用 `_deps` 注入，不使用 `Object.defineProperty` mock `child_process` 模組（會影響全域 module cache，導致測試間相互干擾）。platform 仍用 `Object.defineProperty(process, 'platform')` mock，原因是它是純屬性覆蓋，不影響其他模組。

## Dead-exports 整合

`scripts/os/screenshot.js` 和 `scripts/os/window.js` 位於 `scripts/os/`，不在 `dead-code-scanner.js` 掃描的 `scripts/lib/` 範圍內，因此不會被 dead-exports 偵測掃描。

不需要新增白名單。若未來 developer 把這些腳本移到 `scripts/lib/`，則需要在 `dead-code-scanner.js` 的 `ENTRY_POINT_BASENAMES` 加入 `screenshot` 和 `window`。

## 檔案結構

```
新增的檔案：
  plugins/overtone/scripts/os/screenshot.js     ← 新增：screencapture CLI wrapper
  plugins/overtone/scripts/os/window.js          ← 新增：AppleScript 視窗查詢 + 聚焦
  tests/unit/screenshot.test.js                  ← 新增：screenshot.js 單元測試
  tests/unit/window.test.js                      ← 新增：window.js 單元測試

修改的檔案：
  plugins/overtone/skills/os-control/references/perception.md  ← 填充：完整 API reference
  plugins/overtone/skills/os-control/SKILL.md                  ← 更新：perception.md 標記已完成
```

## 關鍵技術決策

### 決策 1：腳本介面風格 — pure module vs CLI

- **選項 A**（選擇）：pure module + 可選 CLI block（`if (require.main === module)`）— 對齊 health-check.js 風格；既可被 agent require 呼叫取得結構化回傳值，也可直接 `bun screenshot.js --full` 執行；不強制每個腳本都實作 CLI 解析，developer 視需要加入。
- **選項 B**（未選）：純 CLI（只能透過 spawn 呼叫、解析 stdout）— 無法被其他 JS 模組直接 require，增加 agent 整合複雜度。

### 決策 2：截圖預設路徑 — /tmp vs 呼叫方傳入

- **選項 A**（選擇）：預設 `/tmp/overtone-screenshots/`，呼叫方可覆蓋 outputPath — /tmp 跨工作目錄一致、OS 自動清理、agent 不需要管理路徑；同時保留 outputPath 覆蓋能力讓測試可注入固定路徑。
- **選項 B**（未選）：強制呼叫方傳入 outputPath — 讓簡單的「截圖並分析」場景需要額外指定路徑，增加使用摩擦。

### 決策 3：osascript 測試隔離 — _deps 注入 vs module mock

- **選項 A**（選擇）：`_deps` 最後參數注入 — 每個測試 case 完全控制依賴，無全域 module cache 副作用，不需要 `jest.mock` / `bun:test` 的 mock 重置。
- **選項 B**（未選）：`bun:test` mock (`mock.module`) — 需要在每個 describe 前後 restore，容易導致測試順序相依；Bun 的 module mock API 與 Node Jest 有差異，增加測試維護成本。

### 決策 4：window.js 部分功能是否需要 Accessibility 權限

- **選項 A**（選擇）：`listProcesses()` 和 `getFrontApp()` 不需要 Accessibility 權限（用 `System Events` 的基本屬性即可）；`listWindows(appName)` 需要。各函式各自偵測所需權限，只在真正需要時才報告 `PERMISSION_DENIED`。
- **選項 B**（未選）：所有 window.js 函式統一先做 `checkAccessibility()`，失敗就全部不執行 — 過於保守，會讓不需要權限的功能也失效。

### 決策 5：CLI 呼叫時輸出格式

- CLI block 中，所有腳本用 `process.stdout.write(JSON.stringify(result, null, 2) + '\n')` 輸出；失敗（ok: false）時 exit code 為 1，成功（ok: true）時 exit code 為 0。
- 這讓 agent 用 Bash tool 呼叫時可直接解析 stdout，並透過 exit code 判斷成功失敗。

## 實作注意事項

給 developer 的提醒：

1. **screencapture 的 Screen Recording 偵測**：直接嘗試 `screencapture -x /tmp/test.png` 並判斷 exit code 是最可靠的方式，因為 macOS 沒有直接查詢 Screen Recording 權限的 CLI 工具。若 exit code 非 0 或輸出文件大小為 0，判定為權限不足。

2. **osascript 輸出格式**：AppleScript 的輸出是 newline-separated 或 comma-separated 的字串，需要手動 parse。`listWindows` 需要用 AppleScript 遍歷 `System Events` 的 `windows` property，輸出格式在 perception.md reference 中定義。

3. **window ID 與 screencapture -l**：`screencapture -l` 要求的是 CGWindowID（不是 AppleScript window index）。需要透過 `CGWindowListCopyWindowInfo` 或 `osascript -e 'tell app "System Events" to get id of window 1 of process "..."'` 取得正確的 window ID。若無法取得 CGWindowID，`captureWindow` 可回傳 `INVALID_ARGUMENT`。

4. **_deps 預設值**：腳本頂部定義 `const DEFAULT_DEPS = { execSync: require('child_process').execSync, existsSync: require('fs').existsSync, mkdirSync: require('fs').mkdirSync }`，每個函式用 `const deps = { ...DEFAULT_DEPS, ..._deps }` merge，避免每個函式重複寫 require。

5. **`'use strict'` + `require`**：沿用 Bun 專案的 CommonJS 風格（`require` / `module.exports`），不使用 ESM `import`，與現有所有腳本一致。
